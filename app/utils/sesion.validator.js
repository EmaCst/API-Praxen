const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MODES = new Set(["individual", "circuit", "custom"]);
const EXERCISE_LISTS = ["exercises", "runningExercises", "footExercises"];

function validateSession(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: ["El cuerpo debe ser un objeto JSON."] };
  }

  if (typeof body.sessionId !== "string" || !UUID_PATTERN.test(body.sessionId)) {
    errors.push("sessionId debe ser un UUID válido.");
  }
  if (!Number.isInteger(body.athleteId) || body.athleteId < 1) {
    errors.push("athleteId debe ser un entero positivo.");
  }
  if (typeof body.mode !== "string" || !ALLOWED_MODES.has(body.mode)) {
    errors.push("mode debe ser individual, circuit o custom.");
  }

  const startedAt = new Date(body.startedAt);
  const endedAt = new Date(body.endedAt);
  if (typeof body.startedAt !== "string" || Number.isNaN(startedAt.getTime())) {
    errors.push("startedAt debe ser una fecha ISO 8601 válida.");
  }
  if (typeof body.endedAt !== "string" || Number.isNaN(endedAt.getTime())) {
    errors.push("endedAt debe ser una fecha ISO 8601 válida.");
  }
  if (
    !Number.isNaN(startedAt.getTime()) &&
    !Number.isNaN(endedAt.getTime()) &&
    endedAt < startedAt
  ) {
    errors.push("endedAt no puede ser anterior a startedAt.");
  }

  let exerciseCount = 0;
  for (const listName of EXERCISE_LISTS) {
    const list = body[listName] === undefined ? [] : body[listName];
    if (!Array.isArray(list)) {
      errors.push(listName + " debe ser un arreglo.");
      continue;
    }
    exerciseCount += list.length;
    list.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(listName + "[" + index + "] debe ser un objeto.");
      } else if (typeof item.exerciseType !== "string" || !item.exerciseType) {
        errors.push(listName + "[" + index + "].exerciseType es obligatorio.");
      } else if (!item.metrics || typeof item.metrics !== "object" || Array.isArray(item.metrics)) {
        errors.push(listName + "[" + index + "].metrics debe ser un objeto.");
      }
    });
  }
  if (exerciseCount === 0) {
    errors.push("La sesión debe incluir al menos un resultado de ejercicio.");
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateSession };
