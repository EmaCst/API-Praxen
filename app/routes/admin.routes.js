"use strict";

const router = require("express").Router();
const { admin } = require("../controllers/resultados.controller");
const { PERMISSIONS, requirePermission } = require("../security/roles");
const manage = require("../controllers/admin-management.controller");
const groups=require("../controllers/groups.controller");
const users=require("../controllers/users-management.controller");
const { rateLimit } = require("express-rate-limit");
const adminMutationLimit = rateLimit({ windowMs:15*60*1000,limit:15,standardHeaders:"draft-7",legacyHeaders:false });

// All /api/admin routes require a valid dashboard token and the current
// database role 'admin', checked before this router runs.
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
