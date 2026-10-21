"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");

process.env.JWT_SECRET = "praxen-results-test-secret-at-least-32-characters";
process.env.GOOGLE_CLIENT_IDS = "";

const accounts = new Map([
  [1, { id: 1, nombre: "Ana", email: "ana@example.com", role: "athlete", passwordHash: null }],
  [2, { id: 2, nombre: "Beto", email: "beto@example.com", role: "athlete", passwordHash: null }],
  [3, { id: 3, nombre: "Carla", email: "carla@example.com", role: "athlete", passwordHash: null }],
  [10, { id: 10, nombre: "Directora", email: "admin@example.com", role: "admin", passwordHash: null }],
]);
const athletes = [
  { id: 1, userId: 1, nombre: "Ana", federacion: "Atletismo" },
  { id: 2, userId: 2, nombre: "Beto", federacion: "Atletismo" },
  { id: 3, userId: 3, nombre: "Carla", federacion: "Natación" },
];

function record(id, athleteId, startedAt, type, hits, misses) {
  return {
    sessionId: `f26cb524-1c92-4d9b-9866-${String(id).padStart(12, "0")}`,
    athleteId, startedAt: new Date(startedAt),
    endedAt: new Date(Date.parse(startedAt) + 60000),
    mode: "individual",
    exercises: type === "aimlab" ? [{
      exerciseType: "aimlab", metrics: { hits, misses },
    }] : [],
    footExercises: type === "feet_targets" ? [{
      exerciseType: "feet_targets", metrics: { hits, misses },
    }] : [],
    runningExercises: type === "running_direction_change" ? [{
      exerciseType: "running_direction_change",
      metrics: { targetsReached: hits },
    }] : [],
  };
}
const sessions = [
  record(1, 1, "2026-01-01T12:00:00.000Z", "aimlab", 10, 10),
  record(2, 1, "2026-02-01T12:00:00.000Z", "aimlab", 18, 2),
  record(3, 2, "2026-02-03T12:00:00.000Z", "aimlab", 5, 5),
  record(4, 3, "2026-02-06T12:00:00.000Z", "running_direction_change", 8, 0),
];

function filterSessions(query) {
  const where = query.where || {};
  return sessions.filter(s => {
    if (where.athleteId && s.athleteId !== where.athleteId) return false;
    if (where.sessionId && s.sessionId !== where.sessionId) return false;
    if (where.mode && s.mode !== where.mode) return false;
    if (where.startedAt?.[Op.gte] && s.startedAt < where.startedAt[Op.gte]) return false;
    if (where.startedAt?.[Op.lt] && s.startedAt >= where.startedAt[Op.lt]) return false;
    if (query.include?.[0]?.where?.federacion) {
      const athlete = athletes.find(a => a.id === s.athleteId);
      if (athlete?.federacion !== query.include[0].where.federacion) return false;
    }
    return true;
  }).sort((a, b) => b.startedAt - a.startedAt ||
    b.sessionId.localeCompare(a.sessionId));
}
const modelPath = require.resolve("../app/models");
require.cache[modelPath] = {
  id: modelPath, filename: modelPath, loaded: true,
  exports: {
    sequelize: {
      authenticate: async () => {},
      transaction: async (fn) => fn({}),
    },
    usuarios: {
      findByPk: async id => accounts.get(id) || null,
      findOne: async ({where}) => [...accounts.values()].find(u => u.email === where.email) || null,
      create: async (body) => {
        const user = { ...body, id: 20 };
        accounts.set(user.id, user);
        return user;
      },
    },
    atletas: {
      findOne: async ({where}) => athletes.find(a =>
        (where.id === undefined || a.id === where.id) &&
        (where.userId === undefined || a.userId === where.userId)) || null,
      findAll: async ({where, attributes} = {}) => {
        let selected = athletes;
        if (where?.federacion) selected = selected.filter(a => a.federacion === where.federacion);
        if (attributes?.some(x => Array.isArray(x))) {
          const groups = [...new Set(athletes.map(a => a.federacion))];
          return groups.map(federacion => ({
            federacion,
            get: key => key === "totalAtletas"
              ? String(athletes.filter(a => a.federacion === federacion).length)
              : undefined,
          }));
        }
        return selected;
      },
      findAndCountAll: async ({where, limit, offset}) => {
        const selected = athletes.filter(a =>
          (!where.federacion || a.federacion === where.federacion) &&
          (!where.id || a.id === where.id));
        return { count: selected.length, rows: selected.slice(offset, offset + limit) };
      },
      create: async body => {
        const athlete = { id: 20, ...body };
        athletes.push(athlete);
        return athlete;
      },
    },
    sesiones: {
      findAll: async query => filterSessions(query)
        .slice(query.offset || 0, (query.offset || 0) + (query.limit || 99999)),
      findOne: async query => filterSessions(query)[0] || null,
      findAndCountAll: async query => {
        const all = filterSessions(query);
        return {
          count: all.length,
          rows: all.slice(query.offset || 0, (query.offset || 0) + query.limit),
        };
      },
    },
  },
};

