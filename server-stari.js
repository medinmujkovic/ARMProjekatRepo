const express = require("express");
const path = require("path");
const { Op } = require("sequelize");
const { sequelize, Scenario, Line, Delta, Checkpoint } = require("./modeli");
const seedData = require("./seed-data");

const app = express();
const PORT = 3000;

// --- GLOBALNE STRUKTURE PODATAKA ---
const lineLocks = [];
const characterLocks = [];
let lastTimestamp = 0;

// --- MIDDLEWARE PODEŠAVANJA ---
app.use(express.json());

// Statički fajlovi i rute (Sigurnosni i precizni routing)
app.use("/css", express.static(path.join(__dirname, "html", "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use(express.static(path.join(__dirname, "html")));

// Glavna ruta - Serviranje klijentske aplikacije
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "html", "scenarios.html"));
});

// --- POMOĆNE / UTILITY FUNKCIJE ---

const getUnixTimestamp = () => {
    const now = Math.floor(Date.now() / 1000);
    lastTimestamp = now <= lastTimestamp ? lastTimestamp + 1 : now;
    return lastTimestamp;
};

const wrapText = (text, maxWords) => {
    const safeText = typeof text === "string" ? text.trim() : "";
    if (!safeText) return [""];
    const words = safeText.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(" "));
    }
    return chunks;
};

const getNextLineId = async (scenarioId, transaction) => {
    const maxId = await Line.max("lineId", { where: { scenarioId }, transaction });
    return (Number.isFinite(maxId) ? maxId : 0) + 1;
};

const orderScenarioContent = (lines) => {
    const map = new Map(lines.map(line => [line.lineId, line]));
    const referenced = new Set(lines.map(line => line.nextLineId).filter(id => id !== null && id !== undefined));
    
    const start = lines.find(line => !referenced.has(line.lineId));
    if (!start) return [...lines].sort((a, b) => a.lineId - b.lineId);

    const ordered = [];
    const visited = new Set();
    let current = start;

    while (current && !visited.has(current.lineId)) {
        ordered.push(current);
        visited.add(current.lineId);
        current = map.get(current.nextLineId);
    }

    if (ordered.length < lines.length) {
        lines.filter(line => !visited.has(line.lineId))
             .sort((a, b) => a.lineId - b.lineId)
             .forEach(line => ordered.push(line));
    }
    return ordered;
};

const replaceWholeWord = (text, search, replacement) => {
    if (typeof text !== "string" || !search) return text;
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`\\b${escaped}\\b`, "g"), replacement);
};

const createInitialScenarioState = (scenario) => ({
    id: scenario.id,
    title: scenario.title,
    content: [{ lineId: 1, nextLineId: null, text: "" }]
});

// --- LOGIKA ZA LOCKING SISTEM ---

const removeUserLineLocks = (userId, keepScenarioId, keepLineId) => {
    for (let i = lineLocks.length - 1; i >= 0; i--) {
        const lock = lineLocks[i];
        if (lock.userId === userId && !(lock.scenarioId === keepScenarioId && lock.lineId === keepLineId)) {
            lineLocks.splice(i, 1);
        }
    }
};

const removeLineLock = (scenarioId, lineId) => {
    const idx = lineLocks.findIndex(l => l.scenarioId === scenarioId && l.lineId === lineId);
    if (idx !== -1) lineLocks.splice(idx, 1);
};

const removeCharacterLock = (scenarioId, characterName) => {
    const idx = characterLocks.findIndex(l => l.scenarioId === scenarioId && l.characterName === characterName);
    if (idx !== -1) characterLocks.splice(idx, 1);
};

// --- CENTRALIZOVANI REUSABLE MIDDLEWARE ZA VALIDACIJU SCENARIJA ---
const checkScenarioExists = async (req, res, next) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const scenario = await Scenario.findByPk(scenarioId);
        if (!scenario) return res.status(404).json({ message: "Scenario ne postoji!" });
        req.scenario = scenario;
        next();
    } catch (error) {
        next(error);
    }
};

// --- API RUTE ---

