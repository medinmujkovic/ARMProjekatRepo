const Sequelize = require("sequelize");

const sequelize = new Sequelize(
    process.env.DB_NAME || "wt26",
    process.env.DB_USER || "root",
    process.env.DB_PASSWORD || "password",
    {
        host: process.env.DB_HOST || "127.0.0.1",
        dialect: "mysql",
        logging: false,
        define: {
            freezeTableName: true
        }
    }
);

module.exports = sequelize;
