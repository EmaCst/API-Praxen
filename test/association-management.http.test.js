"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");

process.env.JWT_SECRET = "praxen-association-management-test-secret";
const associations = new Map([
  [1, { id: 1, name: "Asociación inicial", slug: "asociacion-inicial", isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
    update: async function(values) { Object.assign(this, values, { updatedAt: new Date() }); return this; } }],
  [2, { id: 2, name: "Natación Norte", slug: "natacion-norte", isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
    update: async function(values) { Object.assign(this, values, { updatedAt: new Date() }); return this; } }],
  [3, { id: 3, name: "Natación Sur", slug: "natacion-sur", isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
    update: async function(values) { Object.assign(this, values, { updatedAt: new Date() }); return this; } }],
]);
const users = new Map([
  [1, { id: 1, nombre: "Atleta", username: "atleta", role: "athlete", isActive: true }],
  [10, { id: 10, nombre: "Admin Norte", username: "admin-norte", role: "admin", isActive: true, activeAssociationId: null }],
  [11, { id: 11, nombre: "Admin Sur", username: "admin-sur", role: "admin", isActive: true, activeAssociationId: 2 }],
  [12, { id: 12, nombre: "Principal", username: "principal", role: "superadmin", isActive: true, activeAssociationId: null }],
  [20, { id: 20, nombre: "Admin Nuevo", username: "admin-nuevo", role: "admin", isActive: true, activeAssociationId: null }],
]);
for (const user of users.values()) {
  user.tokenVersion = 0;
  user.mustChangePassword = false;
  user.createdAt = new Date();
  user.update = async function(values) { Object.assign(this, values); return this; };
}
const memberships = [
  { userId: 10, associationId: 1, isActive: true, update: async function(v) { Object.assign(this, v); return this; } },
  { userId: 10, associationId: 2, isActive: true, update: async function(v) { Object.assign(this, v); return this; } },
  { userId: 11, associationId: 2, isActive: true, update: async function(v) { Object.assign(this, v); return this; } },
];
const audit = [];
let nextAssociationId = 4;
let nextUserId = 21;
let nextAdminRequestId = 1;
const adminRequests = [];
const tx = { LOCK: { UPDATE: "UPDATE" } };
const modelPath = require.resolve("../app/models");
require.cache[modelPath] = {
  id: modelPath, filename: modelPath, loaded: true,
  exports: {
    sequelize: { transaction: async fn => fn(tx), literal: value => value },
    associations: {
      findAll: async ({ where } = {}) => [...associations.values()].filter(a =>
        (!where?.id || where.id[Op.in].includes(a.id)) &&
        (where?.isActive === undefined || a.isActive === where.isActive)),
      findByPk: async id => associations.get(Number(id)) || null,
      findOne: async ({ where }) => [...associations.values()].find(a =>
        a.id === where.id && (where.isActive === undefined || a.isActive === where.isActive)) || null,
      create: async values => {
        const item = { id: nextAssociationId++, ...values, isActive: true, createdAt: new Date(), updatedAt: new Date(),
          update: async function(v) { Object.assign(this, v); return this; } };
        associations.set(item.id, item);
        return item;
      },
      count: async ({ where }) => [...associations.values()].filter(a => a.isActive === where.isActive).length,
    },
    associationMemberships: {
      findAll: async ({ where = {} } = {}) => memberships.filter(m =>
        (where.userId === undefined || m.userId === where.userId) &&
        (where.associationId === undefined || m.associationId === where.associationId) &&
        (where.isActive === undefined || m.isActive === where.isActive)),
      findOne: async ({ where = {} }) => memberships.find(m =>
        (where.userId === undefined || m.userId === where.userId) &&
        (where.associationId === undefined || m.associationId === where.associationId) &&
        (where.isActive === undefined || m.isActive === where.isActive)) || null,
      create: async values => {
        const item = { ...values, createdAt: new Date(), update: async function(v) { Object.assign(this, v); return this; } };
        memberships.push(item);
        return item;
      },
    },
    usuarios: {
      findByPk: async id => users.get(Number(id)) || null,
      findOne: async ({ where }) => [...users.values()].find(u => u.username === where.username) || null,
      findAndCountAll: async ({ where, limit, offset }) => {
        const roles = where.role[Op.in];
        const rows = [...users.values()].filter(u => roles.includes(u.role));
        return { count: rows.length, rows: rows.slice(offset, offset + limit) };
      },
      count: async ({ where }) => [...users.values()].filter(user =>
        (where.id?.[Op.in] === undefined || where.id[Op.in].includes(user.id)) &&
        (where.role === undefined || where.role === user.role) &&
        (where.isActive === undefined || where.isActive === user.isActive)).length,
      create: async values => {
        const user = { ...values, id: nextUserId++, isActive: true, tokenVersion: 0,
          mustChangePassword: false, createdAt: new Date(),
          update: async function(v) { Object.assign(this, v); return this; } };
        users.set(user.id, user);
        return user;
      },
    },
    associationAdminRequests: {
      create: async values => {
        const request = { id: nextAdminRequestId++, ...values, createdAt: new Date(), decidedAt: null, decidedByUserId: null,
          update: async function(v) { Object.assign(this, v); return this; } };
        adminRequests.push(request);
        return request;
      },
      findAndCountAll: async ({ where, limit, offset }) => {
        const rows = adminRequests.filter(item => item.associationId === where.associationId &&
          (where.status === undefined || item.status === where.status)).sort((a,b)=>b.id-a.id);
        return { count: rows.length, rows: rows.slice(offset, offset + limit) };
      },
      findOne: async ({ where }) => adminRequests.find(item =>
        (where.id === undefined || item.id === where.id) && item.associationId === where.associationId &&
        (where.status === undefined || item.status === where.status)) || null,
    },
    adminAudit: {
      create: async event => { audit.push({ ...event, createdAt: new Date() }); return event; },
      findAndCountAll: async ({ limit, offset }) => ({ count: audit.length, rows: audit.slice().reverse().slice(offset, offset + limit) }),
    },
    atletas: { findOne: async () => ({ id: 1, userId: 1 }) },
  },
};