// 1. Kreiranje novog scenarija
app.post("/api/scenarios", async (req, res, next) => {
    try {
        const titleRaw = req.body && typeof req.body.title === "string" ? req.body.title.trim() : "";
        const title = titleRaw || "Neimenovani scenarij";

        const scenario = await sequelize.transaction(async (transaction) => {
            const created = await Scenario.create({ title }, { transaction });
            await Line.create({ lineId: 1, nextLineId: null, text: "", scenarioId: created.id }, { transaction });
            return created;
        });

        res.status(200).json(createInitialScenarioState(scenario));
    } catch (error) { next(error); }
});

// 2. Zaključavanje linije teksta
app.post("/api/scenarios/:scenarioId/lines/:lineId/lock", checkScenarioExists, async (req, res, next) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const lineId = parseInt(req.params.lineId, 10);
        const userId = req.body?.userId;

        const line = await Line.findOne({ where: { scenarioId, lineId } });
        if (!line) return res.status(404).json({ message: "Linija ne postoji!" });

        const existingLock = lineLocks.find(l => l.scenarioId === scenarioId && l.lineId === lineId);
        if (existingLock && existingLock.userId !== userId) {
            return res.status(409).json({ message: "Linija je vec zakljucana!" });
        }

        removeUserLineLocks(userId, scenarioId, lineId);
        if (!existingLock) lineLocks.push({ scenarioId, lineId, userId });

        res.status(200).json({ message: "Linija je uspešno zakljucana!" });
    } catch (error) { next(error); }
});

// 3. Ažuriranje linije i automatsko word-wrapping razbijanje
app.put("/api/scenarios/:scenarioId/lines/:lineId", checkScenarioExists, async (req, res, next) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const lineId = parseInt(req.params.lineId, 10);
        const { userId, newText } = req.body || {};

        if (!Array.isArray(newText) || newText.length === 0) {
            return res.status(400).json({ message: "Niz new_text ne smije biti prazan!" });
        }

        const line = await Line.findOne({ where: { scenarioId, lineId } });
        if (!line) return res.status(404).json({ message: "Linija ne postoji!" });

        const existingLock = lineLocks.find(l => l.scenarioId === scenarioId && l.lineId === lineId);
        if (!existingLock || existingLock.userId !== userId) {
            return res.status(409).json({ message: existingLock ? "Linija je vec zakljucana!" : "Linija nije zakljucana!" });
        }

        await sequelize.transaction(async (transaction) => {
            const wrappedLines = [];
            newText.forEach(item => wrapText(item, 20).forEach(chunk => wrappedLines.push(chunk)));

            const oldNext = line.nextLineId ?? null;
            const updatePayload = { text: wrappedLines[0] || "", nextLineId: oldNext };
            const newLineRecords = [];

            if (wrappedLines.length > 1) {
                let nextId = await getNextLineId(scenarioId, transaction);
                const newLineIds = wrappedLines.slice(1).map((_, i) => nextId + i);
                
                updatePayload.nextLineId = newLineIds[0];

                for (let i = 0; i < newLineIds.length; i++) {
                    newLineRecords.push({
                        lineId: newLineIds[i],
                        nextLineId: i < newLineIds.length - 1 ? newLineIds[i + 1] : oldNext,
                        text: wrappedLines[i + 1],
                        scenarioId
                    });
                }
            }

            await Line.update(updatePayload, { where: { scenarioId, lineId }, transaction });
            if (newLineRecords.length > 0) await Line.bulkCreate(newLineRecords, { transaction });

            const timestamp = getUnixTimestamp();
            const deltasToCreate = [
                { scenarioId, type: "line_update", lineId, nextLineId: updatePayload.nextLineId, content: updatePayload.text, timestamp },
                ...newLineRecords.map(r => ({ scenarioId, type: "line_update", lineId: r.lineId, nextLineId: r.nextLineId, content: r.text, timestamp }))
            ];
            await Delta.bulkCreate(deltasToCreate, { transaction });
        });

        removeLineLock(scenarioId, lineId);
        res.status(200).json({ message: "Linija je uspjesno azurirana!" });
    } catch (error) { next(error); }
});