const { app } = require("../server");
let server, base;
test.before(async () => {
  accounts.get(10).passwordHash = await bcrypt.hash("adminSecret123", 4);
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
test.after(() => new Promise(resolve => server.close(resolve)));

function athleteToken(userId = 1) {
  return jwt.sign({ athleteId: userId }, process.env.JWT_SECRET, {
    subject: String(userId), issuer: "api-praxen",
    audience: "praxen-app", expiresIn: "1h",
  });
}
function adminToken(userId = 10) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(userId), issuer: "api-praxen",
    audience: "praxen-dashboard", expiresIn: "1h",
  });
}
async function get(path, token = athleteToken()) {
  const response = await fetch(base + path, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  return { status: response.status, data: await response.json() };
}

test("usuarios sin autenticar y atletas no acceden a resultados administrativos", async () => {
  assert.equal((await get("/api/admin/resultados/resumen", null)).status, 401);
  assert.equal((await get("/api/admin/resultados/resumen")).status, 403);
  assert.equal((await get("/api/admin/atletas")).status, 403);
  assert.equal((await get("/api/admin/federaciones")).status, 403);
  assert.equal((await get("/api/resultados/me/resumen", adminToken())).status, 403);
  assert.equal((await get("/api/sesiones", adminToken())).status, 403);
  // A forged role claim cannot elevate the database's actual role.
  const forged = jwt.sign({ role: "admin", athleteId: 1 }, process.env.JWT_SECRET, {
    subject: "1", issuer: "api-praxen", audience: "praxen-app", expiresIn: "1h",
  });
  assert.equal((await get("/api/admin/resultados/resumen", forged)).status, 403);
});

test("cada atleta obtiene únicamente última sesión, promedio y progreso propios", async () => {
  const result = await get("/api/resultados/me/ultima");
  assert.equal(result.status, 200);
  assert.equal(result.data.latest.athleteId, 1);
  assert.equal(result.data.latest.sessionId, sessions[1].sessionId);
  const stats = await get("/api/resultados/me/resumen");
  assert.equal(stats.status, 200);
  assert.equal(stats.data.summary.totalSessions, 2);
  assert.equal(stats.data.summary.exercises[0].metrics.hits.average, 14);
  const graph = await get("/api/resultados/me/evolucion?exerciseType=aimlab&metric=accuracyPercent");
  assert.equal(graph.status, 200);
  assert.deepEqual(graph.data.evolution.series[0].points.map(p => p.value), [50, 90]);
  assert.equal((await get("/api/resultados/me/ultima", athleteToken(3))).data.latest.athleteId, 3);
  assert.equal((await get("/api/resultados/me/resumen?athleteId=2")).data.summary.totalSessions, 2);
});

test("administrador consulta global, federación y atleta particular con mismo formato", async () => {
  const global = await get("/api/admin/resultados/resumen", adminToken());
  assert.equal(global.status, 200);
  assert.equal(global.data.scope.type, "global");
  assert.equal(global.data.summary.totalSessions, 4);
  assert.equal(global.data.summary.athleteCount, 3);
  const federation = await get(
    "/api/admin/resultados/resumen?federacion=Atletismo", adminToken());
  assert.equal(federation.status, 200);
  assert.equal(federation.data.scope.type, "federation");
  assert.equal(federation.data.summary.athleteCount, 2);
  assert.equal(federation.data.summary.totalSessions, 3);
  const athlete = await get(
    "/api/admin/resultados/resumen?athleteId=1", adminToken());
  assert.equal(athlete.status, 200);
  assert.equal(athlete.data.scope.type, "athlete");
  assert.equal(athlete.data.summary.totalSessions, 2);
  assert.equal(athlete.data.summary.exercises[0].metrics.hits.average, 14);
  const latest = await get("/api/admin/resultados/ultima?athleteId=2", adminToken());
  assert.equal(latest.status, 200);
  assert.equal(latest.data.latest.athleteId, 2);
  const graph = await get(
    "/api/admin/resultados/evolucion?federacion=Atletismo&exerciseType=aimlab&metric=hits&period=month",
    adminToken());
  assert.equal(graph.status, 200);
  assert.equal(graph.data.evolution.aggregationBasis, "equal_weight_per_athlete_per_period");
  assert.equal(graph.data.evolution.series[0].points[1].athletes, 2);
});

test("listas y filtros requieren admin y son coherentes por federación", async () => {
  const list = await get("/api/admin/resultados/sesiones?federacion=Nataci%C3%B3n", adminToken());
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 1);
  const athlete = await get("/api/admin/atletas?federacion=Atletismo", adminToken());
  assert.equal(athlete.status, 200);
  assert.equal(athlete.data.total, 2);
  const federations = await get("/api/admin/federaciones", adminToken());
  assert.equal(federations.status, 200);
  assert.equal(federations.data.federaciones.length, 2);
  const comparison = await get("/api/admin/resultados/federaciones/resumen", adminToken());
  assert.equal(comparison.status, 200);
  assert.equal(comparison.data.federaciones.length, 2);
  assert.equal(comparison.data.federaciones[0].summary.aggregationBasis, "equal_weight_per_athlete");
  const one = await get("/api/admin/resultados/sesiones/" + sessions[0].sessionId, adminToken());
  assert.equal(one.status, 200);
  assert.equal(one.data.session.athleteId, 1);
});

