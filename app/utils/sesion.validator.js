const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MODES = new Set(["individual", "circuit", "custom"]);
const EXERCISE_TYPES = { exercises: "aimlab", runningExercises: "running_direction_change", footExercises: "feet_targets" };
const EXERCISE_LISTS = Object.keys(EXERCISE_TYPES);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/;

function checkNumbers(value, path, errors, depth = 0) {
  if (depth > 12) { errors.push(path + " supera la profundidad permitida."); return; }
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > 1e9)) {
    errors.push(path + " debe ser un número finito en el rango permitido.");
  } else if (value && typeof value === "object") {
    if (Array.isArray(value) && value.length > 5000) {
      errors.push(path + " supera 5000 elementos."); return;
    }
    for (const [key, child] of Object.entries(value)) checkNumbers(child, path + "." + key, errors, depth + 1);
  }
}

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
  if (typeof body.startedAt !== "string" || !ISO_DATE.test(body.startedAt) || Number.isNaN(startedAt.getTime())) {
    errors.push("startedAt debe ser una fecha ISO 8601 válida.");
  }
  if (typeof body.endedAt !== "string" || !ISO_DATE.test(body.endedAt) || Number.isNaN(endedAt.getTime())) {
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
    if (list.length > 1000) { errors.push(listName + " supera 1000 resultados."); continue; }
    exerciseCount += list.length;
    list.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(listName + "[" + index + "] debe ser un objeto.");
      } else if (typeof item.exerciseType !== "string" || !item.exerciseType) {
        errors.push(listName + "[" + index + "].exerciseType es obligatorio.");
      } else if (!item.metrics || typeof item.metrics !== "object" || Array.isArray(item.metrics)) {
        errors.push(listName + "[" + index + "].metrics debe ser un objeto.");
      }
      if (item && typeof item === "object" && !Array.isArray(item)) {
        if (item.exerciseType !== EXERCISE_TYPES[listName]) errors.push(listName + "[" + index + "].exerciseType no corresponde al ejercicio.");
        if (item.sets !== undefined && (!Number.isInteger(item.sets) || item.sets < 1 || item.sets > 1000)) errors.push("sets debe estar entre 1 y 1000.");
        for (const field of ["setDurationSeconds", "restDurationSeconds"]) {
          if (item[field] !== undefined && (typeof item[field] !== "number" || !Number.isFinite(item[field]) || item[field] < (field === "setDurationSeconds" ? 0.001 : 0) || item[field] > 86400)) errors.push(field + " no tiene una duración válida.");
        }
        for (const field of ["hits", "misses", "score", "targetsReached"]) {
          if (item.metrics && item.metrics[field] !== undefined && (!Number.isInteger(item.metrics[field]) || item.metrics[field] < 0)) errors.push(field + " debe ser un entero no negativo.");
        }
        checkNumbers(item, listName + "[" + index + "]", errors);
      }
    });
  }
  if (exerciseCount === 0) {
    errors.push("La sesión debe incluir al menos un resultado de ejercicio.");
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateSession, UUID_PATTERN };
