const jwt = require("jsonwebtoken");

module.exports = function authenticate(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    return res.status(503).json({ message: "La autenticación no está configurada." });
  }
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  if (!match) return res.status(401).json({ message: "Se requiere un token Bearer." });

  try {
    const claims = jwt.verify(match[1], secret, { issuer: "api-praxen", audience: "praxen-app" });
    const athleteId = Number(claims.athleteId);
    if (!Number.isInteger(athleteId) || athleteId < 1 || !claims.sub) throw new Error("Invalid claims");
    req.auth = { userId: Number(claims.sub), athleteId };
    return next();
  } catch (_) {
    return res.status(401).json({ message: "El token no es válido o ha caducado." });
  }
};
