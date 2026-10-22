"use strict";

/**
 * Roles are stored on the account, not in a separate athlete/admin table.
 * The server resolves these permissions from the current database role on
 * every authenticated request. No client can self-assign or elevate a role.
 */
const ROLES = Object.freeze({
  ATHLETE: "athlete",
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
});

const PERMISSIONS = Object.freeze({
  RESULTS_OWN_READ: "results:own:read",
  RESULTS_OWN_WRITE: "results:own:write",
  RESULTS_ALL_READ: "results:all:read",
  RESULTS_FEDERATION_READ: "results:federation:read",
  RESULTS_ATHLETE_READ: "results:athlete:read",
  ATHLETES_LIST: "athletes:list",
  FEDERATIONS_LIST: "federations:list",
  ADMINS_MANAGE: "admins:manage",
  ADMINS_AUDIT_READ: "admins:audit:read",
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ATHLETE]: Object.freeze([
    PERMISSIONS.RESULTS_OWN_READ,
    PERMISSIONS.RESULTS_OWN_WRITE,
  ]),
  [ROLES.ADMIN]: Object.freeze([
    PERMISSIONS.RESULTS_ALL_READ,
    PERMISSIONS.RESULTS_FEDERATION_READ,
    PERMISSIONS.RESULTS_ATHLETE_READ,
    PERMISSIONS.ATHLETES_LIST,
    PERMISSIONS.FEDERATIONS_LIST,
  ]),
  [ROLES.SUPERADMIN]: Object.freeze([
    PERMISSIONS.RESULTS_ALL_READ,
    PERMISSIONS.RESULTS_FEDERATION_READ,
    PERMISSIONS.RESULTS_ATHLETE_READ,
    PERMISSIONS.ATHLETES_LIST,
    PERMISSIONS.FEDERATIONS_LIST,
    PERMISSIONS.ADMINS_MANAGE,
    PERMISSIONS.ADMINS_AUDIT_READ,
  ]),
});

function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.auth || !req.auth.permissions.includes(permission)) {
      return res.status(403).json({ message: "No tienes permisos para esta operación." });
    }
    return next();
  };
}

module.exports = { ROLES, PERMISSIONS, ROLE_PERMISSIONS, permissionsFor, requirePermission };
