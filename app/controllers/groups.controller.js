"use strict";

const db = require("../models");
const { Op, fn, col } = require("sequelize");
const { ROLES } = require("../security/roles");
const { resolveAssociationIds, assertAssociationAccess } = require("../security/association-access");
const { getDefaultAssociation } = require("../services/default-association");

const fail = (res, error) => {
  if (error.status) return res.status(error.status).json({ message: error.message });
  if (error.name === "SequelizeUniqueConstraintError" || error.parent?.code === "23505")
    return res.status(409).json({ message: "El nombre del grupo ya existe en esta asociación." });
  console.error("Error al administrar grupos:", error);
  return res.status(500).json({ message: "No se pudo completar la operación." });
};
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const id = value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw bad("ID inválido.");
  return number;
};
const page = query => {
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw bad("Paginación inválida.");
  return { limit, offset };
};
const validate = body => {
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : "";
  if (nombre.length < 2 || nombre.length > 120 || descripcion.length > 500)
    throw bad("Nombre de 2 a 120 caracteres y descripción de hasta 500.");
  return { nombre, descripcion: descripcion || null };
};
async function findAccessibleGroup(req, rawId) {
  const groupId = id(rawId);
  const group = await db.groups.findByPk(groupId);
  if (!group) throw bad("Grupo no encontrado.", 404);
  await assertAssociationAccess(req, group.associationId, { hideExistence: true });
  return group;
}
async function resolveCreateAssociation(req, rawAssociationId) {
  const ids = await resolveAssociationIds(req, rawAssociationId);
  let associationId;
  if (ids === null) {
    if (rawAssociationId !== undefined) associationId = Number(rawAssociationId);
    else associationId = (await getDefaultAssociation()).id;
  } else if (ids.length === 1) associationId = ids[0];
  else {
    if (rawAssociationId === undefined) throw bad("Debes indicar associationId cuando tienes acceso a varias asociaciones.");
    associationId = ids[0];
  }
  const association = await db.associations.findByPk(associationId);
  if (!association || association.isActive === false) throw bad("Asociación no encontrada o inactiva.", 404);
  if (association.slug === "asociacion-inicial") throw bad("La Asociación Pública es un directorio y no admite grupos.", 409);
  return associationId;
}

exports.list = async (req, res) => {
  try {
    const { limit, offset } = page(req.query);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search.length > 120) throw bad("Búsqueda demasiado larga.");
    const associationIds = await resolveAssociationIds(req, req.query.associationId);
    const whereGroup = {
      ...(search ? { nombre: { [Op.iLike]: "%" + search.replace(/[\\%_]/g, "\\$&") + "%" } } : {}),
      ...(associationIds ? { associationId: { [Op.in]: associationIds } } : {}),
    };
    const { count, rows } = await db.groups.findAndCountAll({
      where: whereGroup, order: [["nombre", "ASC"]], limit, offset,
    });
    const groupIds = rows.map(group => group.id);
    const totals = groupIds.length ? await db.userGroups.findAll({
      attributes: ["groupId", [fn("COUNT", col("user_id")), "total"]],
      where: { groupId: { [Op.in]: groupIds } }, group: ["groupId"],
    }) : [];
    const counts = new Map(totals.map(item => [item.groupId, Number(item.get("total"))]));
    return res.json({
      total: count, limit, offset, supportsAnalyticsFilter: true,
      grupos: rows.map(group => ({
        id: group.id, nombre: group.nombre, descripcion: group.descripcion,
        associationId: group.associationId, createdAt: group.createdAt,
        totalUsuarios: counts.get(group.id) || 0,
      })),
    });
  } catch (error) { return fail(res, error); }
};

exports.create = async (req, res) => {
  try {
    const data = validate(req.body);
    const associationId = await resolveCreateAssociation(req, req.body?.associationId);
    const group = await db.groups.create({ ...data, associationId });
    return res.status(201).json({ grupo: group });
  } catch (error) { return fail(res, error); }
};

exports.update = async (req, res) => {
  try {
    const group = await findAccessibleGroup(req, req.params.groupId);
    await group.update(validate(req.body));
    return res.json({ grupo: group });
  } catch (error) { return fail(res, error); }
};

exports.remove = async (req, res) => {
  try {
    const group = await findAccessibleGroup(req, req.params.groupId);
    await group.destroy();
    return res.json({ message: "Grupo eliminado. Los usuarios y sesiones se conservan." });
  } catch (error) { return fail(res, error); }
};

exports.members = async (req, res) => {
  try {
    const group = await findAccessibleGroup(req, req.params.groupId);
    const memberships = await db.userGroups.findAll({
      where: { groupId: group.id }, order: [["assignedAt", "ASC"]],
    });
    const memberIds = memberships.map(item => item.userId);
    const activeMemberships = memberIds.length ? await db.associationMemberships.findAll({
      where: { userId: { [Op.in]: memberIds }, associationId: group.associationId, isActive: true },
      attributes: ["userId"],
    }) : [];
    const validIds = [...new Set(activeMemberships.map(item => item.userId))];
    const users = validIds.length ? await db.usuarios.findAll({
      where: { id: { [Op.in]: validIds }, role: ROLES.ATHLETE },
      attributes: ["id", "nombre", "username"],
    }) : [];
    const byId = new Map(users.map(user => [user.id, user]));
    return res.json({
      grupo: { id: group.id, nombre: group.nombre, descripcion: group.descripcion },
      usuarios: memberships.filter(item => byId.has(item.userId)).map(item => ({
        id: item.userId, nombre: byId.get(item.userId).nombre,
        username: byId.get(item.userId).username, assignedAt: item.assignedAt,
      })),
    });
  } catch (error) { return fail(res, error); }
};

exports.assign = async (req, res) => {
  try {
    const group = await findAccessibleGroup(req, req.params.groupId);
    const userId = id(req.body?.userId);
    const user = await db.usuarios.findByPk(userId);
    if (!user || user.role !== ROLES.ATHLETE) throw bad("Solo se pueden asignar cuentas de deportistas.", 400);
    const [athlete, membership] = await Promise.all([
      db.atletas.findOne({ where: { userId }, attributes: ["id"] }),
      db.associationMemberships.findOne({
        where: { userId, associationId: group.associationId, isActive: true },
        attributes: ["userId"],
      }),
    ]);
    if (!athlete || !membership) throw bad("El deportista no pertenece activamente a la asociación de este grupo.", 400);
    const [membership, created] = await db.userGroups.findOrCreate({
      where: { groupId: group.id, userId }, defaults: { groupId: group.id, userId },
    });
    return res.status(created ? 201 : 200).json({
      asignacion: { groupId: group.id, userId, assignedAt: membership.assignedAt }, created,
    });
  } catch (error) { return fail(res, error); }
};

exports.unassign = async (req, res) => {
  try {
    const group = await findAccessibleGroup(req, req.params.groupId);
    const userId = id(req.params.userId);
    const deleted = await db.userGroups.destroy({ where: { groupId: group.id, userId } });
    if (!deleted) throw bad("Asignación no encontrada.", 404);
    return res.json({ message: "Deportista retirado del grupo." });
  } catch (error) { return fail(res, error); }
};
