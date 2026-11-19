"use strict";

const db = require("../models");
const { ROLES } = require("../security/roles");

exports.get = async (req, res) => {
  try {
    if (req.auth.role === ROLES.SUPERADMIN) {
      return res.json({ global: true, activeAssociationId: null, requiresSelection: false });
    }
    const associations = await db.associations.findAll({
      where: { id: { [require("sequelize").Op.in]: req.auth.associationIds || [] }, isActive: true },
      order: [["name", "ASC"]],
    });
    return res.json({
      global: false,
      activeAssociationId: req.auth.activeAssociationId,
      requiresSelection: associations.length > 1 && !req.auth.activeAssociationId,
      associations: associations.map(item => ({ id: item.id, name: item.name, slug: item.slug })),
    });
  } catch (error) {
    console.error("Error al consultar el contexto de asociación:", error);
    return res.status(500).json({ message: "No se pudo consultar el contexto." });
  }
};

exports.select = async (req, res) => {
  if (req.auth.role !== ROLES.ADMIN) {
    return res.status(403).json({ message: "La selección de contexto solo aplica a administradores de asociación." });
  }
  const associationId = Number(req.body?.associationId);
  if (!Number.isSafeInteger(associationId) || associationId < 1) {
    return res.status(400).json({ message: "associationId debe ser un entero positivo." });
  }
  if (!(req.auth.associationIds || []).includes(associationId)) {
    return res.status(403).json({ message: "No tienes una membresía activa en esa asociación." });
  }
  try {
    const association = await db.associations.findOne({
      where: { id: associationId, isActive: true },
    });
    if (!association) return res.status(404).json({ message: "Asociación no encontrada o inactiva." });
    await db.sequelize.transaction(async transaction => {
      const user = await db.usuarios.findByPk(req.auth.userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user || user.role !== ROLES.ADMIN || user.isActive === false) {
        throw Object.assign(new Error("La cuenta ya no está autorizada."), { status: 403 });
      }
      const membership = await db.associationMemberships.findOne({
        where: { userId: req.auth.userId, associationId, isActive: true }, transaction,
      });
      if (!membership) throw Object.assign(new Error("La membresía ya no está activa."), { status: 403 });
      await user.update({ activeAssociationId: associationId }, { transaction });
      await db.adminAudit.create({
        actorUserId: req.auth.userId, targetUserId: req.auth.userId,
        action: "association_context_selected", details: { associationId },
      }, { transaction });
    });
    return res.json({
      message: "Contexto de asociación actualizado.",
      activeAssociation: { id: association.id, name: association.name, slug: association.slug },
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("Error al seleccionar contexto de asociación:", error);
    return res.status(500).json({ message: "No se pudo actualizar el contexto." });
  }
};
