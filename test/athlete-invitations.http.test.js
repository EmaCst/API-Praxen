"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const user = { id: 7, username: "deportista", isActive: true };
const association = { id: 3, name: "Asociación de prueba", isActive: true };
let invitation;
let membership;
let audit;

function reset() {
  invitation = {
    id: 12, associationId: 3, invitedUsername: "deportista", invitedUserId: 7,
    createdByUserId: 20, status: "pending",
    expiresAt: new Date(Date.now() + 60_000),
    update: async function(values) { Object.assign(this, values); return this; },
  };
  membership = null;
  audit = [];
}
reset();

const modelPath = require.resolve("../app/models");
require.cache[modelPath] = {
  id: modelPath, filename: modelPath, loaded: true,
  exports: {
    sequelize: { transaction: async callback => callback({ LOCK: { UPDATE: "UPDATE" } }) },
    usuarios: { findByPk: async id => Number(id) === user.id ? user : Number(id) === 99 ? { id: 99, username: "otro", isActive: true } : null },
    associationInvitations: {
      findByPk: async id => Number(id) === invitation.id ? invitation : null,
      update: async () => [0],
      findAll: async () => [invitation],
    },
    associations: { findByPk: async id => Number(id) === association.id ? association : null },
    associationMemberships: {
      findOne: async () => membership,
      create: async values => { membership = { ...values }; return membership; },
    },
    adminAudit: { create: async values => { audit.push(values); return values; } },
  },
};
const controller = require("../app/controllers/athlete-invitations.controller");

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test.beforeEach(reset);

test("el deportista recupera las invitaciones por ID de usuario", async () => {
  const res = response();
  await controller.listMine({ auth: { userId: 7, role: "athlete" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.invitaciones.length, 1);
  assert.equal(res.body.invitaciones[0].id, 12);
  assert.equal(res.body.invitaciones[0].association.id, 3);
});

test("aceptar una invitación vinculada por ID crea la membresía y deja auditoría", async () => {
  const res = response();
  await controller.respond({ auth: { userId: 7, role: "athlete" }, params: { invitationId: "12" }, body: { action: "accept" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(membership.userId, 7);
  assert.equal(membership.associationId, 3);
  assert.equal(membership.isActive, true);
  assert.equal(invitation.status, "accepted");
  assert.equal(invitation.acceptedByUserId, 7);
  assert.equal(audit[0].action, "association_invitation_accepted");
});

test("rechazar una invitación no crea membresía", async () => {
  const res = response();
  await controller.respond({ auth: { userId: 7, role: "athlete" }, params: { invitationId: "12" }, body: { action: "decline" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(membership, null);
  assert.equal(invitation.status, "declined");
  assert.equal(audit[0].action, "association_invitation_declined");
});

test("una cuenta distinta no puede responder una invitación ajena", async () => {
  const res = response();
  await controller.respond({ auth: { userId: 99, role: "athlete" }, params: { invitationId: "12" }, body: { action: "accept" } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(membership, null);
  assert.equal(invitation.status, "pending");
});

test("una invitación vencida cambia a expired sin crear membresía", async () => {
  invitation.expiresAt = new Date(Date.now() - 60_000);
  const res = response();
  await controller.respond({ auth: { userId: 7, role: "athlete" }, params: { invitationId: "12" }, body: { action: "accept" } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(invitation.status, "expired");
  assert.equal(membership, null);
});
