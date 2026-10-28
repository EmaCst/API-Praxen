"use strict";
const db=require("../models");
const {Op,fn,col,where}=require("sequelize");
const {ROLES}=require("../security/roles");
const fail=(res,e)=>{if(e.status)return res.status(e.status).json({message:e.message});if(e.name==="SequelizeUniqueConstraintError"||e.parent?.code==="23505")return res.status(409).json({message:"El nombre del grupo ya existe."});console.error("Error al administrar grupos:",e);return res.status(500).json({message:"No se pudo completar la operación."});};
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
const id=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw bad("ID inválido.");return n;};
const page=q=>{const limit=q.limit===undefined?25:Number(q.limit),offset=q.offset===undefined?0:Number(q.offset);if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw bad("Paginación inválida.");return {limit,offset};};
const validate=body=>{const nombre=typeof body?.nombre==="string"?body.nombre.trim():"",descripcion=typeof body?.descripcion==="string"?body.descripcion.trim():"";if(nombre.length<2||nombre.length>120||descripcion.length>500)throw bad("Nombre de 2 a 120 caracteres y descripción de hasta 500.");return {nombre,descripcion:descripcion||null};};
const restricted=req=>req.auth.role===ROLES.SUPERADMIN;
exports.list=async(req,res)=>{try{
 const {limit,offset}=page(req.query);const search=typeof req.query.search==="string"?req.query.search.trim():"";if(search.length>120)throw bad("Búsqueda demasiado larga.");
 const whereGroup=search?{nombre:{[Op.iLike]:"%"+search.replace(/[\\%_]/g,"\\$&")+"%"}}:{};
 const {count,rows}=await db.groups.findAndCountAll({where:whereGroup,order:[["nombre","ASC"]],limit,offset});
 const totals=await db.userGroups.findAll({attributes:["groupId",[fn("COUNT",col("user_id")),"total"]],group:["groupId"]});
 const counts=new Map(totals.map(t=>[t.groupId,Number(t.get("total"))]));
 return res.json({total:count,limit,offset,supportsAnalyticsFilter:true,grupos:rows.map(g=>({id:g.id,nombre:g.nombre,descripcion:g.descripcion,createdAt:g.createdAt,totalUsuarios:counts.get(g.id)||0}))});
}catch(e){return fail(res,e);}};
exports.create=async(req,res)=>{try{const data=validate(req.body);const group=await db.groups.create(data);return res.status(201).json({grupo:group});}catch(e){return fail(res,e);}};
exports.update=async(req,res)=>{try{const group=await db.groups.findByPk(id(req.params.groupId));if(!group)throw bad("Grupo no encontrado.",404);await group.update(validate(req.body));return res.json({grupo:group});}catch(e){return fail(res,e);}};
exports.remove=async(req,res)=>{try{const group=await db.groups.findByPk(id(req.params.groupId));if(!group)throw bad("Grupo no encontrado.",404);await group.destroy();return res.json({message:"Grupo eliminado. Los usuarios y sesiones se conservan."});}catch(e){return fail(res,e);}};
exports.members=async(req,res)=>{try{
 const group=await db.groups.findByPk(id(req.params.groupId));if(!group)throw bad("Grupo no encontrado.",404);
 const memberships=await db.userGroups.findAll({where:{groupId:group.id},order:[["assignedAt","ASC"]]});
 const users=await db.usuarios.findAll({where:{id:{[Op.in]:memberships.map(m=>m.userId)},role:ROLES.ATHLETE},attributes:["id","nombre","username"]});
 const byId=new Map(users.map(u=>[u.id,u]));
 return res.json({grupo:{id:group.id,nombre:group.nombre,descripcion:group.descripcion},usuarios:memberships.filter(m=>byId.has(m.userId)).map(m=>({id:m.userId,nombre:byId.get(m.userId).nombre,username:byId.get(m.userId).username,assignedAt:m.assignedAt}))});
}catch(e){return fail(res,e);}};
exports.assign=async(req,res)=>{try{
 const groupId=id(req.params.groupId),userId=id(req.body?.userId);
 const [g,u]=await Promise.all([db.groups.findByPk(groupId),db.usuarios.findByPk(userId)]);
 if(!g)throw bad("Grupo no encontrado.",404);if(!u||u.role!==ROLES.ATHLETE)throw bad("Solo se pueden asignar cuentas de deportistas.",400);
 const [membership,created]=await db.userGroups.findOrCreate({where:{groupId,userId},defaults:{groupId,userId}});
 return res.status(created?201:200).json({asignacion:{groupId,userId,assignedAt:membership.assignedAt},created});
}catch(e){return fail(res,e);}};
exports.unassign=async(req,res)=>{try{
 const groupId=id(req.params.groupId),userId=id(req.params.userId);
 const deleted=await db.userGroups.destroy({where:{groupId,userId}});
 if(!deleted)throw bad("Asignación no encontrada.",404);
 return res.json({message:"Deportista retirado del grupo."});
}catch(e){return fail(res,e);}};