const { app } = require("../server");
let server;
let base;
test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise(resolve => server.close(resolve)));

function token(id) {
  return jwt.sign({ tv: 0 }, process.env.JWT_SECRET, {
    subject: String(id), issuer: "api-praxen", audience: "praxen-dashboard", expiresIn: "1h",
  });
}
async function call(path, userId, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: "Bearer " + token(userId), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

test("admin puede consultar sus asociaciones y seleccionar contexto sin confiar en IDs libres", async () => {
  const context = await call("/api/admin/contexto-asociacion", 10);
  assert.equal(context.status, 200);
  assert.equal(context.data.requiresSelection, true);
  assert.deepEqual(context.data.associations.map(a => a.id), [1, 2]);

  const invalidSelection = await call("/api/admin/contexto-asociacion", 10, "PUT", { associationId: 3 });
  assert.equal(invalidSelection.status, 403);

  const selected = await call("/api/admin/contexto-asociacion", 10, "PUT", { associationId: 2 });
  assert.equal(selected.status, 200);
  assert.equal(users.get(10).activeAssociationId, 2);
  const outside = await call("/api/admin/asociaciones/3", 10);
  assert.equal(outside.status, 404);

  const updatedContext = await call("/api/admin/contexto-asociacion", 10);
  assert.equal(updatedContext.data.activeAssociationId, 2);
  const visible = await call("/api/admin/asociaciones", 10);
  assert.equal(visible.data.asociaciones.find(a => a.id === 2).isCurrent, true);
});

test("solo superadmin puede crear, editar y cambiar estado de asociaciones", async () => {
  const forbidden = await call("/api/admin/asociaciones", 10, "POST", { name: "Asociación nueva" });
  assert.equal(forbidden.status, 403);

  const created = await call("/api/admin/asociaciones", 12, "POST", { name: "Asociación Centro" });
  assert.equal(created.status, 201);
  const id = created.data.asociacion.id;
  assert.equal(created.data.asociacion.slug, "asociacion-centro");

  const updated = await call(`/api/admin/asociaciones/${id}`, 12, "PATCH", { name: "Asociación Centro Actualizada" });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.asociacion.name, "Asociación Centro Actualizada");

  const deactivated = await call(`/api/admin/asociaciones/${id}/estado`, 12, "PATCH", { isActive: false });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.data.asociacion.isActive, false);

  const invalid = await call(`/api/admin/asociaciones/${id}/estado`, 12, "PATCH", { isActive: "false" });
  assert.equal(invalid.status, 400);
});

test("no se permite desactivar la última asociación activa", async () => {
  associations.get(2).isActive = false;
  associations.get(3).isActive = false;
  const response = await call("/api/admin/asociaciones/1/estado", 12, "PATCH", { isActive: false });
  assert.equal(response.status, 409);
  associations.get(2).isActive = true;
  associations.get(3).isActive = true;
});

