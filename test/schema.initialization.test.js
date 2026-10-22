"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("esquema nuevo de usuarios contiene username, rol y estado, sin dependencias de correo", () => {
  const schema = fs.readFileSync(path.join(__dirname, "../app/db/migrations/001-auth.sql"), "utf8");
  const users = schema.match(/CREATE TABLE IF NOT EXISTS users \(([\s\S]*?)\);/i)?.[1];
  assert.ok(users, "Falta CREATE TABLE users");
  assert.match(users, /username VARCHAR\(32\) NOT NULL UNIQUE/i);
  assert.match(users, /password_hash VARCHAR\(100\) NOT NULL/i);
  assert.match(users, /role VARCHAR\(24\) NOT NULL DEFAULT 'athlete'/i);
  assert.match(users, /is_active BOOLEAN NOT NULL DEFAULT TRUE/i);
  assert.doesNotMatch(users, /\b(email|google_subject|reset_token_hash|reset_expires_at)\b/i);
});

test("la API no registra rutas de autenticación por proveedores ni recuperación externa", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../app/routes/auth.routes.js"), "utf8");
  assert.match(routes, /router\.post\("\/login"/);
  assert.match(routes, /router\.post\("\/register"/);
  assert.doesNotMatch(routes, /google|forgot-password|reset-password/i);
});
