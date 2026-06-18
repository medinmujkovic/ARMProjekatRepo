const express = require("express");
const path = require("path");
const { Op } = require("sequelize");
const { sequelize, Project, User } = require("./modeli");

const app = express();
app.use(express.json());

// --- STATIČKE RUTE ---
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use(express.static(path.join(__dirname, "html")));

// --- INICIJALNI PODACI (SEEDING) ---
async function seedDatabase() {
    const projectCount = await Project.count();
    if (projectCount === 0) {
        await Project.bulkCreate([
            { id: 1, title: "Sjecanje na rijeku", genre: "Drama / Dugometrazni film", status: "Druga verzija scenarija", pages: 98, active: true },
            { id: 2, title: "Na kraju ulice", genre: "Kriminalisticki film / Sarajevo", status: "Sinopsis zavrsen", pages: 14, active: false },
            { id: 3, title: "Iza planine", genre: "Psiholoski triler / Kratki film", status: "Zavrsna lektura", pages: 25, active: false },
            { id: 4, title: "Ljeto u Mostaru", genre: "Romanticna drama / Dugometrazni film", status: "U fazi produkcije", pages: 110, active: false }
        ]);
    }
    const userCount = await User.count();
    if (userCount === 0) {
        await User.create({
            name: "Alex Writer",
            email: "alex.writer@example.com",
            itemsPerPage: 25,
            twoFactorEnabled: false,
            preferredContact: "email",
            notificationFrequency: "Daily",
            plan: "Pro member"
        });
    }
}

app.get("/", (req, res) => res.redirect("/projects.html"));

// --- API PROJEKTI ---
app.get("/api/projects", async (req, res) => {
    try {
        const { q } = req.query;
        let whereClause = {};
        if (q && q.trim()) {
            const query = `%${q.trim().toLowerCase()}%`;
            whereClause = {
                [Op.or]: [
                    sequelize.where(sequelize.fn("lower", sequelize.col("title")), "LIKE", query),
                    sequelize.where(sequelize.fn("lower", sequelize.col("genre")), "LIKE", query),
                    sequelize.where(sequelize.fn("lower", sequelize.col("status")), "LIKE", query)
                ]
            };
        }
        const items = await Project.findAll({
            where: whereClause,
            order: [
                ["active", "DESC"],
                ["lastEdited", "DESC"]
            ]
        });
        res.status(200).json({ items, total: items.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.post("/api/projects", async (req, res) => {
    try {
        const { title, genre, status, pages, active } = req.body || {};
        const shouldBeActive = active === true;
        
        if (shouldBeActive) {
            await Project.update({ active: false }, { where: {} });
        }

        const project = await Project.create({
            title: title || "Novi projekat",
            genre: genre || "Nedefinisano",
            status: status || "Novi projekat",
            pages: pages || 1,
            active: shouldBeActive,
            lastEdited: new Date()
        });
        res.status(201).json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.put("/api/projects/:id", async (req, res) => {
    try {
        const projectId = parseInt(req.params.id, 10);
        const project = await Project.findByPk(projectId);
        if (!project) return res.status(404).json({ message: "Projekt ne postoji!" });

        const { title, genre, status, pages, active } = req.body || {};

        if (active === true) {
            await Project.update({ active: false }, { where: {} });
        }

        await project.update({
            title: title !== undefined ? title : project.title,
            genre: genre !== undefined ? genre : project.genre,
            status: status !== undefined ? status : project.status,
            pages: pages !== undefined ? pages : project.pages,
            active: active !== undefined ? active : project.active,
            lastEdited: new Date()
        });

        res.status(200).json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

// --- API KORISNIK ---
app.get("/api/user", async (req, res) => {
    try {
        let user = await User.findOne();
        if (!user) {
            user = await User.create({
                name: "Alex Writer",
                email: "alex.writer@example.com",
                itemsPerPage: 25,
                twoFactorEnabled: false,
                preferredContact: "email",
                notificationFrequency: "Daily",
                plan: "Pro member"
            });
        }
        res.status(200).json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.put("/api/user", async (req, res) => {
    try {
        let user = await User.findOne();
        if (!user) return res.status(404).json({ message: "Korisnik ne postoji!" });

        const { name, email, itemsPerPage, twoFactorEnabled, preferredContact, notificationFrequency, password } = req.body || {};
        
        await user.update({
            name: name !== undefined ? name : user.name,
            email: email !== undefined ? email : user.email,
            itemsPerPage: itemsPerPage !== undefined ? itemsPerPage : user.itemsPerPage,
            twoFactorEnabled: twoFactorEnabled !== undefined ? twoFactorEnabled : user.twoFactorEnabled,
            preferredContact: preferredContact !== undefined ? preferredContact : user.preferredContact,
            notificationFrequency: notificationFrequency !== undefined ? notificationFrequency : user.notificationFrequency,
            passwordUpdatedAt: password ? new Date() : user.passwordUpdatedAt
        });

        res.status(200).json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

// --- POKRETANJE SERVERA ---
const PORT = 3000;
async function startServer() {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ alter: true });
        await seedDatabase();
        app.listen(PORT, () => {
            console.log("Server radi na portu " + PORT);
        });
    } catch (error) {
        console.error("Fatalna greška pri pokretanju servera:", error);
        process.exit(1);
    }
}

startServer();