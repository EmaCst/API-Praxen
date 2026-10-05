const poolMax = Number(process.env.DB_POOL_MAX) || 5;

module.exports = {
  URL: process.env.DATABASE_URL,
  dialect: "postgres",
  logging: process.env.DB_LOGGING === "true",
  ssl: process.env.DB_SSL !== "false",
  pool: {
    max: poolMax,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
};
