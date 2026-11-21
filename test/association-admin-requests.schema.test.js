"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("la migración de solicitudes administrativas es aditiva y evita pendientes duplicadas", () => {
  const sql = read("app/db/migrations/009-association-admin-requests.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS association_admin_requests/i);
  assert.match(sql, /requested_by_user_id/i);
  assert.match(sql, /decided_by_user_id/i);
  assert.match(sql, /status IN \('pending', 'approved', 'rejected'\)/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*WHERE status = 'pending'/i);
  assert.doesNotMatch(sql, /\b(DROP TABLE|DELETE FROM)\b/i);
});

test("el flujo requiere aprobación de un administrador activo de la misma asociación", () => {
  const controller = read("app/controllers/association-admin-requests.controller.js");
  const roles = read("app/security/roles.js");
  const routes = read("app/routes/admin.routes.js");
  assert.match(controller, /req\.auth\.role !== ROLES\.ADMIN/);
  assert.match(controller, /isActive: true/);
  assert.match(controller, /current\.status !== "pending"/);
  assert.match(controller, /association_admin_request_approved/);
  assert.match(controller, /association_admin_request_rejected/);
  assert.match(roles, /ASSOCIATION_ADMIN_REQUESTS_REVIEW/);
  assert.match(roles.match(/\[ROLES\.ADMIN\]: Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] || "", /ASSOCIATION_ADMIN_REQUESTS_REVIEW/);
  assert.match(routes, /solicitudes-administrador/);
  assert.match(routes, /auditoria-administradores/);
});

test("la asignación directa solo se permite como mecanismo de primer administrador", () => {
  const controller = read("app/controllers/association-management.controller.js");
  assert.match(controller, /activeAdmins > 0/);
  assert.match(controller, /incorporar otro administrador/);
  assert.match(controller, /association_admin_assigned_initial/);
});

test("la auditoría se consulta con filtro por asociación", () => {
  const controller = read("app/controllers/association-admin-requests.controller.js");
  assert.match(controller, /details->>'associationId'/);
  assert.match(controller, /assertAssociationAccess/);
  assert.match(controller, /assertReviewer/);
});
