require("dotenv").config();

const cors = require("cors");
const express = require("express");
const { runMigrations } = require("./app/db/run-migrations");
const { rateLimit } = require("express-rate-limit");
const db = require("./app/models");
const athleteRoutes = require("./app/routes/atleta.routes.js");
const sessionRoutes = require("./app/routes/sesion.routes.js");
const authRoutes = require("./app/routes/auth.routes.js");
const authenticate = require("./app/middleware/auth.middleware.js");
const { PERMISSIONS, requirePermission } = require("./app/security/roles");
const adminRoutes = require("./app/routes/admin.routes.js");

const app = express();
// Configura el número exacto de proxies de tu hosting (0 para ejecución directa).
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0) throw new Error("TRUST_PROXY_HOPS debe ser un entero no negativo.");
app.set("trust proxy", proxyHops);
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Unity nativa, curl y Postman no envían el encabezado Origin.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origen no permitido por CORS."));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({ service: "API Praxen", status: "ok" });
});

app.get("/api/health", async (req, res) => {
  try {
    await db.sequelize.authenticate();
    res.json({ service: "API Praxen", status: "ok", database: "ok" });
  } catch (_) {
    res.status(503).json({ service: "API Praxen", status: "unavailable", database: "unavailable" });
  }
});

app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false }), authRoutes);
app.use("/api/atletas", authenticate, requirePermission(PERMISSIONS.RESULTS_OWN_READ), athleteRoutes);
app.use("/api/sesiones", authenticate, sessionRoutes);
app.use("/api/resultados/me", authenticate, requirePermission(PERMISSIONS.RESULTS_OWN_READ), require("./app/routes/resultados.routes.js"));
app.use("/api/admin", authenticate, requirePermission(PERMISSIONS.RESULTS_ALL_READ), adminRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Ruta no encontrada." });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.type === "entity.too.large") {
    return res.status(413).json({ message: "El JSON supera el límite de 1 MB." });
  }
  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({ message: "El cuerpo de la solicitud no es JSON válido." });
  }
  if (error.message === "Origen no permitido por CORS.") {
    return res.status(403).json({ message: error.message });
  }

  console.error("Error no controlado en la API:", error);
  return res.status(500).json({ message: "Error interno del servidor." });
});

async function startServer() {
  await db.sequelize.authenticate();
  await db.sequelize.sync();
  await runMigrations(db.sequelize);

  const port = Number(process.env.PORT) || 8080;
  return app.listen(port, () => {
    console.log("API Praxen escuchando en el puerto " + port + ".");
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("No se pudo iniciar la API Praxen:", error.message);
    process.exit(1);
  });
}

module.exports = { app, startServer };
