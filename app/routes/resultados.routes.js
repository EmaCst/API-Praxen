"use strict";

const router = require("express").Router();
const { own } = require("../controllers/resultados.controller");

// These routes are mounted behind authenticate + results:own:read.
// Athlete identity ALWAYS comes from the checked bearer token.
router.get("/metricas", own.metadata);
router.get("/ultima", own.latest);
router.get("/resumen", own.summary);
router.get("/evolucion", own.evolution);
router.get("/sesiones", own.sessions);

module.exports = router;
