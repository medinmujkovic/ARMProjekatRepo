const express = require("express");
const path = require("path");
const { Op } = require("sequelize");
const { sequelize, Scenario, Line, Delta, Checkpoint } = require("./modeli");
const seedData = require("./seed-data");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "html")));
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));

const lineLocks = [];
const characterLocks = [];
let lastTimestamp = 0;

function getUnixTimestamp() {
    const now = Math.floor(Date.now() / 1000);
    if (now <= lastTimestamp) {
        lastTimestamp += 1;
        return lastTimestamp;
    }
    lastTimestamp = now;
    return now;
}

function wrapText(text, maxWords) {
    const safeText = typeof text === "string" ? text : "";
    const trimmed = safeText.trim();
    if (!trimmed) return [""];
    const words = trimmed.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(" "));
    }
    return chunks;
}

async function getNextLineId(scenarioId, transaction) {
    const maxId = await Line.max("lineId", {
        where: { scenarioId: scenarioId },
        transaction: transaction
    });
    const safeMax = Number.isFinite(maxId) ? maxId : 0;
    return safeMax + 1;
}

function orderScenarioContent(lines) {
    const map = new Map();
    const referenced = new Set();
    lines.forEach(line => {
        map.set(line.lineId, line);
        if (line.nextLineId !== null && line.nextLineId !== undefined) {
            referenced.add(line.nextLineId);
        }
    });

    const start = lines.find(line => !referenced.has(line.lineId));
    if (!start) {
        return [...lines].sort((a, b) => a.lineId - b.lineId);
    }

    const ordered = [];
    const visited = new Set();
    let current = start;
    while (current && !visited.has(current.lineId)) {
        ordered.push(current);
        visited.add(current.lineId);
        if (current.nextLineId === null || current.nextLineId === undefined) break;
        current = map.get(current.nextLineId);
    }

    if (ordered.length < lines.length) {
        lines
            .filter(line => !visited.has(line.lineId))
            .sort((a, b) => a.lineId - b.lineId)
            .forEach(line => ordered.push(line));
    }

    return ordered;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceWholeWord(text, search, replacement) {
    if (typeof text !== "string") return text;
    if (!search) return text;
    const pattern = new RegExp(`\\b${escapeRegExp(search)}\\b`, "g");
    return text.replace(pattern, replacement);
}

function createInitialScenarioState(scenario) {
    return {
        id: scenario.id,
        title: scenario.title,
        content: [
            {
                lineId: 1,
                nextLineId: null,
                text: ""
            }
        ]
    };
}

function applyLineUpdate(stateMap, delta) {
    if (!delta) return;
    const lineId = Number(delta.lineId);
    if (!Number.isFinite(lineId)) return;
    let nextLineId = null;
    if (delta.nextLineId !== undefined && delta.nextLineId !== null) {
        const parsedNext = Number(delta.nextLineId);
        nextLineId = Number.isFinite(parsedNext) ? parsedNext : null;
    }
    const content = typeof delta.content === "string" ? delta.content : "";
    const existing = stateMap.get(lineId);
    if (existing) {
        existing.text = content;
        existing.nextLineId = nextLineId;
        return;
    }
    stateMap.set(lineId, {
        lineId: lineId,
        nextLineId: nextLineId,
        text: content
    });
}

function applyCharRename(stateMap, oldName, newName) {
    if (!oldName || !newName) return;
    stateMap.forEach(line => {
        if (typeof line.text !== "string") return;
        line.text = replaceWholeWord(line.text, oldName, newName);
    });
}

function removeUserLineLocks(userId, keepScenarioId, keepLineId) {
    for (let i = lineLocks.length - 1; i >= 0; i -= 1) {
        const lock = lineLocks[i];
        if (lock.userId !== userId) continue;
        if (lock.scenarioId === keepScenarioId && lock.lineId === keepLineId) continue;
        lineLocks.splice(i, 1);
    }
}

function removeLineLock(scenarioId, lineId) {
    for (let i = lineLocks.length - 1; i >= 0; i -= 1) {
        const lock = lineLocks[i];
        if (lock.scenarioId === scenarioId && lock.lineId === lineId) {
            lineLocks.splice(i, 1);
        }
    }
}

function removeCharacterLock(scenarioId, characterName) {
    for (let i = characterLocks.length - 1; i >= 0; i -= 1) {
        const lock = characterLocks[i];
        if (lock.scenarioId === scenarioId && lock.characterName === characterName) {
            characterLocks.splice(i, 1);
        }
    }
}

async function seedDatabase() {
    const scenarioCount = await Scenario.count();
    if (scenarioCount > 0) return;

    const scenarios = Array.isArray(seedData.scenarios) ? seedData.scenarios : [];
    if (scenarios.length === 0) return;

    await sequelize.transaction(async (transaction) => {
        await Scenario.bulkCreate(
            scenarios.map(scenario => ({
                id: scenario.id,
                title: scenario.title
            })),
            { transaction: transaction }
        );

        const lines = [];
        scenarios.forEach(scenario => {
            if (!Array.isArray(scenario.content)) return;
            scenario.content.forEach(line => {
                lines.push({
                    lineId: line.lineId,
                    nextLineId: line.nextLineId === undefined ? null : line.nextLineId,
                    text: typeof line.text === "string" ? line.text : "",
                    scenarioId: scenario.id
                });
            });
        });

        if (lines.length > 0) {
            await Line.bulkCreate(lines, { transaction: transaction });
        }

        const deltas = Array.isArray(seedData.deltas) ? seedData.deltas : [];
        if (deltas.length > 0) {
            await Delta.bulkCreate(
                deltas.map(delta => ({
                    scenarioId: delta.scenarioId,
                    type: delta.type,
                    lineId: delta.lineId === undefined || delta.lineId === null ? null : delta.lineId,
                    nextLineId: delta.nextLineId === undefined || delta.nextLineId === null ? null : delta.nextLineId,
                    content: delta.content === undefined || delta.content === null ? null : delta.content,
                    oldName: delta.oldName === undefined || delta.oldName === null ? null : delta.oldName,
                    newName: delta.newName === undefined || delta.newName === null ? null : delta.newName,
                    timestamp: delta.timestamp
                })),
                { transaction: transaction }
            );
        }
    });
}

app.post("/api/scenarios", async (req, res) => {
    try {
        const titleRaw = req.body && typeof req.body.title === "string" ? req.body.title : "";
        const title = titleRaw.trim() ? titleRaw.trim() : "Neimenovani scenarij";

        const scenario = await sequelize.transaction(async (transaction) => {
            const createdScenario = await Scenario.create({ title: title }, { transaction: transaction });
            await Line.create(
                {
                    lineId: 1,
                    nextLineId: null,
                    text: "",
                    scenarioId: createdScenario.id
                },
                { transaction: transaction }
            );
            return createdScenario;
        });

        res.status(200).json({
            id: scenario.id,
            title: scenario.title,
            content: [
                {
                    lineId: 1,
                    nextLineId: null,
                    text: ""
                }
            ]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.post("/api/scenarios/:scenarioId/lines/:lineId/lock", async (req, res) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const lineId = parseInt(req.params.lineId, 10);
        const userId = req.body ? req.body.userId : null;

        const scenario = await Scenario.findByPk(scenarioId);
        if (!scenario) {
            res.status(404).json({ message: "Scenario ne postoji!" });
            return;
        }

        const line = await Line.findOne({ where: { scenarioId: scenarioId, lineId: lineId } });
        if (!line) {
            res.status(404).json({ message: "Linija ne postoji!" });
            return;
        }

        const existingLock = lineLocks.find(lock => (
            lock.scenarioId === scenarioId && lock.lineId === lineId
        ));

        if (existingLock && existingLock.userId !== userId) {
            res.status(409).json({ message: "Linija je vec zakljucana!" });
            return;
        }

        removeUserLineLocks(userId, scenarioId, lineId);

        if (!existingLock) {
            lineLocks.push({ scenarioId: scenarioId, lineId: lineId, userId: userId });
        }

        res.status(200).json({ message: "Linija je uspjesno zakljucana!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.put("/api/scenarios/:scenarioId/lines/:lineId", async (req, res) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const lineId = parseInt(req.params.lineId, 10);
        const userId = req.body ? req.body.userId : null;
        const newText = req.body ? req.body.newText : null;

        if (!Array.isArray(newText) || newText.length === 0) {
            res.status(400).json({ message: "Niz new_text ne smije biti prazan!" });
            return;
        }

        const scenario = await Scenario.findByPk(scenarioId);
        if (!scenario) {
            res.status(404).json({ message: "Scenario ne postoji!" });
            return;
        }

        const line = await Line.findOne({ where: { scenarioId: scenarioId, lineId: lineId } });
        if (!line) {
            res.status(404).json({ message: "Linija ne postoji!" });
            return;
        }

        const existingLock = lineLocks.find(lock => (
            lock.scenarioId === scenarioId && lock.lineId === lineId
        ));

        if (!existingLock) {
            res.status(409).json({ message: "Linija nije zakljucana!" });
            return;
        }

        if (existingLock.userId !== userId) {
            res.status(409).json({ message: "Linija je vec zakljucana!" });
            return;
        }

        await sequelize.transaction(async (transaction) => {
            const wrappedLines = [];
            newText.forEach(item => {
                wrapText(item, 20).forEach(chunk => wrappedLines.push(chunk));
            });

            const oldNext = line.nextLineId === undefined ? null : line.nextLineId;
            const updatedText = wrappedLines[0] || "";
            const updatePayload = {
                text: updatedText,
                nextLineId: oldNext
            };

            const newLineIds = [];
            const newLineRecords = [];
            if (wrappedLines.length > 1) {
                let nextId = await getNextLineId(scenarioId, transaction);
                for (let i = 1; i < wrappedLines.length; i += 1) {
                    newLineIds.push(nextId);
                    nextId += 1;
                }

                updatePayload.nextLineId = newLineIds[0];

                for (let i = 0; i < newLineIds.length; i += 1) {
                    newLineRecords.push({
                        lineId: newLineIds[i],
                        nextLineId: i < newLineIds.length - 1 ? newLineIds[i + 1] : oldNext,
                        text: wrappedLines[i + 1],
                        scenarioId: scenarioId
                    });
                }
            }

            await Line.update(updatePayload, {
                where: { scenarioId: scenarioId, lineId: lineId },
                transaction: transaction
            });

            if (newLineRecords.length > 0) {
                await Line.bulkCreate(newLineRecords, { transaction: transaction });
            }

            const timestamp = getUnixTimestamp();
            const deltasToCreate = [];
            deltasToCreate.push({
                scenarioId: scenarioId,
                type: "line_update",
                lineId: lineId,
                nextLineId: updatePayload.nextLineId === undefined ? null : updatePayload.nextLineId,
                content: updatePayload.text,
                timestamp: timestamp
            });

            newLineRecords.forEach(record => {
                deltasToCreate.push({
                    scenarioId: scenarioId,
                    type: "line_update",
                    lineId: record.lineId,
                    nextLineId: record.nextLineId === undefined ? null : record.nextLineId,
                    content: record.text,
                    timestamp: timestamp
                });
            });

            await Delta.bulkCreate(deltasToCreate, { transaction: transaction });
        });

        removeLineLock(scenarioId, lineId);
        res.status(200).json({ message: "Linija je uspjesno azurirana!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.post("/api/scenarios/:scenarioId/characters/lock", async (req, res) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const userId = req.body ? req.body.userId : null;
        const characterName = req.body ? req.body.characterName : null;

        const scenario = await Scenario.findByPk(scenarioId);
        if (!scenario) {
            res.status(404).json({ message: "Scenario ne postoji!" });
            return;
        }

        const currentLock = characterLocks.find(lock => (
            lock.scenarioId === scenarioId && lock.characterName === characterName
        ));

        if (currentLock && currentLock.userId !== userId) {
            res.status(409).json({ message: "Konflikt! Ime lika je vec zakljucano!" });
            return;
        }

        removeCharacterLock(scenarioId, characterName);
        characterLocks.push({ scenarioId: scenarioId, characterName: characterName, userId: userId });

        res.status(200).json({ message: "Ime lika je uspjesno zakljucano!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.post("/api/scenarios/:scenarioId/characters/update", async (req, res) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const userId = req.body ? req.body.userId : null;
        const oldName = req.body ? req.body.oldName : null;
        const newName = req.body ? req.body.newName : null;

        const scenario = await Scenario.findByPk(scenarioId);
        if (!scenario) {
            res.status(404).json({ message: "Scenario ne postoji!" });
            return;
        }

        const currentLock = characterLocks.find(lock => (
            lock.scenarioId === scenarioId && lock.characterName === oldName
        ));

        if (!currentLock) {
            res.status(409).json({ message: "Ime lika nije zakljucano!" });
            return;
        }

        if (currentLock.userId !== userId) {
            res.status(409).json({ message: "Konflikt! Ime lika je vec zakljucano!" });
            return;
        }

        await sequelize.transaction(async (transaction) => {
            const lines = await Line.findAll({ where: { scenarioId: scenarioId }, transaction: transaction });
            const updates = [];
            lines.forEach(line => {
                if (typeof line.text !== "string") return;
                const updatedText = replaceWholeWord(line.text, oldName, newName);
                if (updatedText !== line.text) {
                    updates.push({ id: line.id, text: updatedText });
                }
            });

            if (updates.length > 0) {
                await Promise.all(updates.map(update => (
                    Line.update(
                        { text: update.text },
                        { where: { id: update.id }, transaction: transaction }
                    )
                )));
            }

            const timestamp = getUnixTimestamp();
            await Delta.create({
                scenarioId: scenarioId,
                type: "char_rename",
                oldName: oldName,
                newName: newName,
                timestamp: timestamp
            }, { transaction: transaction });
        });

        removeCharacterLock(scenarioId, oldName);
        res.status(200).json({ message: "Ime lika je uspjesno promijenjeno!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.get("/api/scenarios/:scenarioId/deltas", async (req, res) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const sinceRaw = req.query ? req.query.since : null;
        const sinceParsed = parseInt(sinceRaw, 10);
        const since = Number.isFinite(sinceParsed) ? sinceParsed : 0;

        const scenario = await Scenario.findByPk(scenarioId);
        if (!scenario) {
            res.status(404).json({ message: "Scenario ne postoji!" });
            return;
        }

        const deltas = await Delta.findAll({
            where: {
                scenarioId: scenarioId,
                timestamp: { [Op.gt]: since }
            },
            order: [["timestamp", "ASC"]],
            raw: true
        });

        const result = deltas.map(delta => {
            if (delta.type === "line_update") {
                return {
                    type: "line_update",
                    lineId: delta.lineId,
                    nextLineId: delta.nextLineId,
                    content: delta.content,
                    timestamp: delta.timestamp
                };
            }
            if (delta.type === "char_rename") {
                return {
                    type: "char_rename",
                    oldName: delta.oldName,
                    newName: delta.newName,
                    timestamp: delta.timestamp
                };
            }
            return null;
        }).filter(item => item !== null);

        res.status(200).json({ deltas: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.get("/api/scenarios/:scenarioId", async (req, res) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const scenario = await Scenario.findByPk(scenarioId);
        if (!scenario) {
            res.status(404).json({ message: "Scenario ne postoji!" });
            return;
        }

        const lines = await Line.findAll({ where: { scenarioId: scenarioId }, raw: true });
        const orderedContent = orderScenarioContent(lines);
        res.status(200).json({
            id: scenario.id,
            title: scenario.title,
            content: orderedContent.map(line => ({
                lineId: line.lineId,
                nextLineId: line.nextLineId === undefined ? null : line.nextLineId,
                text: line.text
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.post("/api/scenarios/:scenarioId/checkpoint", async (req, res) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const scenario = await Scenario.findByPk(scenarioId);
        if (!scenario) {
            res.status(404).json({ message: "Scenario ne postoji!" });
            return;
        }

        const timestamp = getUnixTimestamp();
        const checkpoint = await Checkpoint.create({
            scenarioId: scenarioId,
            timestamp: timestamp
        });

        res.status(200).json({
            message: "Checkpoint je uspjesno kreiran!",
            id: checkpoint.id,
            timestamp: checkpoint.timestamp
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.get("/api/scenarios/:scenarioId/checkpoints", async (req, res) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const scenario = await Scenario.findByPk(scenarioId);
        if (!scenario) {
            res.status(404).json({ message: "Scenario ne postoji!" });
            return;
        }

        const checkpoints = await Checkpoint.findAll({
            where: { scenarioId: scenarioId },
            order: [["timestamp", "ASC"], ["id", "ASC"]],
            raw: true
        });

        res.status(200).json(checkpoints.map(checkpoint => ({
            id: checkpoint.id,
            timestamp: checkpoint.timestamp
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

app.get("/api/scenarios/:scenarioId/restore/:checkpointId", async (req, res) => {
    try {
        const scenarioId = parseInt(req.params.scenarioId, 10);
        const checkpointId = parseInt(req.params.checkpointId, 10);

        const scenario = await Scenario.findByPk(scenarioId);
        if (!scenario) {
            res.status(404).json({ message: "Scenario ne postoji!" });
            return;
        }

        const checkpoint = await Checkpoint.findOne({
            where: { id: checkpointId, scenarioId: scenarioId },
            raw: true
        });

        if (!checkpoint) {
            res.status(404).json({ message: "Checkpoint ne postoji!" });
            return;
        }

        const deltas = await Delta.findAll({
            where: {
                scenarioId: scenarioId,
                timestamp: { [Op.lte]: checkpoint.timestamp }
            },
            order: [["timestamp", "ASC"], ["id", "ASC"]],
            raw: true
        });

        const initialState = createInitialScenarioState(scenario);
        const stateMap = new Map();
        initialState.content.forEach(line => {
            stateMap.set(line.lineId, { ...line });
        });

        deltas.forEach(delta => {
            if (delta.type === "line_update") {
                applyLineUpdate(stateMap, delta);
                return;
            }
            if (delta.type === "char_rename") {
                applyCharRename(stateMap, delta.oldName, delta.newName);
            }
        });

        const orderedContent = orderScenarioContent(Array.from(stateMap.values()));

        res.status(200).json({
            id: scenario.id,
            title: scenario.title,
            content: orderedContent.map(line => ({
                lineId: line.lineId,
                nextLineId: line.nextLineId === undefined ? null : line.nextLineId,
                text: line.text
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Greska na serveru!" });
    }
});

const PORT = 3000;

async function startServer() {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ force: true });
        await seedDatabase();
        app.listen(PORT, () => {
            console.log("Server radi na portu " + PORT);
            console.log("URL: http://localhost:" + PORT + "/writing.html");
        });
    } catch (error) {
        console.error("Ne mogu pokrenuti server:", error);
        process.exit(1);
    }
}

startServer();
