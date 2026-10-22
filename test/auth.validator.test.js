const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeUsername,
  validateRegistration,
  validateLogin,
  validateNewPassword,
  validateFederation,
} = require("../app/utils/auth.validator.js");

test("normaliza el nombre de usuario sin distinguir mayúsculas", () => {
  assert.equal(normalizeUsername("  Ana_123 "), "ana_123");
});

test("valida registro con campos requeridos y límites seguros de bcrypt", () => {
  assert.equal(validateRegistration({ nombre: "Ana Pérez", federacion: "Atletismo", username: "ana_123", password: "abcdefgh" }).valid, true);
  assert.equal(validateRegistration({ nombre: "A", username: "a", password: "123" }).valid, false);
  assert.equal(validateRegistration({ nombre: "Ana", federacion:"Atletismo", username: "ana_123", password: "x".repeat(73) }).valid, false);
  assert.equal(validateRegistration({ nombre: "Ana", federacion:"Atletismo", username: "ana@dominio.com", password: "abcdefgh" }).valid, false);
});

test("valida inicio de sesión y contraseña nueva", () => {
  assert.equal(validateLogin({ username: "ana_123", password: "x" }), true);
  assert.equal(validateLogin({ username: "", password: "x" }), false);
  assert.equal(validateNewPassword("abcdefgh"), true);
  assert.equal(validateNewPassword("short"), false);
});

test("exige federación válida al registrar y respeta el límite de bytes UTF-8 de bcrypt", () => {
  const account = { nombre: "Ana", username: "ana_123", password: "abcdefgh" };
  assert.equal(validateRegistration(account).valid, false);
  assert.equal(validateRegistration({ ...account, federacion: "Atletismo" }).valid, true);
  assert.equal(validateFederation("   "), false);
  assert.equal(validateFederation("x".repeat(121)), false);
  assert.equal(validateFederation(" Atletismo "), true);
  assert.equal(validateNewPassword("é".repeat(36)), true);
  assert.equal(validateNewPassword("é".repeat(37)), false);
});
