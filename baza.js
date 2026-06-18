const Sequelize = require("sequelize");

const sequelize = new Sequelize(
    process.env.DB_NAME || "wt26",
    process.env.DB_USER || "root",
    process.env.DB_PASSWORD || "password",
    {
        host: process.env.DB_HOST, 
        dialect: "mysql",
        port: 3306,
        logging: false,
        define: {
            freezeTableName: true
        },
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    }
);

module.exports = sequelize;