function validateAthlete(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: ["El cuerpo debe ser un objeto JSON."] };
  }

  if (typeof body.nombre !== "string" || body.nombre.trim().length < 2) {
    return { valid: false, errors: ["nombre debe tener al menos 2 caracteres."] };
  }
  if (body.nombre.trim().length > 120) {
    return { valid: false, errors: ["nombre no puede superar 120 caracteres."] };
  }

  return { valid: true, errors: [] };
}

module.exports = { validateAthlete };
