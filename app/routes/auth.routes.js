const express = require("express");
const controller = require("../controllers/auth.controller.js");

const router = express.Router();
router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/google", controller.googleLogin);
router.post("/forgot-password", controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);

module.exports = router;
