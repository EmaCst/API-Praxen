const express = require("express");
const controller = require("../controllers/auth.controller.js");
const authenticate = require("../middleware/auth.middleware.js");
const { rateLimit } = require("express-rate-limit");
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30,
  standardHeaders: "draft-7", legacyHeaders: false,
});

const router = express.Router();
router.post("/register", authLimit, controller.register);
router.post("/login", authLimit, controller.login);
router.post("/google", authLimit, controller.googleLogin);
router.post("/forgot-password", authLimit, controller.forgotPassword);
router.post("/reset-password", authLimit, controller.resetPassword);
router.get("/me", authenticate, controller.me);

module.exports = router;
