const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const app = express();
app.use(express.json());

// --- ISPRAVNE STATIČKE RUTE ---
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use(express.static(path.join(__dirname, "html")));

const dataDir = path.join(__dirname, "data");
const projectsFile = path.join(dataDir, "projects.json");
const userFile = path.join(dataDir, "user.json");

const allowedContacts = new Set(["email", "sms", "none"]);
const allowedFrequencies = new Set(["Daily", "Weekly", "Monthly", "Never"]);

async function ensureDataDir() {
    await fsp.mkdir(dataDir, { recursive: true });
}

async function writeJson(filePath, data) {
    await ensureDataDir();
    await fsp.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function readJson(filePath, fallbackFactory) {
    await ensureDataDir();
    try {
        const raw = await fsp.readFile(filePath, "utf8");
        return JSON.parse(raw);
    } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) {
            throw error;
        }
        const fallback = typeof fallbackFactory === "function" ? fallbackFactory() : fallbackFactory;
        if (fallback === undefined) return null;
        await writeJson(filePath, fallback);
        return fallback;
    }
}

function clampNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const clampedMin = Number.isFinite(min) ? Math.max(parsed, min) : parsed;
    const clamped = Number.isFinite(max) ? Math.min(clampedMin, max) : clampedMin;
    return Math.round(clamped);
}

function normalizeString(value, fallback, maxLength) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (!Number.isFinite(maxLength)) return trimmed;
    return trimmed.slice(0, maxLength);
}

function nowIso() {
    return new Date().toISOString();
}

function defaultProjectsData() {
    const now = Date.now();
    return {
        lastId: 4,
        items: [
            { id: 1, title: "Sjecanje na rijeku", genre: "Drama / Dugometrazni film", status: "Druga verzija scenarija", pages: 98, lastEdited: new Date(now - 3 * 60 * 60 * 1000).toISOString(), active: true },
            { id: 2, title: "Na kraju ulice", genre: "Kriminalisticki film / Sarajevo", status: "Sinopsis zavrsen", pages: 14, lastEdited: new Date(now - 24 * 60 * 60 * 1000).toISOString(), active: false },
            { id: 3, title: "Iza planine", genre: "Psiholoski triler / Kratki film", status: "Zavrsna lektura", pages: 25, lastEdited: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(), active: false },
            { id: 4, title: "Ljeto u Mostaru", genre: "Romanticna drama / Dugometrazni film", status: "U fazi produkcije", pages: 110, lastEdited: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), active: false }
        ]
    };
}

function defaultUserData() {
    return { id: 1, name: "Alex Writer", email: "alex.writer@example.com", itemsPerPage: 25, twoFactorEnabled: false, preferredContact: "email", notificationFrequency: "Daily", plan: "Pro member", updatedAt: nowIso(), passwordUpdatedAt: null };
}

function matchesQuery(project, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    return [project.title, project.genre, project.status].filter(Boolean).some(value => value.toLowerCase().includes(q));
}

function projectListResponse(items) {
    return [...items].sort((a, b) => {
        if (a.active && !b.active) return -1;
        if (!a.active && b.active) return 1;
        return Date.parse(b.lastEdited || 0) - Date.parse(a.lastEdited || 0);
    });
}

function buildProject(id, input, hasActive) {
    const title = normalizeString(input.title, "Novi projekat", 120);
    const genre = normalizeString(input.genre, "Nedefinisano", 160);
    const status = normalizeString(input.status, "Novi projekat", 160);
    const pages = clampNumber(input.pages, 1, 1, 9999);
    const shouldBeActive = input.active === true || (input.makeActive === true);
    return { id, title, genre, status, pages, lastEdited: nowIso(), active: shouldBeActive || (!hasActive && input.active !== false) };
}

