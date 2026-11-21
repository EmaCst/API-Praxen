"use strict";

const { Op } = require("sequelize");
const db = require("../models");
const { ROLES } = require("../security/roles");
const { assertAssociationAccess } = require("../security/association-access");

const fail = (status, message) => Object.assign(new Error(message), { status });
const parseId = value => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const sendError = (res, error) => {
  if (error.status) return res.status(error.status).json({ message: error.message });
  if (error.name === "SequelizeUniqueConstraintError" || error.parent?.code === "23505") {
    return res.status(409).json({ message: "Ya existe una solicitud pendiente para esta cuenta y asociación." });
  }
  console.error("Error en solicitudes de administradores:", error);
  return res.status(500).json({ message: "No se pudo completar la operación." });
};

async function activeAdminCount(associationId, transaction) {
  const memberships = await db.associationMemberships.findAll({
    where: { associationId, isActive: true },
    attributes: ["userId"],
    transaction,
  });
  const ids = [...new Set(memberships.map(item => Number(item.userId)))];
  if (!ids.length) return 0;
  return db.usuarios.count({
    where: { id: { [Op.in]: ids }, role: ROLES.ADMIN, isActive: true },
    transaction,
  });
}

async function assertReviewer(req, associationId, transaction) {
  if (req.auth.role !== ROLES.ADMIN) throw fail(403, "Solo un administrador de la asociación puede decidir esta solicitud.");
  const user = await db.usuarios.findByPk(req.auth.userId, { transaction });
  if (!user || user.role !== ROLES.ADMIN || user.isActive === false) {
    throw fail(403, "Tu cuenta ya no está autorizada para administrar esta asociación.");
  }
  const membership = await db.associationMemberships.findOne({
    where: { userId: req.auth.userId, associationId, isActive: true },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!membership) throw fail(403, "No tienes una membresía administrativa activa en esta asociación.");
}

async function requestView(request) {
  const [target, requester, decider] = await Promise.all([
    db.usuarios.findByPk(request.targetUserId, { attributes: ["id", "nombre", "username"] }),
    db.usuarios.findByPk(request.requestedByUserId, { attributes: ["id", "nombre", "username"] }),
    request.decidedByUserId
      ? db.usuarios.findByPk(request.decidedByUserId, { attributes: ["id", "nombre", "username"] })
      : null,
  ]);
  return {
    id: request.id,
    associationId: request.associationId,
    status: request.status,
    createdAt: request.createdAt,
    decidedAt: request.decidedAt,
    target: target ? { id: target.id, nombre: target.nombre, username: target.username } : null,
    requestedBy: requester ? { id: requester.id, nombre: requester.nombre, username: requester.username } : null,
    decidedBy: decider ? { id: decider.id, nombre: decider.nombre, username: decider.username } : null,
  };
}

exports.create = async (req, res) => {
  const associationId = parseId(req.params.associationId);
  const targetUserId = parseId(req.body?.userId);
  if (!associationId || !targetUserId) {
    return res.status(400).json({ message: "associationId y userId deben ser enteros positivos." });
  }
  if (req.auth.role !== ROLES.SUPERADMIN) {
    return res.status(403).json({ message: "Solo el superadmin puede solicitar la incorporación de administradores." });
  }
  try {
    const created = await db.sequelize.transaction(async transaction => {
      const association = await db.associations.findByPk(associationId, {
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!association || association.isActive === false) throw fail(404, "Asociación no encontrada o inactiva.");
      const target = await db.usuarios.findByPk(targetUserId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!target || target.role !== ROLES.ADMIN || target.isActive === false) {
        throw fail(404, "No se encontró una cuenta activa con rol Administrador.");
      }
      if (await activeAdminCount(associationId, transaction) === 0) {
        throw fail(409, "La asociación no tiene administradores activos. Asigna directamente al primer administrador.");
      }
      const membership = await db.associationMemberships.findOne({
        where: { userId: targetUserId, associationId, isActive: true }, transaction,
      });
      if (membership) throw fail(409, "El administrador ya pertenece a esta asociación.");
      const request = await db.associationAdminRequests.create({
        associationId,
        targetUserId,
        requestedByUserId: req.auth.userId,
        status: "pending",
      }, { transaction });
      await db.adminAudit.create({
        actorUserId: req.auth.userId,
        targetUserId,
        action: "association_admin_request_created",
        details: { associationId, requestId: request.id },
      }, { transaction });
      return request;
    });
    return res.status(201).json({ solicitud: await requestView(created) });
  } catch (error) { return sendError(res, error); }
};

exports.list = async (req, res) => {
  const associationId = parseId(req.params.associationId);
  if (!associationId) return res.status(400).json({ message: "ID de asociación inválido." });
  try {
    const association = await db.associations.findByPk(associationId);
    if (!association || association.isActive === false) throw fail(404, "Asociación no encontrada o inactiva.");
    await assertAssociationAccess(req, associationId);
    if (req.auth.role === ROLES.ADMIN) {
      await assertReviewer(req, associationId);
    } else if (req.auth.role !== ROLES.SUPERADMIN) {
      throw fail(403, "No tienes permiso para consultar solicitudes administrativas.");
    }
    const status = req.query.status;
    if (status !== undefined && !["pending", "approved", "rejected"].includes(status)) {
      throw fail(400, "El estado solicitado no es válido.");
    }
    const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
      throw fail(400, "Paginación inválida.");
    }
    const where = { associationId, ...(status ? { status } : {}) };
    const { count, rows } = await db.associationAdminRequests.findAndCountAll({
      where, order: [["createdAt", "DESC"], ["id", "DESC"]], limit, offset,
    });
    return res.json({
      total: count, limit, offset,
      solicitudes: await Promise.all(rows.map(requestView)),
    });
  } catch (error) { return sendError(res, error); }
};

exports.decide = async (req, res) => {
  const associationId = parseId(req.params.associationId);
  const requestId = parseId(req.params.requestId);
  const decision = req.body?.decision;
  if (!associationId || !requestId || !["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ message: "Indica una asociación, solicitud y decisión válida (approved/rejected)." });
  }
  try {
    const request = await db.sequelize.transaction(async transaction => {
      const association = await db.associations.findByPk(associationId, {
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!association || association.isActive === false) throw fail(404, "Asociación no encontrada o inactiva.");
      await assertReviewer(req, associationId, transaction);
      const current = await db.associationAdminRequests.findOne({
        where: { id: requestId, associationId }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!current) throw fail(404, "Solicitud no encontrada.");
      if (current.status !== "pending") throw fail(409, "Esta solicitud ya fue resuelta.");
      const target = await db.usuarios.findByPk(current.targetUserId, { transaction, lock: transaction.LOCK.UPDATE });
      if (decision === "approved") {
        if (!target || target.role !== ROLES.ADMIN || target.isActive === false) {
          throw fail(409, "La cuenta propuesta ya no es un administrador activo.");
        }
        const existing = await db.associationMemberships.findOne({
          where: { userId: target.id, associationId, isActive: true }, transaction,
        });
        if (existing) throw fail(409, "La cuenta ya pertenece a esta asociación.");
        const membership = await db.associationMemberships.findOne({
          where: { userId: target.id, associationId }, transaction, lock: transaction.LOCK.UPDATE,
        });
        if (membership) {
          await membership.update({ isActive: true, createdByUserId: current.requestedByUserId }, { transaction });
        } else {
          await db.associationMemberships.create({
            userId: target.id,
            associationId,
            isActive: true,
            createdByUserId: current.requestedByUserId,
          }, { transaction });
        }
      }
      await current.update({
        status: decision,
        decidedByUserId: req.auth.userId,
        decidedAt: new Date(),
      }, { transaction });
      await db.adminAudit.create({
        actorUserId: req.auth.userId,
        targetUserId: current.targetUserId,
        action: decision === "approved" ? "association_admin_request_approved" : "association_admin_request_rejected",
        details: {
          associationId,
          requestId: current.id,
          requestedByUserId: current.requestedByUserId,
        },
      }, { transaction });
      return current;
    });
    return res.json({ message: decision === "approved" ? "Solicitud aprobada. El administrador ya tiene acceso." : "Solicitud rechazada.", solicitud: await requestView(request) });
  } catch (error) { return sendError(res, error); }
};

exports.audit = async (req, res) => {
  const associationId = parseId(req.params.associationId);
  if (!associationId) return res.status(400).json({ message: "ID de asociación inválido." });
  try {
    await assertAssociationAccess(req, associationId);
    if (req.auth.role === ROLES.ADMIN) {
      await assertReviewer(req, associationId);
    } else if (req.auth.role !== ROLES.SUPERADMIN) {
      throw fail(403, "No tienes permiso para consultar la auditoría.");
    }
    const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
      throw fail(400, "Paginación inválida.");
    }
    const where = db.sequelize.literal("details->>'associationId' = '" + associationId + "'");
    const { count, rows } = await db.adminAudit.findAndCountAll({
      where, order: [["createdAt", "DESC"], ["id", "DESC"]], limit, offset,
      attributes: ["id", "actorUserId", "targetUserId", "action", "details", "createdAt"],
    });
    return res.json({ total: count, limit, offset, eventos: rows });
  } catch (error) { return sendError(res, error); }
};
