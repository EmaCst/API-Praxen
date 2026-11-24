const express = require("express");
const atletaController = require("../controllers/atleta.controller.js");
const invitations = require("../controllers/athlete-invitations.controller");
const memberships = require("../controllers/association-memberships.controller");

const router = express.Router();

router.get("/me", atletaController.me);
router.patch("/me", atletaController.updateFederation);
router.get("/me/sesiones", atletaController.mySessions);
router.get("/me/invitaciones", invitations.listMine);
router.patch("/me/invitaciones/:invitationId", invitations.respond);
router.delete("/me/asociaciones/:associationId", memberships.leaveOwn);

module.exports = router;
