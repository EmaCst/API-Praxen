const { timingSafeEqual } = require("crypto");

module.exports = (req, res, next) => {
  const expectedKey = process.env.API_KEY;
  const providedKey = req.get("x-api-key");

  if (!expectedKey) {
    return res.status(503).json({ message: "La API no tiene API_KEY configurada." });
  }
  if (!providedKey) {
    return res.status(401).json({ message: "Falta el encabezado x-api-key." });
  }

  const expectedBuffer = Buffer.from(expectedKey);
  const providedBuffer = Buffer.from(providedKey);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return res.status(401).json({ message: "API key inválida." });
  }

  return next();
};
