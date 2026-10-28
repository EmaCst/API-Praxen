"use strict";
const db=require('../models');
const {Op}=require('sequelize');
exports.list=async(req,res)=>{try{const limit=Math.min(100,Math.max(1,Number(req.query.limit)||25)),offset=Math.max(0,Number(req.query.offset)||0);const search=String(req.query.search||'').trim();const role=String(req.query.role||'');const q=search.slice(0,120);const where={...(role?{role}:{})};if(q)where[Op.or]=[{nombre:{[Op.iLike]:'%'+q+'%'}},{username:{[Op.iLike]:'%'+q+'%'}}];const result=await db.usuarios.findAndCountAll({where,attributes:['id','nombre','username','role','isActive','createdAt'],limit,offset,order:[['id','DESC']]});return res.json({total:result.count,usuarios:result.rows});}catch(e){console.error(e);return res.status(500).json({message:'No se pudo consultar usuarios.'});}};
