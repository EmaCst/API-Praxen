"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = relative => fs.readFileSync(path.join(__dirname, "..", relative), "utf8");

test("la migración multi-asociación es aditiva e idempotente", () => {
  const sql = read("app/db/migrations/007-multi-association.sql");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS associations/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS association_memberships/i);
  assert.doesNotMatch(sql, /athletes ALTER COLUMN association_id SET NOT NULL/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS association_id/i);
  assert.match(sql, /ON CONFLICT \(user_id, association_id\) DO NOTHING/i);
  assert.match(sql, /ON CONFLICT \(slug\) DO NOTHING/i);
  assert.match(sql, /WHERE association_id IS NULL/i);
  assert.doesNotMatch(sql, /\b(DROP TABLE|DELETE FROM)\b/i);
  const legacyGroupsMigration = read("app/db/migrations/005-groups-security.sql");
  assert.doesNotMatch(legacyGroupsMigration, /groups_nombre_lower_idx/i);
});

test("los perfiles, grupos y usuarios actuales se adscriben a la asociación inicial", () => {
  const sql = read("app/db/migrations/007-multi-association.sql");

  assert.match(sql, /UPDATE athletes[\s\S]*?association_id = \(SELECT id FROM associations WHERE slug = 'asociacion-inicial'\)/i);
  assert.match(sql, /UPDATE groups[\s\S]*?association_id = \(SELECT id FROM associations WHERE slug = 'asociacion-inicial'\)/i);
  assert.match(sql, /FROM users[\s\S]*?users\.role <> 'superadmin'/i);
  assert.match(sql, /groups ALTER COLUMN association_id SET NOT NULL/i);
  assert.match(sql, /federacion/i);
  assert.doesNotMatch(sql, /ALTER TABLE training_sessions|DROP COLUMN.*federacion/i);
});

test("los nuevos atletas, administradores y grupos reciben asociación inicial", () => {
  const auth = read("app/controllers/auth.controller.js");
  const admins = read("app/controllers/admin-management.controller.js");
  const groups = read("app/controllers/groups.controller.js");

  assert.match(auth, /associationId: null/);
  assert.doesNotMatch(auth, /associationMemberships\.create/);
  assert.match(admins, /associationMemberships\.create/);
  assert.match(admins, /createdByUserId: req\.auth\.userId/);
  assert.match(groups, /getDefaultAssociation\(\)/);
  assert.match(groups, /associationId:association\.id/);
});


test("las invitaciones se almacenan con hash y vencimiento", () => {
  const sql = read("app/db/migrations/008-association-invitations.sql");
  assert.match(sql, /token_hash CHAR\(64\) NOT NULL UNIQUE/i);
  assert.match(sql, /expires_at TIMESTAMPTZ NOT NULL/i);
  assert.match(sql, /status IN/);
});

test("el registro público no crea membresías institucionales", () => {
  const auth = read("app/controllers/auth.controller.js");
  assert.match(auth, /Public registration creates a general Praxen account/i);
  assert.match(auth, /associationId: null/i);
  assert.match(auth, /acceptAssociationInvitation/);
});

test("la documentación incluye respaldo, comprobaciones y rollback", () => {
  const docs = read("docs/multi-association-migration.md");
  assert.match(docs, /pg_dump/i);
  assert.match(docs, /pg_restore/i);
  assert.match(docs, /Rollback/i);
  assert.match(docs, /training_sessions/i);
});

test("el ejecutor aplica cada archivo de migración dentro de una transacción", () => {
  const runner = read("app/db/run-migrations.js");
  assert.match(runner, /sequelize\.transaction\(async\s*\(?transaction\)?\s*=>/);
  assert.match(runner, /sequelize\.query\(statement,\s*\{\s*transaction\s*\}\)/);
});
