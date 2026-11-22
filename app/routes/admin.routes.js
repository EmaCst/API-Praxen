"use strict";

const router = require("express").Router();
const { admin } = require("../controllers/resultados.controller");
const { PERMISSIONS, requirePermission } = require("../security/roles");
const manage = require("../controllers/admin-management.controller");
const associations = require("../controllers/association-management.controller");
const associationContext = require("../controllers/association-context.controller");
const groups=require("../controllers/groups.controller");
const users=require("../controllers/users-management.controller");
const invitations=require("../controllers/association-invitations.controller");
const adminRequests=require("../controllers/association-admin-requests.controller");
const { rateLimit } = require("express-rate-limit");
const adminMutationLimit = rateLimit({ windowMs:15*60*1000,limit:15,standardHeaders:"draft-7",legacyHeaders:false });

// Association discovery and context selection are available to scoped admins.
// Only the global superadmin can create/update/deactivate associations or assign admins.
router.get("/asociaciones", requirePermission(PERMISSIONS.ASSOCIATIONS_READ), associations.list);
router.get("/contexto-asociacion", requirePermission(PERMISSIONS.ASSOCIATION_CONTEXT_MANAGE), associationContext.get);
router.put("/contexto-asociacion", requirePermission(PERMISSIONS.ASSOCIATION_CONTEXT_MANAGE), adminMutationLimit, associationContext.select);
router.post("/asociaciones", requirePermission(PERMISSIONS.ASSOCIATIONS_MANAGE), adminMutationLimit, associations.create);
router.get("/asociaciones/:associationId/administradores", requirePermission(PERMISSIONS.ASSOCIATIONS_MANAGE), associations.listAdmins);
router.post("/asociaciones/:associationId/administradores", requirePermission(PERMISSIONS.ASSOCIATIONS_MANAGE), adminMutationLimit, associations.assignAdmin);
router.delete("/asociaciones/:associationId/administradores/:userId", requirePermission(PERMISSIONS.ASSOCIATIONS_MANAGE), adminMutationLimit, associations.revokeAdmin);
router.post("/asociaciones/:associationId/solicitudes-administrador", requirePermission(PERMISSIONS.ASSOCIATIONS_MANAGE), adminMutationLimit, adminRequests.create);
router.get("/asociaciones/:associationId/solicitudes-administrador", requirePermission(PERMISSIONS.ASSOCIATION_ADMIN_REQUESTS_REVIEW), adminRequests.list);
router.patch("/asociaciones/:associationId/solicitudes-administrador/:requestId", requirePermission(PERMISSIONS.ASSOCIATION_ADMIN_REQUESTS_REVIEW), adminMutationLimit, adminRequests.decide);
router.get("/asociaciones/:associationId/auditoria-administradores", requirePermission(PERMISSIONS.ASSOCIATION_ADMIN_REQUESTS_REVIEW), adminRequests.audit);
router.get("/asociaciones/:associationId", requirePermission(PERMISSIONS.ASSOCIATIONS_READ), associations.get);
router.patch("/asociaciones/:associationId", requirePermission(PERMISSIONS.ASSOCIATIONS_MANAGE), adminMutationLimit, associations.update);
router.patch("/asociaciones/:associationId/estado", requirePermission(PERMISSIONS.ASSOCIATIONS_MANAGE), adminMutationLimit, associations.setActive);

router.post("/asociaciones/:associationId/invitaciones",requirePermission(PERMISSIONS.ASSOCIATION_INVITATIONS_MANAGE),adminMutationLimit,invitations.create);\nrouter.get("/asociaciones/:associationId/invitaciones",requirePermission(PERMISSIONS.ASSOCIATION_INVITATIONS_MANAGE),invitations.list);\nrouter.delete("/asociaciones/:associationId/invitaciones/:invitationId",requirePermission(PERMISSIONS.ASSOCIATION_INVITATIONS_MANAGE),adminMutationLimit,invitations.revoke);
router.get("/grupos",requirePermission(PERMISSIONS.GROUPS_READ),groups.list);
router.get("/grupos/:groupId/usuarios",requirePermission(PERMISSIONS.GROUPS_READ),groups.members);
router.post("/grupos",requirePermission(PERMISSIONS.GROUPS_MANAGE),adminMutationLimit,groups.create);
router.patch("/grupos/:groupId",requirePermission(PERMISSIONS.GROUPS_MANAGE),adminMutationLimit,groups.update);
router.delete("/grupos/:groupId",requirePermission(PERMISSIONS.GROUPS_MANAGE),adminMutationLimit,groups.remove);
router.post("/grupos/:groupId/usuarios",requirePermission(PERMISSIONS.GROUPS_MANAGE),adminMutationLimit,groups.assign);
router.delete("/grupos/:groupId/usuarios/:userId",requirePermission(PERMISSIONS.GROUPS_MANAGE),adminMutationLimit,groups.unassign);
router.get("/usuarios",requirePermission(PERMISSIONS.USERS_MANAGE),users.list);
router.post("/usuarios/:userId/restablecer-password",requirePermission(PERMISSIONS.USERS_MANAGE),adminMutationLimit,users.resetPassword);
router.get("/atletas", requirePermission(PERMISSIONS.ATHLETES_LIST), admin.athletes);
router.get("/administradores", requirePermission(PERMISSIONS.ADMINS_MANAGE), manage.list);
router.post("/administradores", requirePermission(PERMISSIONS.ADMINS_MANAGE), adminMutationLimit, manage.create);
router.patch("/administradores/:userId/estado", requirePermission(PERMISSIONS.ADMINS_MANAGE), adminMutationLimit, manage.setActive);
router.get("/administradores/auditoria", requirePermission(PERMISSIONS.ADMINS_AUDIT_READ), manage.audit);
router.get("/federaciones", requirePermission(PERMISSIONS.FEDERATIONS_LIST), admin.federations);
router.get("/resultados/metricas", admin.metadata);
router.get("/resultados/ultima", admin.latest);
router.get("/resultados/resumen", admin.summary);
router.get("/resultados/evolucion", admin.evolution);
router.get("/resultados/federaciones/resumen", requirePermission(PERMISSIONS.RESULTS_FEDERATION_READ), admin.federationSummary);
router.get("/resultados/sesiones", admin.sessions);
router.get("/resultados/sesiones/:sessionId", requirePermission(PERMISSIONS.RESULTS_ATHLETE_READ), admin.oneSession);

module.exports = router;
