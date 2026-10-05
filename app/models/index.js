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
db.atletas = require("./atleta.model.js")(sequelize, Sequelize.DataTypes);
db.sesiones = require("./sesion.model.js")(sequelize, Sequelize.DataTypes);
db.usuarios = require("./usuario.model.js")(sequelize, Sequelize.DataTypes);

db.usuarios.hasOne(db.atletas, {
  foreignKey: "userId",
  as: "atleta",
  onUpdate: "CASCADE",
  onDelete: "SET NULL",
});
db.atletas.belongsTo(db.usuarios, {
  foreignKey: "userId",
  as: "usuario",
  onUpdate: "CASCADE",
  onDelete: "SET NULL",
});

db.atletas.hasMany(db.sesiones, {
  foreignKey: "athleteId",
  as: "sesiones",
  onUpdate: "CASCADE",
  onDelete: "RESTRICT",
});
db.sesiones.belongsTo(db.atletas, {
  foreignKey: "athleteId",
  as: "atleta",
  onUpdate: "CASCADE",
  onDelete: "RESTRICT",
});

module.exports = db;
