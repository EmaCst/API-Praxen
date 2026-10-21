"use strict";

const fs = require("node:fs");
const path = require("node:path");

// All migrations are additive and repeatable. Keeping them in one place
// ensures Render startup and the admin provisioning CLI use the same schema.
async function runMigrations(sequelize) {
  const folder = path.join(__dirname, "migrations");
  const files = fs.readdirSync(folder).filter((filename) => /^\d+.*\.sql$/.test(filename)).sort();
  for (const filename of files) {
    const sql = fs.readFileSync(path.join(folder, filename), "utf8");
    for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
      await sequelize.query(statement);
    }
  }
}
module.exports = { runMigrations };