test("filtros inválidos y consultas fuera de federación no revelan información", async () => {
  for (const query of [
    "?from=2026-02-31", "?from=2026-05-01&to=2026-04-30",
    "?exerciseType=unknown", "?metric=unknown", "?limit=100000",
  ]) {
    assert.equal((await get("/api/resultados/me/resumen" + query)).status, 400);
  }
  assert.equal((await get(
    "/api/admin/resultados/resumen?athleteId=3&federacion=Atletismo",
    adminToken())).status, 404);
  assert.equal((await get(
    "/api/admin/resultados/sesiones/not-a-uuid",
    adminToken())).status, 400);
});

test("token administrativo deja de servir al revocar su rol en PostgreSQL", async () => {
  const user = accounts.get(10), before = user.role;
  user.role = "athlete";
  try {
    assert.equal((await get("/api/admin/resultados/resumen", adminToken())).status, 401);
  } finally { user.role = before; }
});

test("login distingue público app frente a panel administrativo", async () => {
  const response = await fetch(base + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({email: "admin@example.com", password: "adminSecret123"}),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.user.role, "admin");
  assert.equal(data.atleta, null);
  assert.ok(data.user.permissions.includes("results:all:read"));
  const me = await get("/api/auth/me", data.token);
  assert.equal(me.status, 200);
  assert.equal(me.data.user.role, "admin");
  assert.equal((await get("/api/resultados/me/ultima", data.token)).status, 403);
});

test("registro público nunca permite que el cliente se asigne permisos admin", async () => {
  const response = await fetch(base + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre:"Nuevo atleta", email:"new@example.com",
      federacion:"Atletismo", password:"safe-password123",
      role:"admin", permissions:["results:all:read"],
    }),
  });
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.user.role, "athlete");
  assert.deepEqual(data.user.permissions, ["results:own:read", "results:own:write"]);
  assert.equal(accounts.get(20).role, "athlete");
});