function applyProjectUpdates(project, updates) {
    project.title = normalizeString(updates.title, project.title, 120);
    project.genre = normalizeString(updates.genre, project.genre, 160);
    project.status = normalizeString(updates.status, project.status, 160);
    project.pages = clampNumber(updates.pages, project.pages, 1, 9999);
    project.lastEdited = nowIso();
}

function buildUserResponse(user) {
    return { id: user.id, name: user.name, email: user.email, itemsPerPage: user.itemsPerPage, twoFactorEnabled: user.twoFactorEnabled, preferredContact: user.preferredContact, notificationFrequency: user.notificationFrequency, plan: user.plan, updatedAt: user.updatedAt, passwordUpdatedAt: user.passwordUpdatedAt };
}

function applyUserUpdates(user, updates) {
    if (typeof updates.name === "string") user.name = normalizeString(updates.name, user.name, 120);
    if (typeof updates.email === "string") user.email = normalizeString(updates.email, user.email, 200);
    if (updates.itemsPerPage !== undefined) user.itemsPerPage = clampNumber(updates.itemsPerPage, user.itemsPerPage, 1, 100);
    if (updates.twoFactorEnabled !== undefined) user.twoFactorEnabled = Boolean(updates.twoFactorEnabled);
    if (typeof updates.preferredContact === "string" && allowedContacts.has(updates.preferredContact.toLowerCase())) user.preferredContact = updates.preferredContact.toLowerCase();
    if (typeof updates.notificationFrequency === "string" && allowedFrequencies.has(updates.notificationFrequency.trim())) user.notificationFrequency = updates.notificationFrequency.trim();
    if (typeof updates.password === "string" && updates.password.trim().length >= 6) user.passwordUpdatedAt = nowIso();
    user.updatedAt = nowIso();
}

app.get("/", (req, res) => res.redirect("/projects.html"));

app.get("/api/projects", async (req, res) => {
    try {
        const data = await readJson(projectsFile, defaultProjectsData);
        const query = normalizeString(req.query.q, "", 80).toLowerCase();
        const filtered = data.items.filter(project => matchesQuery(project, query));
        res.status(200).json({ items: projectListResponse(filtered), total: filtered.length });
    } catch (error) { res.status(500).json({ message: "Greska na serveru!" }); }
});

app.post("/api/projects", async (req, res) => {
    try {
        const data = await readJson(projectsFile, defaultProjectsData);
        const hasActive = data.items.some(project => project.active);
        const newId = data.lastId + 1;
        const project = buildProject(newId, req.body || {}, hasActive);
        if (project.active) data.items.forEach(item => item.active = false);
        data.items.push(project);
        data.lastId = newId;
        await writeJson(projectsFile, data);
        res.status(201).json(project);
    } catch (error) { res.status(500).json({ message: "Greska na serveru!" }); }
});

app.put("/api/projects/:id", async (req, res) => {
    try {
        const data = await readJson(projectsFile, defaultProjectsData);
        const project = data.items.find(item => item.id === parseInt(req.params.id, 10));
        if (!project) return res.status(404).json({ message: "Projekt ne postoji!" });
        applyProjectUpdates(project, req.body || {});
        if (req.body.active === true) data.items.forEach(item => item.active = (item.id === project.id));
        else if (req.body.active === false) project.active = false;
        await writeJson(projectsFile, data);
        res.status(200).json(project);
    } catch (error) { res.status(500).json({ message: "Greska na serveru!" }); }
});

app.get("/api/user", async (req, res) => {
    try {
        const user = await readJson(userFile, defaultUserData);
        res.status(200).json(buildUserResponse(user));
    } catch (error) { res.status(500).json({ message: "Greska na serveru!" }); }
});

app.put("/api/user", async (req, res) => {
    try {
        const user = await readJson(userFile, defaultUserData);
        applyUserUpdates(user, req.body || {});
        await writeJson(userFile, user);
        res.status(200).json(buildUserResponse(user));
    } catch (error) { res.status(500).json({ message: "Greska na serveru!" }); }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log("Server radi na portu " + PORT);
});