// 4. Zaključavanje imena lika
app.post("/api/scenarios/:scenarioId/characters/lock", checkScenarioExists, async (req, res, next) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const { userId, characterName } = req.body || {};

        const currentLock = characterLocks.find(l => l.scenarioId === scenarioId && l.characterName === characterName);
        if (currentLock && currentLock.userId !== userId) {
            return res.status(409).json({ message: "Konflikt! Ime lika je vec zakljucano!" });
        }

        removeCharacterLock(scenarioId, characterName);
        characterLocks.push({ scenarioId, characterName, userId });
        res.status(200).json({ message: "Ime lika je uspjesno zakljucano!" });
    } catch (error) { next(error); }
});

// 5. Globalno preimenovanje lika kroz cijeli scenario
app.post("/api/scenarios/:scenarioId/characters/update", checkScenarioExists, async (req, res, next) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const { userId, oldName, newName } = req.body || {};

        const currentLock = characterLocks.find(l => l.scenarioId === scenarioId && l.characterName === oldName);
        if (!currentLock || currentLock.userId !== userId) {
            return res.status(409).json({ message: currentLock ? "Konflikt! Ime lika je vec zakljucano!" : "Ime lika nije zakljucano!" });
        }

        await sequelize.transaction(async (transaction) => {
            const lines = await Line.findAll({ where: { scenarioId }, transaction });
            const updates = lines
                .map(line => {
                    if (typeof line.text !== "string") return null;
                    const updatedText = replaceWholeWord(line.text, oldName, newName);
                    return updatedText !== line.text ? { id: line.id, text: updatedText } : null;
                })
                .filter(Boolean);

            if (updates.length > 0) {
                await Promise.all(updates.map(u => Line.update({ text: u.text }, { where: { id: u.id }, transaction })));
            }

            await Delta.create({ scenarioId, type: "char_rename", oldName, newName, timestamp: getUnixTimestamp() }, { transaction });
        });

        removeCharacterLock(scenarioId, oldName);
        res.status(200).json({ message: "Ime lika je uspjesno promijenjeno!" });
    } catch (error) { next(error); }
});

// 6. Dobavljanje inkrementalnih izmjena (Deltas) dugim pollanjem (Long polling fallback)
app.get("/api/scenarios/:scenarioId/deltas", checkScenarioExists, async (req, res, next) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const since = parseInt(req.query?.since, 10) || 0;

        const deltas = await Delta.findAll({
            where: { scenarioId, timestamp: { [Op.gt]: since } },
            order: [["timestamp", "ASC"]],
            raw: true
        });

        const result = deltas.map(d => {
            if (d.type === "line_update") return { type: "line_update", lineId: d.lineId, nextLineId: d.nextLineId, content: d.content, timestamp: d.timestamp };
            if (d.type === "char_rename") return { type: "char_rename", oldName: d.oldName, newName: d.newName, timestamp: d.timestamp };
            return null;
        }).filter(Boolean);

        res.status(200).json({ deltas: result });
    } catch (error) { next(error); }
});

// 7. Dobavljanje kompletnog sortiranog scenarija
app.get("/api/scenarios/:scenarioId", checkScenarioExists, async (req, res, next) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const lines = await Line.findAll({ where: { scenarioId }, raw: true });
        
        res.status(200).json({
            id: req.scenario.id,
            title: req.scenario.title,
            content: orderScenarioContent(lines).map(l => ({ lineId: l.lineId, nextLineId: l.nextLineId ?? null, text: l.text }))
        });
    } catch (error) { next(error); }
});

// 8. Kreiranje Checkpoint-a (Tačke povrata)
app.post("/api/scenarios/:scenarioId/checkpoint", checkScenarioExists, async (req, res, next) => {
    try {
        const checkpoint = await Checkpoint.create({ scenarioId: parseInt(req.params.scenarioId, 10), timestamp: getUnixTimestamp() });
        res.status(200).json({ message: "Checkpoint je uspjesno kreiran!", id: checkpoint.id, timestamp: checkpoint.timestamp });
    } catch (error) { next(error); }
});

// 9. Izlistavanje svih tačaka povrata
app.get("/api/scenarios/:scenarioId/checkpoints", checkScenarioExists, async (req, res, next) => {
    try {
        const checkpoints = await Checkpoint.findAll({
            where: { scenarioId: parseInt(req.params.scenarioId, 10) },
            order: [["timestamp", "ASC"], ["id", "ASC"]],
            raw: true
        });
        res.status(200).json(checkpoints.map(c => ({ id: c.id, timestamp: c.timestamp })));
    } catch (error) { next(error); }
});

