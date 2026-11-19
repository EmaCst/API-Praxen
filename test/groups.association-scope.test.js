"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const groups = new Map([
  [1, { id: 1, nombre: "Grupo A", associationId: 1, descripcion: null,
    update: async function(values) { Object.assign(this, values); return this; },
    destroy: async function() { this.deleted = true; } }],
  [2, { id: 2, nombre: "Grupo B", associationId: 2, descripcion: null,
    update: async function(values) { Object.assign(this, values); return this; },
    destroy: async function() { this.deleted = true; } }],
]);
const audit = [];
const modelPath = require.resolve("../app/models");
require.cache[modelPath] = {
  id: modelPath, filename: modelPath, loaded: true,
  exports: {
    groups: {
      findByPk: async id => groups.get(Number(id)) || null,
      findAndCountAll: async ({ where, limit, offset }) => {
        const allowed = where.associationId?.[require("sequelize").Op.in];
        const rows = [...groups.values()].filter(g => !allowed || allowed.includes(g.associationId));
        return { count: rows.length, rows: rows.slice(offset, offset + limit) };
      },
      create: async values => ({ id: 3, ...values }),
    },
    userGroups: {
      findAll: async () => [],
      findOrCreate: async ({ defaults }) => [defaults, true],
      destroy: async () => 1,
    },
    atletas: { findOne: async () => ({ id: 1 }) },
    usuarios: { findByPk: async id => ({ id, role: "athlete" }), findAll: async () => [] },
    adminAudit: { create: async event => { audit.push(event); return event; } },
    associations: { findByPk: async id => ({ id, isActive: true }) },
  },
};

const controller = require("../app/controllers/groups.controller");
const req = (extra = {}) => ({
  auth: { userId: 10, role: "admin", associationIds: [1] },
  method: "PATCH", originalUrl: "/api/admin/grupos/2",
  params: {}, query: {}, body: {}, ...extra,
});
function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("el listado de grupos de admin solo incluye sus asociaciones", async () => {
  const res = response();
  await controller.list(req(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 1);
  assert.deepEqual(res.body.grupos.map(group => group.id), [1]);
});

test("un admin no puede leer miembros, editar, borrar ni modificar asignaciones de un grupo ajeno", async () => {
  const members = response();
  await controller.members(req({ params: { groupId: "2" } }), members);
  assert.equal(members.statusCode, 404);

  const edit = response();
  await controller.update(req({ params: { groupId: "2" }, body: { nombre: "Intruso" } }), edit);
  assert.equal(edit.statusCode, 404);
  assert.equal(groups.get(2).nombre, "Grupo B");

  const remove = response();
  await controller.remove(req({ params: { groupId: "2" } }), remove);
  assert.equal(remove.statusCode, 404);
  assert.equal(groups.get(2).deleted, undefined);

  const assign = response();
  await controller.assign(req({ params: { groupId: "2" }, body: { userId: 1 } }), assign);
  assert.equal(assign.statusCode, 404);

  const unassign = response();
  await controller.unassign(req({ params: { groupId: "2", userId: "1" } }), unassign);
  assert.equal(unassign.statusCode, 404);
  assert.ok(audit.length >= 5);
  assert.ok(audit.every(event => event.action === "association_access_denied"));
});

test("un admin sí puede editar grupos de su propia asociación", async () => {
  const res = response();
  await controller.update(req({ params: { groupId: "1" }, body: { nombre: "Grupo A actualizado" } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(groups.get(1).nombre, "Grupo A actualizado");
});
