const express = require("express");
const sesionController = require("../controllers/sesion.controller.js");
const { PERMISSIONS, requirePermission } = require("../security/roles");

const router = express.Router();

router.post("/", requirePermission(PERMISSIONS.RESULTS_OWN_WRITE), sesionController.create);
router.get("/", requirePermission(PERMISSIONS.RESULTS_OWN_READ), sesionController.findByAthlete);
router.get("/:sessionId", requirePermission(PERMISSIONS.RESULTS_OWN_READ), sesionController.findOne);

module.exports = router;
