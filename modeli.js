const Sequelize = require("sequelize");
const sequelize = require("./baza");

const Scenario = sequelize.define("Scenario", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: Sequelize.STRING,
        allowNull: false
    }
}, {
    timestamps: false,
    freezeTableName: true,
    tableName: "Scenario"
});

const Line = sequelize.define("Line", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    lineId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    text: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: ""
    },
    nextLineId: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    scenarioId: {
        type: Sequelize.INTEGER,
        allowNull: false
    }
}, {
    timestamps: false,
    freezeTableName: true,
    tableName: "Line",
    indexes: [
        {
            unique: true,
            fields: ["scenarioId", "lineId"]
        }
    ]
});

const Delta = sequelize.define("Delta", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    scenarioId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    type: {
        type: Sequelize.STRING,
        allowNull: false
    },
    lineId: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    nextLineId: {
        type: Sequelize.INTEGER,
        allowNull: true
    },
    content: {
        type: Sequelize.TEXT,
        allowNull: true
    },
    oldName: {
        type: Sequelize.STRING,
        allowNull: true
    },
    newName: {
        type: Sequelize.STRING,
        allowNull: true
    },
    timestamp: {
        type: Sequelize.INTEGER,
        allowNull: false
    }
}, {
    timestamps: false,
    freezeTableName: true,
    tableName: "Delta"
});

const Checkpoint = sequelize.define("Checkpoint", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    scenarioId: {
        type: Sequelize.INTEGER,
        allowNull: false
    },
    timestamp: {
        type: Sequelize.INTEGER,
        allowNull: false
    }
}, {
    timestamps: false,
    freezeTableName: true,
    tableName: "Checkpoint"
});

Scenario.hasMany(Line, { foreignKey: "scenarioId", onDelete: "CASCADE" });
Line.belongsTo(Scenario, { foreignKey: "scenarioId" });

Scenario.hasMany(Delta, { foreignKey: "scenarioId", onDelete: "CASCADE" });
Delta.belongsTo(Scenario, { foreignKey: "scenarioId" });

Scenario.hasMany(Checkpoint, { foreignKey: "scenarioId", onDelete: "CASCADE" });
Checkpoint.belongsTo(Scenario, { foreignKey: "scenarioId" });

module.exports = {
    sequelize,
    Scenario,
    Line,
    Delta,
    Checkpoint
};
