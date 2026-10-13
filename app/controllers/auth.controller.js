const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../models");
const {
  normalizeUsername,
  validateRegistration,
  validateLogin,
} = require("../utils/auth.validator.js");

function safeUser(user) {
  return { id: user.id, nombre: user.nombre, username: user.username };
}

function issueToken(user, athlete) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET debe tener al menos 32 caracteres.");
  const token = jwt.sign({ athleteId: athlete.id }, secret, {
    subject: String(user.id),
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
    issuer: "api-praxen",
    audience: "praxen-app",
  });
  return { token, user: safeUser(user), atleta: { id: athlete.id, nombre: athlete.nombre, federacion: athlete.federacion } };
}

function authResponse(res, user, athlete, status = 200) {
  try {
    return res.status(status).json(issueToken(user, athlete));
  } catch (error) {
    console.error("Error de configuración JWT:", error.message);
    return res.status(503).json({ message: "La autenticación no está configurada." });
  }
}

function isUniqueError(error) {
  return error.name === "SequelizeUniqueConstraintError" || error.parent?.code === "23505";
}

exports.register = async (req, res) => {
  const validation = validateRegistration(req.body);
  if (!validation.valid) return res.status(400).json({ message: "Los datos de registro no son válidos.", errors: validation.errors });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(503).json({ message: "La autenticación no está configurada." });
  }

  try {
    const username = normalizeUsername(req.body.username);
    const existing = await db.usuarios.findOne({ where: { username } });
    if (existing) return res.status(409).json({ message: "Ya existe una cuenta con ese nombre de usuario." });
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const created = await db.sequelize.transaction(async (transaction) => {
      const user = await db.usuarios.create({ nombre: req.body.nombre.trim(), username, passwordHash }, { transaction });
      const athlete = await db.atletas.create({ nombre: req.body.nombre.trim(), federacion: req.body.federacion.trim(), userId: user.id }, { transaction });
      return { user, athlete };
    });
    return authResponse(res, created.user, created.athlete, 201);
  } catch (error) {
    if (isUniqueError(error)) return res.status(409).json({ message: "Ya existe una cuenta con ese nombre de usuario." });
    console.error("Error al registrar cuenta:", error);
    return res.status(500).json({ message: "No se pudo crear la cuenta." });
  }
};

exports.login = async (req, res) => {
  if (!validateLogin(req.body)) return res.status(400).json({ message: "username válido y password son obligatorios." });
  try {
    const user = await db.usuarios.findOne({ where: { username: normalizeUsername(req.body.username) } });
    if (!user || !user.passwordHash || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      return res.status(401).json({ message: "Usuario o contraseña incorrectos." });
    }
    const athlete = await db.atletas.findOne({ where: { userId: user.id } });
    if (!athlete) return res.status(500).json({ message: "La cuenta no tiene un perfil de atleta asociado." });
    return authResponse(res, user, athlete);
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    return res.status(500).json({ message: "No se pudo iniciar sesión." });
  }
};

