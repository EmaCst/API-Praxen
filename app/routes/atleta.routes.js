const express = require("express");
const atletaController = require("../controllers/atleta.controller.js");

const router = express.Router();

router.post("/", atletaController.create);
router.get("/", atletaController.findAll);
router.get("/:id/sesiones", atletaController.findSessions);
router.get("/:id", atletaController.findOne);

module.exports = router;