test("superadmin puede asignar y revocar membresía de admin sin borrar la cuenta", async () => {
  const assigned = await call("/api/admin/asociaciones/3/administradores", 12, "POST", { userId: 20 });
  assert.equal(assigned.status, 201);
  assert.ok(memberships.some(m => m.userId === 20 && m.associationId === 3 && m.isActive));

  const listed = await call("/api/admin/asociaciones/3/administradores", 12);
  assert.equal(listed.status, 200);
  assert.equal(listed.data.administradores[0].id, 20);

  const revoked = await call("/api/admin/asociaciones/3/administradores/20", 12, "DELETE");
  assert.equal(revoked.status, 200);
  assert.equal(users.has(20), true);
  assert.equal(memberships.find(m => m.userId === 20 && m.associationId === 3).isActive, false);

  const forbidden = await call("/api/admin/asociaciones/3/administradores", 10, "POST", { userId: 20 });
  assert.equal(forbidden.status, 403);
});

test("administradores actuales aprueban solicitudes y la asignación directa queda bloqueada", async () => {
  const direct = await call("/api/admin/asociaciones/2/administradores", 12, "POST", { userId: 20 });
  assert.equal(direct.status, 409);

  const created = await call("/api/admin/asociaciones/2/solicitudes-administrador", 12, "POST", { userId: 20 });
  assert.equal(created.status, 201);
  const requestId = created.data.solicitud.id;
  assert.equal(created.data.solicitud.status, "pending");
  assert.equal(adminRequests.length, 1);

  const duplicate = await call("/api/admin/asociaciones/2/solicitudes-administrador", 12, "POST", { userId: 20 });
  assert.equal(duplicate.status, 409);

  const listed = await call("/api/admin/asociaciones/2/solicitudes-administrador?status=pending", 10);
  assert.equal(listed.status, 200);
  assert.equal(listed.data.solicitudes[0].id, requestId);

  const superadminDecision = await call("/api/admin/asociaciones/2/solicitudes-administrador/"+requestId, 12, "PATCH", { decision: "approved" });
  assert.equal(superadminDecision.status, 403);

  const approved = await call("/api/admin/asociaciones/2/solicitudes-administrador/"+requestId, 10, "PATCH", { decision: "approved" });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.solicitud.status, "approved");
  assert.ok(memberships.some(item => item.userId === 20 && item.associationId === 2 && item.isActive));
  assert.ok(audit.some(item => item.action === "association_admin_request_created"));
  assert.ok(audit.some(item => item.action === "association_admin_request_approved"));
  const secondDecision = await call("/api/admin/asociaciones/2/solicitudes-administrador/"+requestId, 11, "PATCH", { decision: "rejected" });
  assert.equal(secondDecision.status, 409);
});

test("crear un administrador permite asignarlo a una asociación concreta", async () => {
  const response = await call("/api/admin/administradores", 12, "POST", {
    nombre: "Admin Centro", username: "admin-centro", password: "passwordSeguro123", associationId: 2,
  });
  assert.equal(response.status, 201);
  const userId = response.data.administrador.id;
  assert.ok(memberships.some(m => m.userId === userId && m.associationId === 2 && m.isActive));
  assert.equal(users.get(userId).role, "admin");
});

test("no se puede asignar una cuenta atleta o superadmin como administrador de asociación", async () => {
  const athlete = await call("/api/admin/asociaciones/3/administradores", 12, "POST", { userId: 1 });
  assert.equal(athlete.status, 404);
  const superadmin = await call("/api/admin/asociaciones/3/administradores", 12, "POST", { userId: 12 });
  assert.equal(superadmin.status, 404);
});

test("las operaciones de datos requieren contexto si el admin tiene varias asociaciones", async () => {
  const { resolveAssociationIds } = require("../app/security/association-access");
  await assert.rejects(
    resolveAssociationIds({ auth: { role: "admin", associationIds: [1, 2], activeAssociationId: null } }),
    error => error.status === 409
  );
});

test("las operaciones institucionales generan auditoría", () => {
  const actions = audit.map(item => item.action);
  for (const action of [
    "association_created", "association_updated", "association_deactivated",
    "association_admin_assigned_initial", "association_admin_revoked", "association_context_selected",
  ]) assert.ok(actions.includes(action), action);
});
