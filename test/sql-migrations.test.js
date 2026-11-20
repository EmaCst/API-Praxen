"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { splitSqlStatements } = require("../app/db/run-migrations");

const migrationsDirectory = path.join(__dirname, "../app/db/migrations");

test("la migración de invitaciones conserva el bloque DO completo", () => {
  const sql = fs.readFileSync(path.join(migrationsDirectory, "008-association-invitations.sql"), "utf8");
  const statements = splitSqlStatements(sql);

  assert.equal(statements.length, 4);
  assert.match(statements[3], /^DO \$\$/i);
  assert.match(statements[3], /END \$\$\s*$/i);
  assert.match(statements[3], /END IF;/i);

  const defaultStatement = statements.findIndex((statement) =>
    /ALTER TABLE association_invitations ALTER COLUMN created_at SET DEFAULT NOW\(\)/i.test(statement)
  );
  const proceduralStatement = statements.findIndex((statement) => /^DO \$\$/i.test(statement));
  assert.ok(defaultStatement >= 0 && defaultStatement < proceduralStatement);
});

test("el separador respeta cadenas, identificadores, comentarios y etiquetas dollar-quote", () => {
  const sql = [
    "-- este punto y coma ; pertenece al comentario",
    "SELECT 'uno;dos';",
    "SELECT 'texto con ''comilla; interna''';",
    'SELECT "col;name" FROM sample;',
    "DO $migration$ BEGIN PERFORM 'dentro; del bloque'; /* comentario; interno */ END $migration$;",
    "/* comentario externo; /* comentario anidado; */ final */ SELECT 4;",
  ].join("\n");

  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 5);
  assert.match(statements[3], /PERFORM 'dentro; del bloque'/);
  assert.match(statements[3], /END \$migration\$/);
});

test("todas las migraciones se pueden dividir sin dejar estructuras SQL abiertas", () => {
  const files = fs.readdirSync(migrationsDirectory)
    .filter((filename) => /^\d+.*\.sql$/.test(filename))
    .sort();

  assert.ok(files.length > 0);
  for (const filename of files) {
    const sql = fs.readFileSync(path.join(migrationsDirectory, filename), "utf8");
    assert.ok(splitSqlStatements(sql).length > 0, filename + " no produjo sentencias.");
  }
});

test("el separador rechaza cadenas o bloques dollar-quoted incompletos", () => {
  assert.throws(() => splitSqlStatements("SELECT 'sin cerrar;"), /sin cerrar/);
  assert.throws(() => splitSqlStatements("DO $$ BEGIN PERFORM 1;"), /sin cerrar/);
  assert.throws(() => splitSqlStatements("SELECT 1; /* comentario sin cerrar"), /sin cerrar/);
});