// 10. Vraćanje stanja scenarija na određeni Checkpoint rekonstrukcijom delti
app.get("/api/scenarios/:scenarioId/restore/:checkpointId", checkScenarioExists, async (req, res, next) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const checkpointId = parseInt(req.params.checkpointId, 10);

        const checkpoint = await Checkpoint.findOne({ where: { id: checkpointId, scenarioId }, raw: true });
        if (!checkpoint) return res.status(404).json({ message: "Checkpoint ne postoji!" });

        const deltas = await Delta.findAll({
            where: { scenarioId, timestamp: { [Op.lte]: checkpoint.timestamp } },
            order: [["timestamp", "ASC"], ["id", "ASC"]],
            raw: true
        });

        const stateMap = new Map();
        createInitialScenarioState(req.scenario).content.forEach(l => stateMap.set(l.lineId, { ...l }));

        deltas.forEach(d => {
            if (d.type === "line_update") {
                const lineId = Number(d.lineId);
                if (!Number.isFinite(lineId)) return;
                const nextLineId = Number.isFinite(Number(d.nextLineId)) ? Number(d.nextLineId) : null;
                
                const existing = stateMap.get(lineId);
                if (existing) {
                    existing.text = d.content ?? "";
                    existing.nextLineId = nextLineId;
                } else {
                    stateMap.set(lineId, { lineId, nextLineId, text: d.content ?? "" });
                }
            } else if (d.type === "char_rename") {
                stateMap.forEach(l => {
                    if (typeof l.text === "string") l.text = replaceWholeWord(l.text, d.oldName, d.newName);
                });
            }
        });

        res.status(200).json({
            id: req.scenario.id,
            title: req.scenario.title,
            content: orderScenarioContent(Array.from(stateMap.values())).map(l => ({ lineId: l.lineId, nextLineId: l.nextLineId ?? null, text: l.text }))
        });
    } catch (error) { next(error); }
});

// --- SEED LOGIKA ZA BAZU ---
async function seedDatabase() {
    if (await Scenario.count() > 0) return;
    const scenarios = Array.isArray(seedData.scenarios) ? seedData.scenarios : [];
    if (scenarios.length === 0) return;

    await sequelize.transaction(async (transaction) => {
        await Scenario.bulkCreate(scenarios.map(s => ({ id: s.id, title: s.title })), { transaction });

        const lines = [];
        scenarios.forEach(s => {
            if (!Array.isArray(s.content)) return;
            s.content.forEach(l => {
                lines.push({ lineId: l.lineId, nextLineId: l.nextLineId ?? null, text: l.text ?? "", scenarioId: s.id });
            });
        });
        if (lines.length > 0) await Line.bulkCreate(lines, { transaction });

        const deltas = Array.isArray(seedData.deltas) ? seedData.deltas : [];
        if (deltas.length > 0) {
            await Delta.bulkCreate(deltas.map(d => ({
                scenarioId: d.scenarioId, type: d.type,
                lineId: d.lineId ?? null, nextLineId: d.nextLineId ?? null,
                content: d.content ?? null, oldName: d.oldName ?? null,
                newName: d.newName ?? null, timestamp: d.timestamp
            })), { transaction });
        }
    });
}

// --- CENTRALIZOVANI ERROR HANDLER MIDDLEWARE ---
app.use((err, req, res, next) => {
    console.error("Internal Server Error:", err);
    res.status(500).json({ message: "Greska na serveru!" });
});

// --- POKRETANJE SERVERA ---
async function startServer() {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ force: true });
        await seedDatabase();
        app.listen(PORT, () => {
            console.log(`===================================================`);
            console.log(`🚀 Server uspješno pokrenut na portu: ${PORT}`);
            console.log(`🔗 Lokalni URL: http://localhost:${PORT}`);
            console.log(`===================================================`);
        });
    } catch (error) {
        console.error("Ne mogu pokrenuti server zbog fatalne greške:", error);
        process.exit(1);
    }
}

startServer();