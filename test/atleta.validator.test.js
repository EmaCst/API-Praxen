const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAthlete } = require("../app/utils/atleta.validator.js");

test("acepta nombre de atleta", () => {
  assert.deepEqual(validateAthlete({ nombre: "Atleta de prueba" }), {
    valid: true,
    errors: [],
  });
});

test("rechaza nombre ausente o demasiado largo", () => {
  assert.equal(validateAthlete({}).valid, false);
  assert.equal(validateAthlete({ nombre: "A".repeat(121) }).valid, false);
});
