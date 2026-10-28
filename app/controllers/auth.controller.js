"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../models");
const { ROLES, permissionsFor } = require("../security/roles");
const { normalizeUsername, validateRegistration, validateLogin, validateNewPassword } = require("../utils/auth.validator");

function safeUser(user) {
  return {
    id: user.id, nombre: user.nombre, username: user.username,
    role: user.role, permissions: permissionsFor(user.role), mustChangePassword:user.mustChangePassword===true,
  };
}

function issueToken(user, athlete) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET debe tener al menos 32 caracteres.");
  if (user.isActive === false) throw new Error("La cuenta está desactivada.");
  const isAdmin = [ROLES.ADMIN, ROLES.SUPERADMIN].includes(user.role);
  if (!isAdmin && (user.role !== ROLES.ATHLETE || !athlete))
    throw new Error("La cuenta no tiene un perfil de atleta válido.");
  const token = jwt.sign(isAdmin ? {tv:user.tokenVersion||0} : { athleteId: athlete.id,tv:user.tokenVersion||0 }, secret, {
    subject: String(user.id),
    expiresIn: isAdmin ? (process.env.JWT_ADMIN_EXPIRES_IN || "2h") : (process.env.JWT_EXPIRES_IN || "12h"),
    issuer: "api-praxen", audience: isAdmin ? "praxen-dashboard" : "praxen-app",
  });
  return {
    token, user: safeUser(user),
    atleta: athlete ? { id: athlete.id, nombre: athlete.nombre, federacion: athlete.federacion } : null,
  };
}

function authResponse(res, user, athlete, status = 200) {
  try { return res.status(status).json(issueToken(user, athlete)); }
  catch (error) {
    console.error("Error de configuración de autenticación:", error.message);
    return res.status(503).json({ message: "La autenticación no está configurada." });
  }
}

function isUniqueError(error) {
  return error.name === "SequelizeUniqueConstraintError" || error.parent?.code === "23505";
}

exports.register = async (req, res) => {
  const validation = validateRegistration(req.body);
  if (!validation.valid)
    return res.status(400).json({ message: "Los datos de registro no son válidos.", errors: validation.errors });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    return res.status(503).json({ message: "La autenticación no está configurada." });

  try {
    const username = normalizeUsername(req.body.username);
    if (await db.usuarios.findOne({ where: { username } }))
      return res.status(409).json({ message: "El nombre de usuario ya está ocupado." });
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const created = await db.sequelize.transaction(async (transaction) => {
      const user = await db.usuarios.create({
        nombre: req.body.nombre.trim(), username, passwordHash, role: ROLES.ATHLETE,
      }, { transaction });
      const athlete = await db.atletas.create({
        nombre: req.body.nombre.trim(), federacion: "Natación", userId: user.id,
      }, { transaction });
      return { user, athlete };
    });
    return authResponse(res, created.user, created.athlete, 201);
  } catch (error) {
    if (isUniqueError(error)) return res.status(409).json({ message: "El nombre de usuario ya está ocupado." });
    console.error("Error al registrar cuenta:", error);
    return res.status(500).json({ message: "No se pudo crear la cuenta." });
  }
};

exports.login = async (req, res) => {
  if (!validateLogin(req.body))
    return res.status(400).json({ message: "username y password son obligatorios." });
  try {
    const user = await db.usuarios.findOne({ where: { username: normalizeUsername(req.body.username) } });
    if (!user || user.isActive === false || !user.passwordHash ||
        !(await bcrypt.compare(req.body.password, user.passwordHash)))
      return res.status(401).json({ message: "Usuario o contraseña incorrectos." });

    const athlete = [ROLES.ADMIN, ROLES.SUPERADMIN].includes(user.role) ? null :
      await db.atletas.findOne({ where: { userId: user.id } });
    if (user.role === ROLES.ATHLETE && !athlete)
      return res.status(500).json({ message: "La cuenta no tiene un perfil de atleta asociado." });
    return authResponse(res, user, athlete);
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    return res.status(500).json({ message: "No se pudo iniciar sesión." });
  }
};

exports.changePassword = async (req,res)=>{
 const currentPassword=req.body?.currentPassword,newPassword=req.body?.newPassword;
 if(typeof currentPassword!=="string"||!validateNewPassword(newPassword)||newPassword===currentPassword||newPassword==="praxen01")return res.status(400).json({message:"Indica tu contraseña actual y una contraseña nueva válida y distinta."});
 try{
  const account=await db.usuarios.findByPk(req.auth.userId);
  if(!account||!(await bcrypt.compare(currentPassword,account.passwordHash)))return res.status(403).json({message:"La contraseña actual es incorrecta."});
  const passwordHash=await bcrypt.hash(newPassword,12);
  const [updated]=await db.usuarios.update({passwordHash,mustChangePassword:false,tokenVersion:db.sequelize.literal("token_version + 1")},{where:{id:account.id,passwordHash:account.passwordHash}});
  if(!updated)return res.status(409).json({message:"La contraseña cambió durante la operación. Vuelve a iniciar sesión."});
  return res.json({message:"Contraseña actualizada. Inicia sesión nuevamente."});
 }catch(error){console.error("Error al cambiar contraseña:",error);return res.status(500).json({message:"No se pudo cambiar la contraseña."});}
};

exports.me = async (req, res) => {
  try {
    const user = await db.usuarios.findByPk(req.auth.userId, {
      attributes: ["id", "nombre", "username", "role", "mustChangePassword"],
    });
    if (!user) return res.status(401).json({ message: "Cuenta no encontrada." });
    return res.json({ user: safeUser(user), athleteId: req.auth.athleteId });
  } catch (error) {
    console.error("Error al obtener cuenta actual:", error);
    return res.status(500).json({ message: "No se pudo consultar la cuenta." });
  }
};
