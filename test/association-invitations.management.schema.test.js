"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=relative=>fs.readFileSync(path.join(__dirname,"..",relative),"utf8");
test("consulta y revocación de invitaciones están protegidas por el permiso institucional",()=>{
 const routes=read("app/routes/admin.routes.js"),roles=read("app/security/roles.js");
 assert.match(routes,/router\.get\("\/asociaciones\/:associationId\/invitaciones"/);
 assert.match(routes,/router\.delete\("\/asociaciones\/:associationId\/invitaciones\/:invitationId"/);
 assert.match(routes,/ASSOCIATION_INVITATIONS_MANAGE/);assert.match(roles,/ASSOCIATION_INVITATIONS_MANAGE/);
});
test("listado paginado expone metadatos sin token ni hash",()=>{
 const source=read("app/controllers/association-invitations.controller.js");
 assert.match(source,/exports\.list/);assert.match(source,/findAndCountAll/);assert.match(source,/limit,offset/);
 const view=source.slice(source.indexOf("async function invitationView"),source.indexOf("exports.create"));
 assert.doesNotMatch(view,/tokenHash|token:/);
});
test("revocación registra actor y fecha y rechaza estados no pendientes",()=>{
 const source=read("app/controllers/association-invitations.controller.js"),model=read("app/models/association-invitation.model.js"),migration=read("app/db/migrations/011-association-invitation-revocation.sql");
 assert.match(source,/exports\.revoke/);assert.match(source,/invitation\.status!=="pending"/);
 assert.match(source,/revokedByUserId:req\.auth\.userId/);assert.match(source,/association_invitation_revoked/);
 assert.match(model,/revokedByUserId/);assert.match(model,/revokedAt/);
 assert.match(migration,/revoked_by_user_id/i);assert.match(migration,/revoked_at/i);
 assert.doesNotMatch(migration,/\b(DROP TABLE|DELETE FROM)\b/i);
});
test("las invitaciones vencidas se marcan al consultar el listado",()=>{
 const source=read("app/controllers/association-invitations.controller.js");
 assert.match(source,/status:"expired"/);assert.match(source,/expiresAt:\{\[Op\.lte\]:now\}/);
});

test("el listado de usuarios incluye estado de membresía por asociación", () => {
  const controller = read("app/controllers/users-management.controller.js");
  assert.match(controller, /associationMemberships\.findAll/);
  assert.match(controller, /associationName/);
  assert.match(controller, /membershipsByUser/);
});
