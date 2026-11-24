"use strict";

const { Op } = require("sequelize");
const db = require("../models");
const { ROLES } = require("../security/roles");
const { normalizeUsername } = require("../utils/auth.validator");

const fail = (status, message) => Object.assign(new Error(message), { status });
const parseId = value => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

function sendError(res, error) {
  if (error.status) return res.status(error.status).json({ message: error.message });
  console.error("Error al responder invitación de asociación:", error);
  return res.status(500).json({ message: "No se pudo completar la operación de invitación." });
}

async function invitationView(item) {
  const association = await db.associations.findByPk(item.associationId, {
    attributes: ["id", "name", "slug"],
  });
  const creator = await db.usuarios.findByPk(item.createdByUserId, {
    attributes: ["id", "nombre", "username"],
  });
  return {
    id: item.id,
    status: item.status,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    association: association ? { id: association.id, name: association.name, slug: association.slug } : null,
    invitedBy: creator ? { nombre: creator.nombre, username: creator.username } : null,
  };
}

exports.listMine = async (req, res) => {
  if (req.auth.role !== ROLES.ATHLETE) {
    return res.status(403).json({ message: "Solo los deportistas pueden consultar sus invitaciones." });
  }
  try {
    const user = await db.usuarios.findByPk(req.auth.userId, { attributes: ["id", "username", "isActive"] });
    if (!user || user.isActive === false) throw fail(401, "La cuenta no está disponible.");
    const now = new Date();
    await db.associationInvitations.update(
      { status: "expired" },
      { where: { invitedUsername: normalizeUsername(user.username), status: "pending", expiresAt: { [Op.lte]: now } } }
    );
    const rows = await db.associationInvitations.findAll({
      where: { invitedUsername: normalizeUsername(user.username), status: "pending", expiresAt: { [Op.gt]: now } },
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      attributes: ["id", "associationId", "createdByUserId", "status", "expiresAt", "createdAt"],
    });
    return res.json({ invitaciones: await Promise.all(rows.map(invitationView)) });
  } catch (error) { return sendError(res, error); }
};

exports.respond = async (req, res) => {
  if (req.auth.role !== ROLES.ATHLETE) {
    return res.status(403).json({ message: "Solo los deportistas pueden responder invitaciones." });
  }
  const invitationId = parseId(req.params.invitationId);
  const action = req.body?.action;
  if (!invitationId || !["accept", "decline"].includes(action)) {
    return res.status(400).json({ message: "La invitación y la respuesta solicitada no son válidas." });
  }

  try {
    const result = await db.sequelize.transaction(async transaction => {
      const user = await db.usuarios.findByPk(req.auth.userId, {
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!user || user.isActive === false || !user.username) throw fail(401, "La cuenta no está disponible.");
      const invitation = await db.associationInvitations.findByPk(invitationId, {
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!invitation || normalizeUsername(invitation.invitedUsername) !== normalizeUsername(user.username)) {
        throw fail(404, "No encontramos una invitación pendiente para tu cuenta.");
      }
      if (invitation.status !== "pending") throw fail(409, "Esta invitación ya no está pendiente.");
      if (invitation.expiresAt <= new Date()) {
        await invitation.update({ status: "expired" }, { transaction });
        return { expired: true };
      }
      const association = await db.associations.findByPk(invitation.associationId, {
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!association || association.isActive === false) throw fail(409, "La asociación ya no está disponible.");

      if (action === "accept") {
        const membership = await db.associationMemberships.findOne({
          where: { userId: user.id, associationId: association.id },
          transaction, lock: transaction.LOCK.UPDATE,
        });
        if (membership?.isActive) throw fail(409, "Ya perteneces a esta asociación.");
        if (membership) await membership.update({ isActive: true, createdByUserId: invitation.createdByUserId }, { transaction });
        else await db.associationMemberships.create({
          userId: user.id,
          associationId: association.id,
          isActive: true,
          createdByUserId: invitation.createdByUserId,
        }, { transaction });
      }

      await invitation.update({
        status: action === "accept" ? "accepted" : "declined",
        ...(action === "accept" ? { acceptedByUserId: user.id, acceptedAt: new Date() } : {}),
      }, { transaction });
      await db.adminAudit.create({
        actorUserId: user.id,
        targetUserId: user.id,
        action: action === "accept" ? "association_invitation_accepted" : "association_invitation_declined",
        details: { associationId: association.id, invitationId: invitation.id },
      }, { transaction });
      return { action, association: { id: association.id, name: association.name } };
    });

    if (result.expired) return res.status(409).json({ message: "La invitación ha vencido." });
    return res.json({
      message: result.action === "accept"
        ? "Te has unido a " + result.association.name + "."
        : "Has rechazado la invitación de " + result.association.name + ".",
      asociacion: result.association,
      status: result.action === "accept" ? "accepted" : "declined",
    });
  } catch (error) { return sendError(res, error); }
};
