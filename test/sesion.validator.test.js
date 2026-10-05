const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSession } = require("../app/utils/sesion.validator.js");

const validSession = {
  sessionId: "f26cb524-1c92-4d9b-9866-3efcbeab1241",
  athleteId: 1,
  mode: "individual",
  startedAt: "2026-10-05T03:00:00.000Z",
  endedAt: "2026-10-05T03:05:00.000Z",
  exercises: [{ exerciseType: "aimlab", metrics: { hits: 3, misses: 1 } }],
  runningExercises: [],
  footExercises: [],
};

test("acepta una sesión con la estructura de Unity", () => {
  const result = validateSession(validSession);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("rechaza un UUID inválido y un atleta no positivo", () => {
  const result = validateSession({
    ...validSession,
    sessionId: "not-a-uuid",
    athleteId: 0,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("sessionId")));
  assert.ok(result.errors.some((error) => error.includes("athleteId")));
});

test("rechaza una sesión sin resultados y fechas invertidas", () => {
  const result = validateSession({
    ...validSession,
    startedAt: "2026-10-05T03:05:00.000Z",
    endedAt: "2026-10-05T03:00:00.000Z",
    exercises: [],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("anterior")));
  assert.ok(result.errors.some((error) => error.includes("al menos un resultado")));
});

test("rechaza resultados de ejercicio con metrics ausente", () => {
  const result = validateSession({
    ...validSession,
    exercises: [{ exerciseType: "aimlab" }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("metrics")));
});
