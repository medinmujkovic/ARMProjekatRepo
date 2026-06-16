const Sequelize = require("sequelize");

// Koristimo process.env varijable jer je to standard za Docker/AWS/Cloud okruženja.
// One se učitavaju iz Docker kontejnera ili AWS okruženja.
const sequelize = new Sequelize(
    process.env.DB_NAME || "wt26",
    process.env.DB_USER || "root",
    process.env.DB_PASSWORD || "password",
    {
        // OVDJE STAVI PRIVATNU IP ADRESU BAZE IZ TVOG DIJAGRAMA
        // Primjer: host: "10.19.0.50" 
        host: process.env.DB_HOST || "10.19.X.X", 
        dialect: "mysql",
        port: 3306,
        logging: false,
        define: {
            freezeTableName: true
        },
        // DODAJ OVO: Pomaže kod povezivanja preko mreže u cloudu
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    }
);

module.exports = sequelize;