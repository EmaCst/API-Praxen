const express = require("express");
const atletaController = require("../controllers/atleta.controller.js");

const router = express.Router();

router.get("/me", atletaController.me);
router.get("/me/sesiones", atletaController.mySessions);

module.exports = router;
