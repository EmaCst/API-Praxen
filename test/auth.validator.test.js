const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeUsername, validateUsername, validateRegistration, validateLogin,
  validateNewPassword, validateFederation } = require("../app/utils/auth.validator.js");
const account = { nombre: "Ana Pérez", federacion: "Atletismo", username: "ana.perez", password: "abcdefgh" };

test("normaliza username, conserva el nombre real y no requiere correo", () => {
  assert.equal(normalizeUsername("  Ana.Perez "), "ana.perez");
  assert.equal(validateRegistration(account).valid, true);
  assert.equal(validateRegistration({ ...account, username: "  ANA.PEREZ " }).valid, true);
});
test("limita username y rechaza correo, espacios internos, tildes y caracteres ambiguos", () => {
  for (const username of [undefined, null, 123, {}, "", "ab", "x".repeat(33), "ana perez", "aná", "ana@example.com", "_ana", "аna", "ana\nabc"]) {
    assert.equal(validateUsername(username), false, String(username));
  }
  for (const username of ["ana", "Ana_01", "ana-perez", "ana.perez", "x".repeat(32)]) assert.equal(validateUsername(username), true);
});
test("valida nombre, federación y límites seguros de bcrypt", () => {
  assert.equal(validateRegistration({ ...account, nombre: "A" }).valid, false);
  assert.equal(validateRegistration({ ...account, federacion: "" }).valid, false);
  assert.equal(validateRegistration({ ...account, password: "123" }).valid, false);
  assert.equal(validateRegistration({ ...account, password: "x".repeat(73) }).valid, false);
  assert.equal(validateFederation(" Atletismo "), true);
  assert.equal(validateFederation("x".repeat(121)), false);
  assert.equal(validateNewPassword("é".repeat(36)), true);
  assert.equal(validateNewPassword("é".repeat(37)), false);
});
test("login requiere username; no acepta el antiguo payload de email", () => {
  assert.equal(validateLogin({ username: "Ana.Perez", password: "abcdefgh" }), true);
  assert.equal(validateLogin({ email: "ana@example.com", password: "abcdefgh" }), false);
  assert.equal(validateLogin({ username: "ana", password: "" }), false);
  assert.equal(validateLogin({ username: "ana", password: "x".repeat(73) }), false);
  assert.equal(validateLogin([]), false);
  assert.equal(validateRegistration(null).valid, false);
});
