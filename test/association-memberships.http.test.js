"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");

const users = new Map([
  [1, { id: 1, role: "athlete", isActive: true }],
  [10, { id: 10, role: "admin", isActive: true, activeAssociationId: 1,
    update: async function(values) { Object.assign(this, values); return this; } }],
  [11, { id: 11, role: "admin", isActive: true }],
  [12, { id: 12, role: "admin", isActive: true, activeAssociationId: 3 }],
]);
const associations = new Map([
  [1, { id: 1, name: "Asociación A", isActive: true }],
  [2, { id: 2, name: "Asociación B", isActive: true }],
  [3, { id: 3, name: "Asociación C", isActive: true }],
]);
const athlete = { id: 100, userId: 1, nombre: "Atleta de prueba" };
let memberships = [];
let audit = [];
const makeMembership = (userId, associationId, isActive = true) => ({
  userId, associationId, isActive,
  update: async function(values) { Object.assign(this, values); return this; },
});
function reset() {
  memberships = [
    makeMembership(1, 1), makeMembership(1, 2),
    makeMembership(10, 1), makeMembership(10, 2),
    makeMembership(11, 1), makeMembership(12, 3),
  ];
  audit = [];
}
reset();

const modelPath = require.resolve("../app/models");
require.cache[modelPath] = {
  id: modelPath, filename: modelPath, loaded: true,
  exports: {
    sequelize: {
      transaction: async callback => callback({ LOCK: { UPDATE: "UPDATE" } }),
    },
    associations: { findByPk: async id => associations.get(Number(id)) || null },
    associationMemberships: {
      findOne: async ({ where }) => memberships.find(item =>
        Object.entries(where).every(([key, value]) => item[key] === value)) || null,
      findAll: async ({ where = {} }) => memberships.filter(item =>
        Object.entries(where).every(([key, value]) => item[key] === value)),
    },
    usuarios: {
      findByPk: async id => users.get(Number(id)) || null,
      count: async ({ where }) => memberships.filter(item =>
        where.id[Op.in].includes(item.userId) &&
        users.get(item.userId)?.role === where.role &&
        users.get(item.userId)?.isActive === where.isActive).length,
    },
    atletas: { findByPk: async id => Number(id) === athlete.id ? athlete : null },
    adminAudit: { create: async event => { audit.push(event); return event; } },
  },
};
const controller = require("../app/controllers/association-memberships.controller");

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test.beforeEach(reset);

test("un deportista abandona A y conserva B, su perfil y su cuenta", async () => {
  const res = response();
  await controller.leaveOwn({ params: { associationId: "1" }, auth: { userId: 1, role: "athlete" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(memberships.find(item => item.userId === 1 && item.associationId === 1).isActive, false);
  assert.equal(memberships.find(item => item.userId === 1 && item.associationId === 2).isActive, true);
  assert.equal(users.has(1), true);
  assert.equal(athlete.userId, 1);
  assert.equal(audit[0].action, "association_athlete_left");
});

test("un administrador abandona A cuando otro administrador sigue activo y conserva B", async () => {
  const res = response();
  await controller.leaveOwn({
    params: { associationId: "1" },
    auth: { userId: 10, role: "admin", activeAssociationId: 1 },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(memberships.find(item => item.userId === 10 && item.associationId === 1).isActive, false);
  assert.equal(memberships.find(item => item.userId === 10 && item.associationId === 2).isActive, true);
  assert.equal(users.get(10).activeAssociationId, 2);
  assert.equal(audit[0].action, "association_admin_left");
});

test("se bloquea la salida del último administrador activo", async () => {
  const res = response();
  await controller.leaveOwn({
    params: { associationId: "3" },
    auth: { userId: 12, role: "admin", activeAssociationId: 3 },
  }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(memberships.find(item => item.userId === 12 && item.associationId === 3).isActive, true);
  assert.equal(audit.length, 0);
});

test("un administrador retira solo la membresía del deportista en su asociación", async () => {
  const res = response();
  const req = {
    params: { associationId: "1", athleteId: "100" },
    auth: { userId: 10, role: "admin", associationIds: [1, 2], activeAssociationId: 1 },
  };
  await controller.removeAthlete(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(memberships.find(item => item.userId === 1 && item.associationId === 1).isActive, false);
  assert.equal(memberships.find(item => item.userId === 1 && item.associationId === 2).isActive, true);
  assert.equal(users.has(1), true);
  assert.equal(athlete.userId, 1);
  assert.equal(audit[0].action, "association_athlete_removed");

  const outside = response();
  await controller.removeAthlete({
    ...req, params: { associationId: "2", athleteId: "100" },
  }, outside);
  assert.equal(outside.statusCode, 403);
  assert.equal(memberships.find(item => item.userId === 1 && item.associationId === 2).isActive, true);
});
