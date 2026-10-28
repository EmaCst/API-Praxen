"use strict";

const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const db = require("../models");
const { ROLES } = require("../security/roles");

const TEMPORARY_PASSWORD = "praxen01";
function fail(res, error) {
  if (error.status) return res.status(error.status).json({ message: error.message });
  console.error("Error de gestión de usuarios:", error);
  return res.status(500).json({ message: "No se pudo completar la operación." });
}
function validationError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function page(req) {
  const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
    throw validationError("Paginación inválida.");
  }
  return { limit, offset };
}

exports.list = async (req, res) => {
  try {
    const { limit, offset } = page(req);
    const search = req.query.search === undefined ? "" : req.query.search;
    const role = req.query.role === undefined ? "" : req.query.role;
    if (typeof search !== "string" || search.length > 120 || typeof role !== "string" ||
        (role && !Object.values(ROLES).includes(role))) {
      throw validationError("Filtros de usuarios inválidos.");
    }
    const where = { ...(role ? { role } : {}) };
    if (search.trim()) {
      const escaped = search.trim().replace(/[\\%_]/g, "\\$&");
      where[Op.or] = [
        { nombre: { [Op.iLike]: `%${escaped}%` } },
        { username: { [Op.iLike]: `%${escaped}%` } },
      ];
    }
    const { count, rows } = await db.usuarios.findAndCountAll({
      where,
      attributes: ["id", "nombre", "username", "role", "isActive", "mustChangePassword", "createdAt"],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit, offset,
    });
    return res.json({ total: count, limit, offset, usuarios: rows });
  } catch (error) { return fail(res, error); }
};

exports.resetPassword = async (req, res) => {
  const targetId = Number(req.params.userId);
  const adminPassword = req.body?.adminPassword;
  if (!Number.isSafeInteger(targetId) || targetId < 1 || targetId === req.auth.userId ||
      typeof adminPassword !== "string" || !adminPassword || adminPassword.length > 1000) {
    return res.status(400).json({ message: "Usuario o confirmación de contraseña inválidos." });
  }
  try {
    const actor = await db.usuarios.findByPk(req.auth.userId);
    if (!actor || actor.role !== ROLES.SUPERADMIN || actor.isActive === false ||
        !(await bcrypt.compare(adminPassword, actor.passwordHash))) {
      return res.status(403).json({ message: "No se pudo confirmar la identidad del Super Admin." });
    }
    const passwordHash = await bcrypt.hash(TEMPORARY_PASSWORD, 12);
    await db.sequelize.transaction(async (transaction) => {
      const account = await db.usuarios.findByPk(targetId, {
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!account || ![ROLES.ATHLETE, ROLES.ADMIN].includes(account.role)) {
        throw validationError("Solo se pueden restablecer deportistas y administradores normales.", 403);
      }
      await account.update({
        passwordHash,
        mustChangePassword: true,
        tokenVersion: account.tokenVersion + 1,
      }, { transaction });
      await db.adminAudit.create({
        actorUserId: actor.id,
        targetUserId: account.id,
        action: "password_reset",
        details: { temporary: true },
      }, { transaction });
    });
    return res.json({ message: "Contraseña temporal establecida. El usuario deberá cambiarla al iniciar sesión." });
  } catch (error) { return fail(res, error); }
};
