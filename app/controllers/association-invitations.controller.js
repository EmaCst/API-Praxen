"use strict";
const crypto=require("crypto");
const {Op}=require("sequelize");
const db=require("../models");
const {ROLES}=require("../security/roles");
const {assertAssociationAccess}=require("../security/association-access");
const {normalizeUsername,validateUsername}=require("../utils/auth.validator");
const fail=(status,message)=>Object.assign(new Error(message),{status});
const parseId=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;};
function sendError(res,error,context){if(error.status)return res.status(error.status).json({message:error.message});console.error(context,error);return res.status(500).json({message:"No se pudo completar la operación de invitaciones."});}
async function invitationView(item){
 const [creator,revoker]=await Promise.all([
  db.usuarios.findByPk(item.createdByUserId,{attributes:["id","nombre","username"]}),
  item.revokedByUserId?db.usuarios.findByPk(item.revokedByUserId,{attributes:["id","nombre","username"]}):null
 ]);
 return {id:item.id,associationId:item.associationId,username:item.invitedUsername,status:item.status,createdAt:item.createdAt,expiresAt:item.expiresAt,acceptedAt:item.acceptedAt,revokedAt:item.revokedAt,createdBy:creator?{id:creator.id,nombre:creator.nombre,username:creator.username}:null,revokedBy:revoker?{id:revoker.id,nombre:revoker.nombre,username:revoker.username}:null};
}
exports.create=async(req,res)=>{
 const associationId=Number(req.params.associationId),invitedUsername=normalizeUsername(req.body?.username);
 if(!Number.isSafeInteger(associationId)||associationId<1||!validateUsername(invitedUsername))return res.status(400).json({message:"Asociación y nombre de usuario válidos son obligatorios."});
 try{
  const result=await db.sequelize.transaction(async transaction=>{
   const association=await db.associations.findByPk(associationId,{transaction,lock:transaction.LOCK.UPDATE});
   if(!association||association.isActive===false)throw fail(404,"Asociación no encontrada o inactiva.");
   if(association.slug==="asociacion-inicial")throw fail(409,"La Asociación Pública es un directorio y no admite membresías ni invitaciones.");
   await assertAssociationAccess(req,associationId);
   const target=await db.usuarios.findOne({where:{username:invitedUsername},transaction});
   if(!target||target.role!==ROLES.ATHLETE||target.isActive===false)throw fail(404,"No existe una cuenta activa de deportista con ese usuario.");
   const existing=await db.associationMemberships.findOne({where:{userId:target.id,associationId,isActive:true},transaction});
   if(existing)throw fail(409,"El usuario ya pertenece a esta asociación.");
   const pending=await db.associationInvitations.findOne({where:{associationId,invitedUsername,status:"pending",expiresAt:{[Op.gt]:new Date()}},transaction});
   if(pending)throw fail(409,"Ya existe una invitación pendiente para este usuario.");
   const token=crypto.randomBytes(32).toString("hex"),tokenHash=crypto.createHash("sha256").update(token).digest("hex");
   const invitation=await db.associationInvitations.create({associationId,invitedUsername,tokenHash,status:"pending",createdByUserId:req.auth.userId,expiresAt:new Date(Date.now()+7*24*60*60*1000)},{transaction});
   return {token,invitation,association};
  });
  return res.status(201).json({invitacion:{id:result.invitation.id,username:result.invitation.invitedUsername,association:result.association.name,expiresAt:result.invitation.expiresAt,status:result.invitation.status},token:result.token});
 }catch(error){return sendError(res,error,"Error al crear invitación de asociación:");}
};
exports.list=async(req,res)=>{
 const associationId=parseId(req.params.associationId);
 if(!associationId)return res.status(400).json({message:"ID de asociación inválido."});
 try{
  const association=await db.associations.findByPk(associationId);
  if(!association||association.isActive===false)throw fail(404,"Asociación no encontrada o inactiva.");
  await assertAssociationAccess(req,associationId);
  const status=req.query.status;
  if(status!==undefined&&!["pending","accepted","revoked","expired"].includes(status))throw fail(400,"El estado solicitado no es válido.");
  const limit=req.query.limit===undefined?25:Number(req.query.limit),offset=req.query.offset===undefined?0:Number(req.query.offset);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw fail(400,"Paginación inválida.");
  const now=new Date();
  await db.associationInvitations.update({status:"expired"},{where:{associationId,status:"pending",expiresAt:{[Op.lte]:now}}});
  const {count,rows}=await db.associationInvitations.findAndCountAll({where:{associationId,...(status?{status}:{})},order:[["createdAt","DESC"],["id","DESC"]],limit,offset,attributes:["id","associationId","invitedUsername","status","createdByUserId","expiresAt","acceptedAt","revokedByUserId","revokedAt","createdAt"]});
  return res.json({total:count,limit,offset,invitaciones:await Promise.all(rows.map(invitationView))});
 }catch(error){return sendError(res,error,"Error al consultar invitaciones de asociación:");}
};
exports.revoke=async(req,res)=>{
 const associationId=parseId(req.params.associationId),invitationId=parseId(req.params.invitationId);
 if(!associationId||!invitationId)return res.status(400).json({message:"Los identificadores de asociación e invitación deben ser enteros positivos."});
 try{
  const result=await db.sequelize.transaction(async transaction=>{
   const association=await db.associations.findByPk(associationId,{transaction,lock:transaction.LOCK.UPDATE});
   if(!association||association.isActive===false)throw fail(404,"Asociación no encontrada o inactiva.");
   await assertAssociationAccess(req,associationId);
   const invitation=await db.associationInvitations.findOne({where:{id:invitationId,associationId},transaction,lock:transaction.LOCK.UPDATE});
   if(!invitation)throw fail(404,"Invitación no encontrada.");
   if(invitation.status!=="pending")return {conflict:invitation.status};
   if(invitation.expiresAt<=new Date()){await invitation.update({status:"expired"},{transaction});return {expired:true};}
   const target=await db.usuarios.findOne({where:{username:invitation.invitedUsername},transaction});
   await invitation.update({status:"revoked",revokedByUserId:req.auth.userId,revokedAt:new Date()},{transaction});
   if(target)await db.adminAudit.create({actorUserId:req.auth.userId,targetUserId:target.id,action:"association_invitation_revoked",details:{associationId,invitationId:invitation.id,invitedUsername:invitation.invitedUsername}},{transaction});
   return {invitation};
  });
  if(result.expired)return res.status(409).json({message:"La invitación ya había vencido."});
  if(result.conflict)return res.status(409).json({message:result.conflict==="accepted"?"No se puede revocar una invitación que ya fue aceptada.":"La invitación ya no está pendiente."});
  return res.json({message:"Invitación revocada.",invitacion:await invitationView(result.invitation)});
 }catch(error){return sendError(res,error,"Error al revocar invitación de asociación:");}
};
