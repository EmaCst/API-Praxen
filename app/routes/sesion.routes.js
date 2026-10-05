const express = require("express");
const sesionController = require("../controllers/sesion.controller.js");

const router = express.Router();

router.post("/", sesionController.create);
router.get("/", sesionController.findByAthlete);
router.get("/:sessionId", sesionController.findOne);

module.exports = router;
