function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function validateRegistration(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: ["El cuerpo debe ser un objeto JSON."] };
  }
  if (typeof body.nombre !== "string" || body.nombre.trim().length < 2 || body.nombre.trim().length > 120) {
    errors.push("nombre debe tener entre 2 y 120 caracteres.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(body.email)) || normalizeEmail(body.email).length > 254) {
    errors.push("email debe ser una dirección válida.");
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
    normalizeEmail(body.email) && typeof body.password === "string" && body.password.length > 0);
}

function validateNewPassword(password) {
  return typeof password === "string" && password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;
}

function validateFederation(value) {
  return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 120;
}

module.exports = { normalizeEmail, validateRegistration, validateLogin, validateNewPassword, validateFederation };
