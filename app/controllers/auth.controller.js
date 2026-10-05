const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
const db = require("../models");
const {
  normalizeEmail,
  validateRegistration,
  validateLogin,
  validateNewPassword,
} = require("../utils/auth.validator.js");

const GENERIC_RESET_MESSAGE = "Si existe una cuenta con ese correo, recibirá instrucciones para cambiar la contraseña.";

function safeUser(user) {
  return { id: user.id, nombre: user.nombre, email: user.email };
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
  return { token, user: safeUser(user), atleta: { id: athlete.id, nombre: athlete.nombre } };
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
    const email = normalizeEmail(req.body.email);
    const existing = await db.usuarios.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: "Ya existe una cuenta con ese correo." });
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const created = await db.sequelize.transaction(async (transaction) => {
      const user = await db.usuarios.create({ nombre: req.body.nombre.trim(), email, passwordHash }, { transaction });
      const athlete = await db.atletas.create({ nombre: req.body.nombre.trim(), userId: user.id }, { transaction });
      return { user, athlete };
    });
    return authResponse(res, created.user, created.athlete, 201);
  } catch (error) {
    if (isUniqueError(error)) return res.status(409).json({ message: "Ya existe una cuenta con ese correo." });
    console.error("Error al registrar cuenta:", error);
    return res.status(500).json({ message: "No se pudo crear la cuenta." });
  }
};

exports.login = async (req, res) => {
  if (!validateLogin(req.body)) return res.status(400).json({ message: "email y password son obligatorios." });
  try {
    const user = await db.usuarios.findOne({ where: { email: normalizeEmail(req.body.email) } });
    if (!user || !user.passwordHash || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      return res.status(401).json({ message: "Correo o contraseña incorrectos." });
    }
    const athlete = await db.atletas.findOne({ where: { userId: user.id } });
    if (!athlete) return res.status(500).json({ message: "La cuenta no tiene un perfil de atleta asociado." });
    return authResponse(res, user, athlete);
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    return res.status(500).json({ message: "No se pudo iniciar sesión." });
  }
};

exports.googleLogin = async (req, res) => {
  const idToken = req.body && req.body.idToken;
  const audiences = (process.env.GOOGLE_CLIENT_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!audiences.length) return res.status(503).json({ message: "El inicio con Google todavía no está configurado." });
  if (typeof idToken !== "string" || !idToken) return res.status(400).json({ message: "idToken es obligatorio." });

  try {
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken, audience: audiences });
    const claims = ticket.getPayload();
    if (!claims || !claims.sub || !claims.email || claims.email_verified !== true) {
      return res.status(401).json({ message: "La identidad de Google no está verificada." });
    }

    const result = await db.sequelize.transaction(async (transaction) => {
      let user = await db.usuarios.findOne({ where: { googleSubject: claims.sub }, transaction });
      if (user && user.email !== normalizeEmail(claims.email)) {
        throw Object.assign(new Error("La cuenta de Google no coincide."), { statusCode: 409 });
      }
      if (!user) {
        user = await db.usuarios.findOne({ where: { email: normalizeEmail(claims.email) }, transaction });
        if (user && user.googleSubject && user.googleSubject !== claims.sub) {
          throw Object.assign(new Error("El correo ya está vinculado a otra identidad."), { statusCode: 409 });
        }
        if (!user) {
          user = await db.usuarios.create({
            nombre: (claims.name || claims.given_name || claims.email).slice(0, 120),
            email: normalizeEmail(claims.email),
            googleSubject: claims.sub,
          }, { transaction });
        } else {
          user.googleSubject = claims.sub;
          await user.save({ transaction });
        }
      }
      let athlete = await db.atletas.findOne({ where: { userId: user.id }, transaction });
      if (!athlete) athlete = await db.atletas.create({ nombre: user.nombre, userId: user.id }, { transaction });
      return { user, athlete };
    });
    return authResponse(res, result.user, result.athlete);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (isUniqueError(error)) return res.status(409).json({ message: "La cuenta de Google ya está asociada a otro usuario." });
    console.error("Error al verificar inicio con Google:", error);
    return res.status(401).json({ message: "No se pudo verificar la identidad de Google." });
  }
};

exports.forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body && req.body.email);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "email debe ser una dirección válida." });
  }
  try {
    const user = await db.usuarios.findOne({ where: { email } });
    if (user && user.passwordHash) {
      const resetToken = crypto.randomBytes(32).toString("base64url");
      user.resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
      user.resetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      const resetUrl = `${process.env.PASSWORD_RESET_URL || "praxen://reset-password"}?token=${encodeURIComponent(resetToken)}`;
      try {
        await sendResetEmail(user.email, resetUrl);
      } catch (mailError) {
        console.error("No se pudo enviar el correo de recuperación:", mailError.message);
      }
    }
    return res.status(202).json({ message: GENERIC_RESET_MESSAGE });
  } catch (error) {
    console.error("Error al solicitar recuperación:", error);
    return res.status(500).json({ message: "No se pudo procesar la solicitud." });
  }
};

async function sendResetEmail(to, resetUrl) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV !== "production") {
      console.info("Enlace de recuperación de desarrollo para " + to + ": " + resetUrl);
      return;
    }
    throw new Error("SMTP_HOST no está configurado.");
  }
  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: "Recupera tu contraseña de Praxen",
    text: `Solicitaste cambiar tu contraseña. Abre este enlace antes de 30 minutos: ${resetUrl}`,
    html: `<p>Solicitaste cambiar tu contraseña.</p><p><a href="${resetUrl}">Cambiar contraseña</a></p><p>El enlace caduca en 30 minutos.</p>`,
  });
}

exports.resetPassword = async (req, res) => {
  const token = req.body && req.body.token;
  const password = req.body && req.body.newPassword;
  if (typeof token !== "string" || token.length < 32 || !validateNewPassword(password)) {
    return res.status(400).json({ message: "token no es válido o newPassword debe tener entre 8 y 72 caracteres." });
  }
  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await db.usuarios.findOne({ where: { resetTokenHash: tokenHash } });
    if (!user || !user.resetExpiresAt || user.resetExpiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: "El enlace de recuperación no es válido o ha caducado." });
    }
    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetTokenHash = null;
    user.resetExpiresAt = null;
    await user.save();
    return res.status(200).json({ message: "Contraseña actualizada correctamente." });
  } catch (error) {
    console.error("Error al restablecer contraseña:", error);
    return res.status(500).json({ message: "No se pudo cambiar la contraseña." });
  }
};
