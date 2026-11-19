"use strict";

const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const db = require("../models");
const { ROLES, permissionsFor } = require("../security/roles");

/**
 * JWT identifies the account, but neither role nor tenant scope is trusted
 * from its claims. Current role and active association memberships are read
 * from PostgreSQL for every authenticated request.
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
    const user = await db.usuarios.findByPk(userId, {
      attributes: ["id", "role", "isActive", "tokenVersion", "mustChangePassword"],
    });
    const role = user?.role;
    if (!user || !Number.isInteger(claims.tv) || claims.tv !== user.tokenVersion) {
      return res.status(401).json({ message: "La sesión fue revocada. Inicia sesión nuevamente." });
    }
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

    let associationIds = [];
    if (role === ROLES.ADMIN) {
      const memberships = await db.associationMemberships.findAll({
        where: { userId, isActive: true },
        attributes: ["associationId"],
      });
      const membershipIds = [...new Set(memberships.map(item => Number(item.associationId))
        .filter(id => Number.isSafeInteger(id) && id > 0))];
      if (!membershipIds.length) {
        return res.status(403).json({ message: "Tu cuenta no tiene una asociación activa asignada." });
      }
      const activeAssociations = await db.associations.findAll({
        where: { id: { [Op.in]: membershipIds }, isActive: true },
        attributes: ["id"],
      });
      associationIds = [...new Set(activeAssociations.map(item => Number(item.id)))];
      if (!associationIds.length) {
        return res.status(403).json({ message: "Tu cuenta no tiene una asociación activa asignada." });
      }
    } else if (role === ROLES.SUPERADMIN) {
      // null explicitly means global scope; [] means no access and is never
      // used for a superadmin.
      associationIds = null;
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

    const currentPath = req.originalUrl.split("?")[0];
    if (user.mustChangePassword === true &&
        !["/api/auth/change-password", "/api/auth/me"].includes(currentPath)) {
      return res.status(403).json({
        message: "Debes cambiar tu contraseña temporal antes de continuar.",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    }

    req.auth = {
      userId,
      role,
      athleteId: isAthlete ? athleteId : null,
      associationIds,
      permissions: permissionsFor(role),
    };
    return next();
  } catch (error) {
    console.error("No se pudo comprobar la autorización de la cuenta:", error);
    return res.status(503).json({ message: "No se pudo validar la sesión." });
  }
};
