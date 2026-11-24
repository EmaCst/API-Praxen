"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("aceptar una invitación conserva las asociaciones anteriores", () => {
  const source = read("app/controllers/auth.controller.js");
  const accept = source.slice(source.indexOf("exports.acceptAssociationInvitation"), source.indexOf("exports.login"));
  assert.match(accept, /associationMemberships\.upsert/);
  assert.doesNotMatch(accept, /atletas\.update\(\{\s*associationId/);
  assert.match(accept, /asociacion-inicial/);
});

test("las estadísticas institucionales se autorizan mediante membresías activas", () => {
  const query = read("app/services/results.query.js");
  const controller = read("app/controllers/resultados.controller.js");
  assert.match(query, /associationMemberships\.findOne/);
  assert.match(query, /association_memberships/);
  assert.match(query, /am\.is_active = TRUE/);
  assert.match(controller, /association_memberships WHERE association_id IN/);
  assert.doesNotMatch(query, /where\.associationId\s*=\s*\{\s*\[Op\.in\]/);
});

test("el directorio de deportistas devuelve únicamente campos públicos", () => {
  const source = read("app/controllers/association-management.controller.js");
  const directory = source.slice(source.indexOf("exports.directoryAthletes"));
  assert.match(directory, /attributes: \["id", "nombre", "federacion", "createdAt"\]/);
  assert.match(directory, /username: item\.usuario\?\.username/);
  assert.doesNotMatch(directory, /sesiones|resultados|reacciones|aciertos|errores|password/i);
});

test("salidas y retiros desactivan membresías y registran auditoría", () => {
  const source = read("app/controllers/association-memberships.controller.js");
  assert.match(source, /exports\.leaveOwn/);
  assert.match(source, /exports\.removeAthlete/);
  assert.match(source, /membership\.update\(\{ isActive: false \}/);
  assert.match(source, /association_admin_left/);
  assert.match(source, /association_athlete_left/);
  assert.match(source, /association_athlete_removed/);
  assert.match(source, /activeAdminCount/);
  assert.doesNotMatch(source, /usuarios\.destroy|atletas\.destroy|sesiones\.destroy/);
});

test("la Asociación Pública no concede membresías ni permite grupos", () => {
  const migration = read("app/db/migrations/012-public-association-directory.sql");
  const invitations = read("app/controllers/association-invitations.controller.js");
  const groups = read("app/controllers/groups.controller.js");
  assert.match(migration, /asociacion-inicial/);
  assert.match(migration, /SET is_active = FALSE/i);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  assert.match(invitations, /La Asociación Pública es un directorio/);
  assert.match(groups, /La Asociación Pública es un directorio y no admite grupos/);
});

test("las rutas permiten abandonar asociaciones y retirar deportistas", () => {
  const adminRoutes = read("app/routes/admin.routes.js");
  const athleteRoutes = read("app/routes/atleta.routes.js");
  assert.match(adminRoutes, /directorio\/deportistas/);
  assert.match(adminRoutes, /asociaciones\/:associationId\/membresia/);
  assert.match(adminRoutes, /asociaciones\/:associationId\/deportistas\/:athleteId/);
  assert.match(athleteRoutes, /me\/asociaciones\/:associationId/);
});
