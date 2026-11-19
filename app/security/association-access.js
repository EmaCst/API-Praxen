"use strict";

const db = require("../models");
const { ROLES } = require("./roles");

function accessError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function recordDeniedAssociationAccess(req, associationId, reason = "outside_membership") {
  if (!req?.auth?.userId || !db.adminAudit?.create) return;
  try {
    // admin_audit_logs requires a target user. For access attempts without a
    // known target account, actor and target are the same account.
    await db.adminAudit.create({
      actorUserId: req.auth.userId,
      targetUserId: req.auth.userId,
      action: "association_access_denied",
      details: {
        associationId: Number.isSafeInteger(Number(associationId)) ? Number(associationId) : null,
        method: req.method,
        path: req.originalUrl,
        role: req.auth.role,
        reason,
      },
    });
  } catch (error) {
    // Denial must never be weakened by an audit-storage failure.
    console.error("No se pudo registrar un intento de acceso entre asociaciones:", error.message);
  }
}

/**
 * Returns null for a global superadmin, or the exact set of associations the
 * current admin may access. A requested tenant can only narrow that set.
 */
async function resolveAssociationIds(req, requestedAssociationId) {
  const requested = requestedAssociationId === undefined || requestedAssociationId === null || requestedAssociationId === ""
    ? null : Number(requestedAssociationId);
  if (requested !== null && (!Number.isSafeInteger(requested) || requested < 1)) {
    throw accessError(400, "associationId debe ser un entero positivo.");
  }

  if (req.auth?.role === ROLES.SUPERADMIN) {
    if (requested === null) return null;
    const association = await db.associations.findByPk(requested);
    if (!association || association.isActive === false) {
      throw accessError(404, "Asociación no encontrada o inactiva.");
    }
    return [requested];
  }

  if (req.auth?.role !== ROLES.ADMIN || !Array.isArray(req.auth.associationIds) ||
      req.auth.associationIds.length === 0) {
    throw accessError(403, "No tienes una asociación activa asignada.");
  }

  const allowed = [...new Set(req.auth.associationIds.map(Number))];
  if (requested !== null && !allowed.includes(requested)) {
    await recordDeniedAssociationAccess(req, requested);
    throw accessError(403, "No tienes acceso a esta asociación.");
  }
  return requested === null ? allowed : [requested];
}

async function assertAssociationAccess(req, associationId, { hideExistence = false } = {}) {
  const ids = await resolveAssociationIds(req);
  if (ids === null || ids.includes(Number(associationId))) return true;
  await recordDeniedAssociationAccess(req, associationId);
  throw accessError(hideExistence ? 404 : 403,
    hideExistence ? "Recurso no encontrado." : "No tienes acceso a esta asociación.");
}

module.exports = {
  accessError,
  resolveAssociationIds,
  assertAssociationAccess,
  recordDeniedAssociationAccess,
};
