"use strict";

const crypto = require("crypto");
const { Op } = require("sequelize");
const db = require("../models");
const { ROLES } = require("../security/roles");
const { assertAssociationAccess } = require("../security/association-access");
const { normalizeUsername, validateUsername } = require("../utils/auth.validator");

exports.create = async (req, res) => {
  const associationId = Number(req.params.associationId);
  const invitedUsername = normalizeUsername(req.body?.username);
  if (!Number.isSafeInteger(associationId) || associationId < 1 || !validateUsername(invitedUsername))
    return res.status(400).json({ message: "Asociación y nombre de usuario válidos son obligatorios." });
  try {
    const result = await db.sequelize.transaction(async transaction => {
      const association = await db.associations.findByPk(associationId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!association || association.isActive === false)
        throw Object.assign(new Error("Asociación no encontrada o inactiva."), { status: 404 });
      await assertAssociationAccess(req, associationId);
      const target = await db.usuarios.findOne({ where: { username: invitedUsername }, transaction });
      if (!target || target.role !== ROLES.ATHLETE || target.isActive === false)
        throw Object.assign(new Error("No existe una cuenta activa de deportista con ese usuario."), { status: 404 });
      const existing = await db.associationMemberships.findOne({
        where: { userId: target.id, associationId, isActive: true }, transaction,
      });
      if (existing) throw Object.assign(new Error("El usuario ya pertenece a esta asociación."), { status: 409 });
      const pending = await db.associationInvitations.findOne({
        where: { associationId, invitedUsername, status: "pending", expiresAt: { [Op.gt]: new Date() } }, transaction,
      });
      if (pending) throw Object.assign(new Error("Ya existe una invitación pendiente para este usuario."), { status: 409 });
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const invitation = await db.associationInvitations.create({
        associationId, invitedUsername, tokenHash, status: "pending",
        createdByUserId: req.auth.userId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }, { transaction });
      return { token, invitation, association };
    });
    return res.status(201).json({
      invitacion: {
        id: result.invitation.id, username: result.invitation.invitedUsername,
        association: result.association.name, expiresAt: result.invitation.expiresAt,
        status: result.invitation.status,
      },
      token: result.token,
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("Error al crear invitación de asociación:", error);
    return res.status(500).json({ message: "No se pudo crear la invitación." });
  }
};
