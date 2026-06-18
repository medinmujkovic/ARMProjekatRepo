const { DataTypes } = require("sequelize");
const sequelize = require("./baza");

const Project = sequelize.define("Project", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    genre: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false
    },
    pages: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    lastEdited: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
});

const User = sequelize.define("User", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false
    },
    itemsPerPage: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 25
    },
    twoFactorEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    preferredContact: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "email"
    },
    notificationFrequency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "Daily"
    },
    plan: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "Pro member"
    },
    passwordUpdatedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
});

module.exports = { sequelize, Project, User };