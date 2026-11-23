"use strict";

const { Op } = require("sequelize");
const db = require("../models");
const { ROLES } = require("../security/roles");
const { recordDeniedAssociationAccess, resolveAssociationIds } = require("../security/association-access");

const publicAssociation = association => ({
  id: association.id,
  name: association.name,
  slug: association.slug,
  isActive: association.isActive !== false,
  createdAt: association.createdAt,
  updatedAt: association.updatedAt,
});
const publicAdmin = user => ({
  id: user.id,
  nombre: user.nombre,
  username: user.username,
  role: user.role,
  isActive: user.isActive !== false,
  createdAt: user.createdAt,
});
const error = (status, message) => Object.assign(new Error(message), { status });
const parseId = value => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const validName = value => typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 160;
const validSlug = value => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
const slugFromName = name => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

function sendError(res, e) {
  if (e.status) return res.status(e.status).json({ message: e.message });
  if (e.name === "SequelizeUniqueConstraintError" || e.parent?.code === "23505") {
    return res.status(409).json({ message: "Ya existe una asociación con ese nombre o identificador." });
  }
  console.error("Error en gestión de asociaciones:", e);
  return res.status(500).json({ message: "No se pudo completar la operación." });
}

exports.list = async (req, res) => {
  try {
    // Association discovery is a public directory for authenticated admins.
    // It intentionally exposes association metadata only, never memberships.
    const where = { isActive: true };
    const rows = await db.associations.findAll({ where, order: [["name", "ASC"], ["id", "ASC"]] });
    return res.json({
      total: rows.length,
      asociaciones: rows.map(item => ({
        ...publicAssociation(item),
        isCurrent: item.id === req.auth.activeAssociationId,
      })),
      global: req.auth.role === ROLES.SUPERADMIN,
    });
  } catch (e) { return sendError(res, e); }
};

exports.get = async (req, res) => {
  const id = parseId(req.params.associationId);
  if (!id) return res.status(400).json({ message: "ID de asociación inválido." });
  try {
    const association = await db.associations.findByPk(id);
    if (!association) return res.status(404).json({ message: "Asociación no encontrada." });
    if (req.auth.role !== ROLES.SUPERADMIN) {
      const scope = await resolveAssociationIds(req);
      if (!scope.includes(id)) {
        await recordDeniedAssociationAccess(req, id, "association_detail_outside_membership");
        return res.status(404).json({ message: "Asociación no encontrada." });
      }
    }
    return res.json({ asociacion: publicAssociation(association) });
  } catch (e) { return sendError(res, e); }
};

exports.create = async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const slug = req.body?.slug === undefined ? slugFromName(name) : req.body.slug;
  if (!req.body || Object.keys(req.body).some(key => !["name", "slug"].includes(key)) || !validName(name) || !validSlug(slug)) {
    return res.status(400).json({ message: "Se requiere un nombre de 2-160 caracteres y un slug válido (a-z, 0-9 y guiones)." });
  }
  try {
    const association = await db.sequelize.transaction(async transaction => {
      const created = await db.associations.create({ name, slug }, { transaction });
      await db.adminAudit.create({
        actorUserId: req.auth.userId, targetUserId: req.auth.userId,
        action: "association_created", details: { associationId: created.id, name, slug },
      }, { transaction });
      return created;
    });
    return res.status(201).json({ asociacion: publicAssociation(association) });
  } catch (e) { return sendError(res, e); }
};

exports.update = async (req, res) => {
  const id = parseId(req.params.associationId);
  if (!id) return res.status(400).json({ message: "ID de asociación inválido." });
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => !["name", "slug"].includes(key)) ||
      (body.name === undefined && body.slug === undefined) ||
      (body.name !== undefined && !validName(body.name)) ||
      (body.slug !== undefined && !validSlug(body.slug))) {
    return res.status(400).json({ message: "Indica un nombre y/o slug válidos para actualizar." });
  }
  try {
    const association = await db.sequelize.transaction(async transaction => {
      const target = await db.associations.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!target) throw error(404, "Asociación no encontrada.");
      const before = { name: target.name, slug: target.slug };
      const changes = {};
      if (body.name !== undefined) changes.name = body.name.trim();
      if (body.slug !== undefined) changes.slug = body.slug;
      await target.update(changes, { transaction });
      await db.adminAudit.create({
        actorUserId: req.auth.userId, targetUserId: req.auth.userId,
        action: "association_updated", details: { associationId: id, before, after: changes },
      }, { transaction });
      return target;
    });
    return res.json({ asociacion: publicAssociation(association) });
  } catch (e) { return sendError(res, e); }
};

exports.setActive = async (req, res) => {
  const id = parseId(req.params.associationId);
  if (!id || typeof req.body?.isActive !== "boolean") {
    return res.status(400).json({ message: "ID e isActive (booleano) son obligatorios." });
  }
  try {
    const association = await db.sequelize.transaction(async transaction => {
      const target = await db.associations.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!target) throw error(404, "Asociación no encontrada.");
      if (target.isActive === req.body.isActive) return target;
      if (!req.body.isActive) {
        const activeCount = await db.associations.count({ where: { isActive: true }, transaction });
        if (activeCount <= 1) throw error(409, "No se puede desactivar la última asociación activa.");
      }
      const previous = target.isActive !== false;
      await target.update({ isActive: req.body.isActive }, { transaction });
      await db.adminAudit.create({
        actorUserId: req.auth.userId, targetUserId: req.auth.userId,
        action: req.body.isActive ? "association_activated" : "association_deactivated",
        details: { associationId: id, before: previous, after: req.body.isActive },
      }, { transaction });
      return target;
    });
    return res.json({ asociacion: publicAssociation(association) });
  } catch (e) { return sendError(res, e); }
};

