#!/usr/bin/env node
"use strict";

// Bootstrap or recover a superadmin, from a trusted terminal only.
// NEVER expose this operation as a public HTTP route.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../app/models");
const { runMigrations } = require("../app/db/run-migrations");
const { ROLES } = require("../app/security/roles");
const { normalizeEmail, validateNewPassword } = require("../app/utils/auth.validator");

async function main() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const name = (process.env.ADMIN_NAME || "").trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      name.length < 2 || name.length > 120 || !validateNewPassword(password)) {
    throw new Error("ADMIN_EMAIL válido, ADMIN_NAME (2-120) y ADMIN_PASSWORD (8-72 bytes) son obligatorios.");
  }
  await db.sequelize.authenticate();
  await db.sequelize.sync();
  await runMigrations(db.sequelize);

  const passwordHash = await bcrypt.hash(password, 12);
  await db.sequelize.transaction(async (transaction) => {
    let user = await db.usuarios.findOne({ where: { email }, transaction });
    if (user) {
      if (![ROLES.ADMIN, ROLES.SUPERADMIN].includes(user.role)) {
        throw new Error("Este correo ya pertenece a un atleta. Utiliza un correo administrativo independiente.");
      }
      await user.update({ nombre: name, passwordHash, role: ROLES.SUPERADMIN, isActive: true }, { transaction });
    } else {
      user = await db.usuarios.create({
        nombre: name, email, role: ROLES.SUPERADMIN, passwordHash, isActive: true,
      }, { transaction });
    }
    await db.adminAudit.create({
      actorUserId: user.id, targetUserId: user.id,
      action: "superadmin_bootstrap", details: { source: "trusted_cli" },
    }, { transaction });
  });
  console.info("Cuenta superadministradora configurada:", email);
}

main()
  .catch((error) => {
    // No credentials or raw SQL parameters should be printed.
    console.error("No se pudo aprovisionar la cuenta:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.sequelize.close());
