function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

function validateUsername(username) {
  // 3–32 caracteres; ASCII evita confundir nombres visualmente similares.
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalizeUsername(username));
}

function validateRegistration(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: ["El cuerpo debe ser un objeto JSON."] };
  }
  if (typeof body.nombre !== "string" || body.nombre.trim().length < 2 || body.nombre.trim().length > 120) {
    errors.push("nombre debe tener entre 2 y 120 caracteres.");
  }
  if (!validateUsername(body.username)) {
    errors.push("username debe tener entre 3 y 32 caracteres: letras sin tildes, números, punto, guion o guion bajo; debe empezar con letra o número.");
  }
  if (!validateFederation(body.federacion)) {
    errors.push("federacion debe tener entre 2 y 120 caracteres.");
  }
  if (!validateNewPassword(body.password)) {
    errors.push("password debe tener al menos 8 caracteres y no superar 72 bytes UTF-8.");
  }
  return { valid: errors.length === 0, errors };
}

function validateLogin(body) {
  return Boolean(body && typeof body === "object" && !Array.isArray(body) &&
    validateUsername(body.username) && typeof body.password === "string" &&
    body.password.length > 0 && Buffer.byteLength(body.password, "utf8") <= 72);
}

function validateNewPassword(password) {
  return typeof password === "string" && password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;
}

function validateFederation(value) {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 120;
}

module.exports = { normalizeUsername, validateUsername, validateRegistration, validateLogin, validateNewPassword, validateFederation };
