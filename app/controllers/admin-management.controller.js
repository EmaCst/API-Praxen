"use strict";

const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const db = require("../models");
const { ROLES } = require("../security/roles");
const { normalizeUsername, validateUsername, validateNewPassword } = require("../utils/auth.validator");

const publicFields = ["id", "nombre", "username", "role", "isActive", "createdAt"];
const safeAccount = a => ({ id:a.id, nombre:a.nombre, username:a.username, role:a.role,
  isActive:a.isActive !== false, createdAt:a.createdAt });
const sendError = (res,e) => {
  if(e.status) return res.status(e.status).json({ message:e.message });
  if(e.name === "SequelizeUniqueConstraintError" || e.parent?.code === "23505")
    return res.status(409).json({ message:"El nombre de usuario ya está ocupado." });
  console.error("Error en gestión de administradores:",e);
  return res.status(500).json({ message:"No se pudo completar la operación." });
};
function pagination(req) {
  const limit=req.query.limit===undefined?25:Number(req.query.limit);
  const offset=req.query.offset===undefined?0:Number(req.query.offset);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>1000000)
    throw Object.assign(new Error("Paginación inválida."),{status:400});
  return {limit,offset};
}

exports.list = async (req,res) => {
  try {
    const {limit,offset}=pagination(req);
    const {count,rows}=await db.usuarios.findAndCountAll({
      where:{role:{[Op.in]:[ROLES.ADMIN,ROLES.SUPERADMIN]}}, attributes:publicFields,
      order:[["createdAt","DESC"],["id","DESC"]],limit,offset,
    });
    return res.json({total:count,limit,offset,administradores:rows.map(safeAccount)});
  }catch(e){return sendError(res,e);}
};

exports.create = async (req,res) => {
  const body=req.body;
  if(!body||typeof body!=="object"||Array.isArray(body))
    return res.status(400).json({message:"Datos de administrador inválidos."});
  const nombre=typeof body.nombre==="string"?body.nombre.trim():"";
  const username=normalizeUsername(body.username);
  if(nombre.length<2||nombre.length>120||!validateUsername(username)||!validateNewPassword(body.password))
    return res.status(400).json({message:"Se requiere nombre (2-120), usuario (3-32 caracteres) y contraseña de 8-72 bytes."});
  // No se acepta `role`, `isActive`, `permissions` ni IDs del cliente.
  try {
    const passwordHash=await bcrypt.hash(body.password,12);
    const user=await db.sequelize.transaction(async transaction => {
      if(await db.usuarios.findOne({where:{username},transaction}))
        throw Object.assign(new Error("El nombre de usuario ya está ocupado."),{status:409});
      const created=await db.usuarios.create({nombre,username,passwordHash,role:ROLES.ADMIN,isActive:true},{transaction});
      await db.adminAudit.create({actorUserId:req.auth.userId,targetUserId:created.id,
        action:"admin_created",details:{role:ROLES.ADMIN}}, {transaction});
      return created;
    });
    return res.status(201).json({administrador:safeAccount(user)});
  }catch(e){return sendError(res,e);}
};

exports.setActive = async (req,res) => {
  const id=Number(req.params.userId);
  if(!Number.isSafeInteger(id)||id<1||typeof req.body?.isActive!=="boolean")
    return res.status(400).json({message:"ID e isActive (booleano) son obligatorios."});
  if(id===req.auth.userId) return res.status(403).json({message:"No puedes cambiar tu propia cuenta."});
  try {
    const account=await db.sequelize.transaction(async transaction => {
      const user=await db.usuarios.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
      if(!user||![ROLES.ADMIN,ROLES.SUPERADMIN].includes(user.role))
        throw Object.assign(new Error("Administrador no encontrado."),{status:404});
      // Las cuentas superadmin solo se recuperan/rotan desde el proceso de bootstrap.
      if(user.role===ROLES.SUPERADMIN)
        throw Object.assign(new Error("No se puede desactivar o modificar un superadministrador desde el panel."),{status:403});
      if(user.isActive===req.body.isActive)return user;
      const previous=user.isActive!==false;
      await user.update({isActive:req.body.isActive},{transaction});
      await db.adminAudit.create({actorUserId:req.auth.userId,targetUserId:id,
        action:req.body.isActive?"admin_reactivated":"admin_deactivated",
        details:{before:previous,after:req.body.isActive}}, {transaction});
      return user;
    });
    return res.json({administrador:safeAccount(account)});
  }catch(e){return sendError(res,e);}
};

exports.audit = async (req,res) => {
  try {
    const {limit,offset}=pagination(req);
    const {count,rows}=await db.adminAudit.findAndCountAll({
      order:[["createdAt","DESC"],["id","DESC"]],limit,offset,
      attributes:["id","actorUserId","targetUserId","action","details","createdAt"],
    });
    return res.json({total:count,limit,offset,eventos:rows});
  }catch(e){return sendError(res,e);}
};
