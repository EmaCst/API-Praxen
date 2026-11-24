const express = require("express");
const atletaController = require("../controllers/atleta.controller.js");
const memberships = require("../controllers/association-memberships.controller.js");

const router = express.Router();

router.get("/me", atletaController.me);
router.patch("/me", atletaController.updateFederation);
router.get("/me/sesiones", atletaController.mySessions);
router.delete("/me/asociaciones/:associationId", memberships.leaveOwn);

module.exports = router;
