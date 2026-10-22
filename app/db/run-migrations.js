"use strict";

const fs = require("node:fs");
const path = require("node:path");

// All migrations are additive and repeatable. Keeping them in one place
// ensures Render startup uses the same schema.
async function runMigrations(sequelize) {
  const folder = path.join(__dirname, "migrations");
  const files = fs.readdirSync(folder).filter((filename) => /^\d+.*\.sql$/.test(filename)).sort();
  for (const filename of files) {
    const sql = fs.readFileSync(path.join(folder, filename), "utf8");
    for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
      await sequelize.query(statement);
    }
  }
  // En bases antiguas puede persistir una columna email NOT NULL. No la usamos
  // ni eliminamos datos históricos; permitimos cuentas nuevas sin ese dato.
  const columns = await sequelize.getQueryInterface().describeTable("users");
  if (columns.email?.allowNull === false) {
    await sequelize.query("ALTER TABLE users ALTER COLUMN email DROP NOT NULL");
  }
}
module.exports = { runMigrations };
