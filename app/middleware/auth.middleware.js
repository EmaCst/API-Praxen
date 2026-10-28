"use strict";

const jwt = require("jsonwebtoken");
const db = require("../models");
const { ROLES, permissionsFor } = require("../security/roles");

/**
 * JWT identifies the account, but its role never authorizes anything on its
 * own. The account's CURRENT role is checked in PostgreSQL for each request:
 * promotions, demotions and revocations take effect without waiting for an
 * old JWT to expire. App tokens and dashboard tokens have distinct audiences.
 */
module.exports = async function authenticate(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    return res.status(503).json({ message: "La autenticación no está configurada." });
  }
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  if (!match) return res.status(401).json({ message: "Se requiere un token Bearer." });

  let claims;
  try {
    claims = jwt.verify(match[1], secret, {
      issuer: "api-praxen",
      audience: ["praxen-app", "praxen-dashboard"],
    });
  } catch (_) {
    return res.status(401).json({ message: "El token no es válido o ha caducado." });
  }

  const userId = Number(claims.sub);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(401).json({ message: "El token no es válido o ha caducado." });
  }

  try {
    const user = await db.usuarios.findByPk(userId, { attributes: ["id", "role", "isActive", "tokenVersion", "mustChangePassword"] });
    const role = user?.role;
    if(!user||!Number.isInteger(claims.tv)||claims.tv!==user.tokenVersion)return res.status(401).json({message:"La sesión fue revocada. Inicia sesión nuevamente."});
    if (!role || user.isActive === false || !permissionsFor(role).length) {
      return res.status(401).json({ message: "La cuenta ya no está autorizada." });
    }
    const isAthlete = role === ROLES.ATHLETE;
    const isAdmin = role === ROLES.ADMIN || role === ROLES.SUPERADMIN;
    const athleteId = Number(claims.athleteId);
    if (isAthlete && (claims.aud !== "praxen-app" ||
        !Number.isSafeInteger(athleteId) || athleteId < 1)) {
      return res.status(401).json({ message: "El token no corresponde a una sesión de atleta." });
    }
    if (isAdmin && (claims.aud !== "praxen-dashboard" || claims.athleteId !== undefined)) {
      return res.status(401).json({ message: "Se necesita iniciar sesión como administrador." });
    }
    if (isAthlete) {
      const athlete = await db.atletas.findOne({
        where: { id: athleteId, userId },
        attributes: ["id"],
      });
      if (!athlete) {
        return res.status(401).json({ message: "El atleta ya no está asociado a esta cuenta." });
      }
    }
    if(user.mustChangePassword===true && !["/api/auth/change-password","/api/auth/me"].includes(req.originalUrl.split("?")[0]))return res.status(403).json({message:"Debes cambiar tu contraseña temporal antes de continuar.",code:"PASSWORD_CHANGE_REQUIRED"});
    if (user.mustChangePassword === true &&
        !["/api/auth/change-password", "/api/auth/me"].includes(req.originalUrl.split("?")[0])) {
      return res.status(403).json({message:"Debes cambiar tu contraseña temporal antes de continuar.",code:"PASSWORD_CHANGE_REQUIRED"});
    }
    req.auth = {
      userId,
      role,
      athleteId: isAthlete ? athleteId : null,
      permissions: permissionsFor(role),
    };
    return next();
  } catch (error) {
    console.error("No se pudo comprobar el rol de la cuenta:", error);
    return res.status(503).json({ message: "No se pudo validar la sesión." });
  }
};
