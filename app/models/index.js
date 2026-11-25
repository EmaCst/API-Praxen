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
db.associations = require("./association.model.js")(sequelize, Sequelize.DataTypes);
db.usuarios = require("./usuario.model.js")(sequelize, Sequelize.DataTypes);
db.associationMemberships = require("./association-membership.model.js")(sequelize, Sequelize.DataTypes);
db.associationInvitations = require("./association-invitation.model.js")(sequelize, Sequelize.DataTypes);
db.associationAdminRequests = require("./association-admin-request.model.js")(sequelize, Sequelize.DataTypes);
db.atletas = require("./atleta.model.js")(sequelize, Sequelize.DataTypes);
db.swimmingRecords = require("./swimming-record.model.js")(sequelize, Sequelize.DataTypes);
db.sesiones = require("./sesion.model.js")(sequelize, Sequelize.DataTypes);
db.adminAudit = require("./admin-audit.model.js")(sequelize, Sequelize.DataTypes);
db.groups = require("./group.model.js")(sequelize, Sequelize.DataTypes);
db.userGroups = require("./user-group.model.js")(sequelize, Sequelize.DataTypes);

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

db.associations.hasMany(db.associationMemberships, {
  foreignKey: "associationId",
  as: "membresias",
  onUpdate: "CASCADE",
  onDelete: "RESTRICT",
});
db.associationMemberships.belongsTo(db.associations, {
  foreignKey: "associationId",
  as: "asociacion",
});
db.usuarios.hasMany(db.associationMemberships, {
  foreignKey: "userId",
  as: "membresiasAsociacion",
});
db.associationMemberships.belongsTo(db.usuarios, {
  foreignKey: "userId",
  as: "usuario",
});
db.usuarios.belongsToMany(db.associations, {
  through: db.associationMemberships,
  foreignKey: "userId",
  otherKey: "associationId",
  as: "asociaciones",
});
db.associations.belongsToMany(db.usuarios, {
  through: db.associationMemberships,
  foreignKey: "associationId",
  otherKey: "userId",
  as: "usuarios",
});

db.associations.hasMany(db.atletas, {
  foreignKey: "associationId",
  as: "atletas",
  onUpdate: "CASCADE",
  onDelete: "RESTRICT",
});
db.atletas.belongsTo(db.associations, {
  foreignKey: "associationId",
  as: "asociacion",
});
db.associations.hasMany(db.groups, {
  foreignKey: "associationId",
  as: "grupos",
  onUpdate: "CASCADE",
  onDelete: "RESTRICT",
});
db.groups.belongsTo(db.associations, {
  foreignKey: "associationId",
  as: "asociacion",
});

db.atletas.hasMany(db.swimmingRecords, { foreignKey: "athleteId", as: "marcasNatacion" });
db.swimmingRecords.belongsTo(db.atletas, { foreignKey: "athleteId", as: "atleta" });
db.associations.hasMany(db.swimmingRecords, { foreignKey: "associationId", as: "marcasNatacion" });
db.swimmingRecords.belongsTo(db.associations, { foreignKey: "associationId", as: "asociacion" });
db.usuarios.hasMany(db.swimmingRecords, { foreignKey: "authorUserId", as: "marcasRegistradas" });
db.swimmingRecords.belongsTo(db.usuarios, { foreignKey: "authorUserId", as: "autor" });

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

db.usuarios.belongsToMany(db.groups, {
  through: db.userGroups,
  foreignKey: "userId",
  otherKey: "groupId",
  as: "grupos",
});
db.groups.belongsToMany(db.usuarios, {
  through: db.userGroups,
  foreignKey: "groupId",
  otherKey: "userId",
  as: "usuarios",
});

module.exports = db;
