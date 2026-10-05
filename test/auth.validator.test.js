const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeEmail,
  validateRegistration,
  validateLogin,
  validateNewPassword,
  validateFederation,
} = require("../app/utils/auth.validator.js");

test("normaliza el correo para que sea insensible a mayúsculas y espacios", () => {
  assert.equal(normalizeEmail("  Ana@Example.com "), "ana@example.com");
});

test("valida registro con campos requeridos y límites seguros de bcrypt", () => {
  assert.equal(validateRegistration({ nombre: "Ana Pérez", federacion: "Atletismo", email: "ana@example.com", password: "abcdefgh" }).valid, true);
  assert.equal(validateRegistration({ nombre: "A", email: "ana", password: "123" }).valid, false);
  assert.equal(validateRegistration({ nombre: "Ana", email: "ana@example.com", password: "x".repeat(73) }).valid, false);
});

test("valida inicio de sesión y contraseña nueva", () => {
  assert.equal(validateLogin({ email: "ana@example.com", password: "x" }), true);
  assert.equal(validateLogin({ email: "", password: "x" }), false);
  assert.equal(validateNewPassword("abcdefgh"), true);
  assert.equal(validateNewPassword("short"), false);
});

test("exige federación válida al registrar y respeta el límite de bytes UTF-8 de bcrypt", () => {
  const account = { nombre: "Ana", email: "ana@example.com", password: "abcdefgh" };
  assert.equal(validateRegistration(account).valid, false);
  assert.equal(validateRegistration({ ...account, federacion: "Atletismo" }).valid, true);
  assert.equal(validateFederation("   "), false);
  assert.equal(validateFederation("x".repeat(121)), false);
  assert.equal(validateFederation(" Atletismo "), true);
  assert.equal(validateNewPassword("é".repeat(36)), true);
  assert.equal(validateNewPassword("é".repeat(37)), false);
});
