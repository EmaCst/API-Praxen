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
function sendError(res, error) {
  if (error.status) return res.status(error.status).json({ message: error.message });
  console.error("Error al gestionar membresías:", error);
  return res.status(500).json({ message: "No se pudo completar la operación de membresía." });
}

async function activeAdminCount(associationId, transaction) {
  const rows = await db.associationMemberships.findAll({
    where: { associationId, isActive: true },
    attributes: ["userId"], transaction,
  });
  const ids = [...new Set(rows.map(row => Number(row.userId)))];
  if (!ids.length) return 0;
  return db.usuarios.count({
    where: { id: { [Op.in]: ids }, role: ROLES.ADMIN, isActive: true },
    transaction,
  });
}

exports.leaveOwn = async (req, res) => {
  const associationId = parseId(req.params.associationId);
  if (!associationId) return res.status(400).json({ message: "ID de asociación inválido." });
  if (![ROLES.ATHLETE, ROLES.ADMIN].includes(req.auth.role)) {
    return res.status(403).json({ message: "Esta cuenta no puede abandonar asociaciones." });
  }

  try {
    const result = await db.sequelize.transaction(async transaction => {
      const association = await db.associations.findByPk(associationId, {
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!association) throw fail(404, "Asociación no encontrada.");

      const membership = await db.associationMemberships.findOne({
        where: { userId: req.auth.userId, associationId, isActive: true },
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!membership) throw fail(404, "No tienes una membresía activa en esta asociación.");

      if (req.auth.role === ROLES.ADMIN && await activeAdminCount(associationId, transaction) <= 1) {
        throw fail(409, "No puedes abandonar la asociación porque eres su último administrador activo. Asigna primero a otro administrador.");
      }

      await membership.update({ isActive: false }, { transaction });
      let remainingAssociationIds = [];
      if (req.auth.role === ROLES.ADMIN) {
        const remaining = await db.associationMemberships.findAll({
          where: { userId: req.auth.userId, isActive: true },
          attributes: ["associationId"], transaction,
        });
        remainingAssociationIds = remaining.map(item => Number(item.associationId));
        if (Number(req.auth.activeAssociationId) === associationId) {
          const user = await db.usuarios.findByPk(req.auth.userId, {
            transaction, lock: transaction.LOCK.UPDATE,
          });
          if (user) await user.update({
            activeAssociationId: remainingAssociationIds.length === 1 ? remainingAssociationIds[0] : null,
          }, { transaction });
        }
      }

      await db.adminAudit.create({
        actorUserId: req.auth.userId,
        targetUserId: req.auth.userId,
        action: req.auth.role === ROLES.ADMIN ? "association_admin_left" : "association_athlete_left",
        details: { associationId, role: req.auth.role },
      }, { transaction });

      return { associationName: association.name, remainingAssociationIds };
    });

    return res.json({
      message: "Has abandonado la asociación. Tu cuenta, perfil e historial de entrenamientos se conservan.",
      association: { id: associationId, name: result.associationName },
      ...(req.auth.role === ROLES.ADMIN ? { remainingAssociationIds: result.remainingAssociationIds } : {}),
    });
  } catch (error) { return sendError(res, error); }
};

exports.removeAthlete = async (req, res) => {
  const associationId = parseId(req.params.associationId);
  const athleteId = parseId(req.params.athleteId);
  if (!associationId || !athleteId) {
    return res.status(400).json({ message: "Los identificadores de asociación y deportista deben ser enteros positivos." });
  }

  try {
    await assertAssociationAccess(req, associationId);
    const result = await db.sequelize.transaction(async transaction => {
      const association = await db.associations.findByPk(associationId, {
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!association || association.isActive === false) throw fail(404, "Asociación no encontrada o inactiva.");

      const athlete = await db.atletas.findByPk(athleteId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!athlete || !athlete.userId) throw fail(404, "Deportista no encontrado.");
      const targetUser = await db.usuarios.findByPk(athlete.userId, { transaction });
      if (!targetUser || targetUser.role !== ROLES.ATHLETE) throw fail(404, "Deportista no encontrado.");

      const membership = await db.associationMemberships.findOne({
        where: { userId: athlete.userId, associationId, isActive: true },
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!membership) throw fail(404, "El deportista no pertenece activamente a esta asociación.");

      await membership.update({ isActive: false }, { transaction });
      await db.adminAudit.create({
        actorUserId: req.auth.userId,
        targetUserId: athlete.userId,
        action: "association_athlete_removed",
        details: { associationId, athleteId },
      }, { transaction });

      return { athleteId, userId: athlete.userId, athleteName: athlete.nombre };
    });

    return res.json({
      message: "Deportista retirado de la asociación. Su cuenta, perfil y sesiones se conservan.",
      deportista: result,
      associationId,
    });
  } catch (error) { return sendError(res, error); }
};
