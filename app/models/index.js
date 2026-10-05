const dbConfig = require("../config/db.config.js");
const Sequelize = require("sequelize");

if (!dbConfig.URL) {
  throw new Error("Falta configurar DATABASE_URL en las variables de entorno.");
}

const sequelize = new Sequelize(dbConfig.URL, {
  dialect: dbConfig.dialect,
  logging: dbConfig.logging,
  dialectOptions: dbConfig.ssl
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
  pool: dbConfig.pool,
});

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;
db.sesiones = require("./sesion.model.js")(sequelize, Sequelize.DataTypes);

module.exports = db;