exports.listAdmins = async (req, res) => {
  const associationId = parseId(req.params.associationId);
  if (!associationId) return res.status(400).json({ message: "ID de asociación inválido." });
  try {
    const association = await db.associations.findByPk(associationId);
    if (!association) return res.status(404).json({ message: "Asociación no encontrada." });
    const memberships = await db.associationMemberships.findAll({
      where: { associationId },
      order: [["createdAt", "ASC"]],
    });
    const admins = [];
    for (const membership of memberships) {
      const user = await db.usuarios.findByPk(membership.userId, { attributes: ["id", "nombre", "username", "role", "isActive", "createdAt"] });
      if (user?.role === ROLES.ADMIN) {
        admins.push({ ...publicAdmin(user), membershipActive: membership.isActive !== false });
      }
    }
    return res.json({ associationId, total: admins.length, administradores: admins });
  } catch (e) { return sendError(res, e); }
};

exports.assignAdmin = async (req, res) => {
  const associationId = parseId(req.params.associationId);
  const userId = parseId(req.body?.userId);
  if (!associationId || !userId) return res.status(400).json({ message: "associationId y userId deben ser enteros positivos." });
  try {
    const result = await db.sequelize.transaction(async transaction => {
      const association = await db.associations.findByPk(associationId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!association || association.isActive === false) throw error(404, "Asociación no encontrada o inactiva.");
      const user = await db.usuarios.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user || user.role !== ROLES.ADMIN || user.isActive === false) {
        throw error(404, "Administrador activo no encontrado.");
      }
      const activeMemberships = await db.associationMemberships.findAll({
        where: { associationId, isActive: true },
        attributes: ["userId"],
        transaction,
      });
      const activeUserIds = [...new Set(activeMemberships.map(item => Number(item.userId)))];
      const activeAdmins = activeUserIds.length
        ? await db.usuarios.count({
          where: { id: { [Op.in]: activeUserIds }, role: ROLES.ADMIN, isActive: true },
          transaction,
        })
        : 0;
      if (activeAdmins > 0) {
        throw error(409, "La asociación ya tiene administradores activos. Debes enviar una solicitud para incorporar otro administrador.");
      }
      const membership = await db.associationMemberships.findOne({
        where: { userId, associationId }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (membership?.isActive !== false && membership) throw error(409, "El administrador ya pertenece a esta asociación.");
      if (membership) {
        await membership.update({ isActive: true, createdByUserId: req.auth.userId }, { transaction });
      } else {
        await db.associationMemberships.create({
          userId, associationId, isActive: true, createdByUserId: req.auth.userId,
        }, { transaction });
      }
      await db.adminAudit.create({
        actorUserId: req.auth.userId, targetUserId: userId,
        action: "association_admin_assigned_initial", details: { associationId },
      }, { transaction });
      return { user, association };
    });
    return res.status(201).json({
      message: "Administrador asignado a la asociación.",
      asociacion: { id: result.association.id, name: result.association.name },
      administrador: publicAdmin(result.user),
    });
  } catch (e) { return sendError(res, e); }
};

exports.revokeAdmin = async (req, res) => {
  const associationId = parseId(req.params.associationId);
  const userId = parseId(req.params.userId);
  if (!associationId || !userId) return res.status(400).json({ message: "IDs de asociación y administrador inválidos." });
  try {
    const result = await db.sequelize.transaction(async transaction => {
      const association = await db.associations.findByPk(associationId, {
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!association) throw error(404, "Asociación no encontrada.");
      const membership = await db.associationMemberships.findOne({
        where: { userId, associationId, isActive: true }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!membership) throw error(404, "Membresía de administrador no encontrada.");
      const user = await db.usuarios.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user || user.role !== ROLES.ADMIN) throw error(404, "Administrador no encontrado.");
      await membership.update({ isActive: false }, { transaction });
      const remaining = await db.associationMemberships.findAll({
        where: { userId, isActive: true }, attributes: ["associationId"], transaction,
      });
      const remainingIds = remaining.map(item => Number(item.associationId));
      const nextContext = remainingIds.length === 1 ? remainingIds[0] : null;
      if (Number(user.activeAssociationId) === associationId) {
        await user.update({ activeAssociationId: nextContext }, { transaction });
      }
      await db.adminAudit.create({
        actorUserId: req.auth.userId, targetUserId: userId,
        action: "association_admin_revoked",
        details: { associationId, remainingAssociationIds: remainingIds },
      }, { transaction });
      return { user, remainingAssociationIds: remainingIds };
    });
    return res.json({
      message: "Membresía revocada. La cuenta del administrador se conserva.",
      userId,
      remainingAssociationIds: result.remainingAssociationIds,
    });
  } catch (e) { return sendError(res, e); }
};

 
exports.directoryAthletes = async (req, res) => {
  const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  const search = req.query.search === undefined ? "" : req.query.search;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 ||
      typeof search !== "string" || search.length > 120 ||
      (search.trim() && search.trim().length < 2)) {
    return res.status(400).json({ message: "Filtros o paginación del directorio inválidos." });
  }
  try {
    const where = {};
    if (search.trim()) {
      const escaped = search.trim().replace(/[\\%_]/g, "\\$&");
      where.nombre = { [Op.iLike]: "%" + escaped + "%" };
    }
    const result = await db.atletas.findAndCountAll({
      where,
      attributes: ["id", "nombre", "federacion", "createdAt"],
      order: [["nombre", "ASC"], ["id", "ASC"]],
      limit, offset,
    });
    return res.json({
      total: result.count, limit, offset,
      deportistas: result.rows.map(item => ({
        id: item.id, nombre: item.nombre, federacion: item.federacion,
        createdAt: item.createdAt,
      })),
    });
  } catch (e) { return sendError(res, e); }
};
