"use strict";

const router = require("express").Router();
const { admin } = require("../controllers/resultados.controller");
const { PERMISSIONS, requirePermission } = require("../security/roles");
const manage = require("../controllers/admin-management.controller");
const { rateLimit } = require("express-rate-limit");
const adminMutationLimit = rateLimit({ windowMs:15*60*1000,limit:15,standardHeaders:"draft-7",legacyHeaders:false });

// All /api/admin routes require a valid dashboard token and the current
// database role 'admin', checked before this router runs.
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
