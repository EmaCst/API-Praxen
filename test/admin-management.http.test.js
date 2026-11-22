"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const jwt=require("jsonwebtoken");
const bcrypt=require("bcryptjs");
const {Op}=require("sequelize");

process.env.JWT_SECRET="praxen-admin-management-test-secret-32chars";
const users=new Map([
  [1,{id:1,nombre:"Atleta",username:"atleta",role:"athlete",isActive:true}],
  [10,{id:10,nombre:"Admin",username:"admin",role:"admin",isActive:true}],
  [11,{id:11,nombre:"Principal",username:"principal",role:"superadmin",isActive:true}],
]);
for (const user of users.values()) {user.tokenVersion=0; user.mustChangePassword=false;}
const audit=[];
const associationMemberships=[];
let nextId=20;
for(const user of users.values())user.update=async function(values){Object.assign(this,values);return this;};
const modelPath=require.resolve("../app/models");
require.cache[modelPath]={id:modelPath,filename:modelPath,loaded:true,exports:{
  sequelize:{transaction:async(fn)=>fn({LOCK:{UPDATE:"UPDATE"}})},
  associations:{findOne:async()=>({id:1,name:"Asociación inicial",slug:"asociacion-inicial",isActive:true}),findByPk:async()=>({id:1,name:"Asociación inicial",slug:"asociacion-inicial",isActive:true}),findAll:async({where})=>[{id:1,isActive:true}].filter(a=>where.id[Op.in].includes(a.id)&&where.isActive===true)},
  associationMemberships:{findAll:async({where})=>associationMemberships.filter(m=>(where.userId===undefined||m.userId===where.userId)&&(where.associationId===undefined||m.associationId===where.associationId)&&(where.isActive===undefined||m.isActive===where.isActive)),create:async data=>{associationMemberships.push(data);return data;}},
  associationAdminRequests:{create:async data=>({id:90,...data,createdAt:new Date()})},
  usuarios:{
    findByPk:async id=>users.get(Number(id))||null,
    findOne:async({where})=>[...users.values()].find(u=>u.username===where.username)||null,
    count:async({where})=>[...users.values()].filter(u=>(where.id?.[Op.in]===undefined||where.id[Op.in].includes(u.id))&&(where.role===undefined||u.role===where.role)&&(where.isActive===undefined||u.isActive===where.isActive)).length,
    findAndCountAll:async({where,limit,offset})=>{
      const roles=where.role[Op.in];const rows=[...users.values()].filter(u=>roles.includes(u.role));
      return {count:rows.length,rows:rows.slice(offset,offset+limit)};
    },
    create:async data=>{const user={tokenVersion:0,mustChangePassword:false,...data,id:nextId++,createdAt:new Date(),update:async function(v){Object.assign(this,v);return this;}};users.set(user.id,user);return user;},
  },
  atletas:{findOne:async()=>({id:1,userId:1})},
  sesiones:{},
  adminAudit:{
    create:async data=>{audit.push({...data,id:audit.length+1,createdAt:new Date()});},
    findAndCountAll:async({limit,offset})=>({count:audit.length,rows:audit.slice().reverse().slice(offset,offset+limit)}),
  },
}};
const {app}=require("../server");
let server,base;
test.before(async()=>{server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${server.address().port}`;});
test.after(()=>new Promise(resolve=>server.close(resolve)));
function token(id,audience="praxen-dashboard"){
  return jwt.sign(audience==="praxen-app"?{athleteId:1,tv:0}:{tv:0},process.env.JWT_SECRET,
    {subject:String(id),issuer:"api-praxen",audience,expiresIn:"1h"});
}
async function call(path,id,method="GET",body){const r=await fetch(base+path,{method,headers:{Authorization:"Bearer "+token(id),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}

test("solo superadmin puede listar, crear y auditar administradores",async()=>{
  assert.equal((await call("/api/admin/administradores",10)).status,403);
  assert.equal((await call("/api/admin/administradores/auditoria",10)).status,403);
  assert.equal((await call("/api/admin/administradores",1)).status,401);
  assert.equal((await call("/api/admin/administradores",11)).status,200);
  const attempt=await call("/api/admin/administradores",10,"POST",{nombre:"Intruso",username:"intruso",password:"password123"});
  assert.equal(attempt.status,403);
});
test("creación forzada a admin con auditoría y sin fuga de contraseña",async()=>{
  const response=await call("/api/admin/administradores",11,"POST",{
    nombre:"Nueva Admin",username:"NUEVA",password:"mySafePassword123",role:"superadmin",isActive:false,permissions:["admins:manage"],
  });
  assert.equal(response.status,201);
  assert.equal(response.data.administrador.role,"admin");
  assert.equal(response.data.administrador.isActive,true);
  assert.equal(response.data.administrador.username,"nueva");
  assert.equal(users.get(response.data.administrador.id).role,"admin");
  assert.equal(await bcrypt.compare("mySafePassword123",users.get(response.data.administrador.id).passwordHash),true);
  assert.equal(JSON.stringify(audit).includes("mySafePassword123"),false);
  assert.equal(audit.at(-1).actorUserId,11);
  assert.deepEqual(associationMemberships.at(-1),{
    userId: response.data.administrador.id,
    associationId: 1,
    isActive: true,
    createdByUserId: 11,
  });
  const duplicate=await call("/api/admin/administradores",11,"POST",{nombre:"Duplicado",username:"nueva",password:"password123"});
  assert.equal(duplicate.status,409);
  const pending=await call("/api/admin/administradores",11,"POST",{nombre:"Otra Admin",username:"otra-admin",password:"password123"});
  assert.equal(pending.status,201);
  assert.equal(pending.data.membershipStatus,"pending");
  assert.equal(pending.data.solicitud.status,"pending");
  assert.equal(associationMemberships.some(m=>m.userId===pending.data.administrador.id&&m.isActive),false);
  assert.ok(audit.some(item=>item.action==="association_admin_request_created"&&item.targetUserId===pending.data.administrador.id));
});
test("desactivar un admin revoca su JWT; superadmin no se puede desactivar",async()=>{
  const target=[...users.values()].find(u=>u.username==="nueva");
  assert.equal((await call(`/api/admin/administradores/${target.id}/estado`,10,"PATCH",{isActive:false})).status,403);
  assert.equal((await call("/api/admin/administradores/11/estado",11,"PATCH",{isActive:false})).status,403);
  assert.equal((await call(`/api/admin/administradores/${target.id}/estado`,11,"PATCH",{isActive:false})).status,200);
  assert.equal((await call("/api/admin/resultados/metricas",target.id)).status,401);
  assert.equal((await call(`/api/admin/administradores/${target.id}/estado`,11,"PATCH",{isActive:true})).status,200);
  assert.equal((await call("/api/admin/resultados/metricas",target.id)).status,200);
  assert.ok(audit.some(item=>item.action==="admin_reactivated"));
  assert.equal(audit.at(-1).action,"association_admin_account_reactivated");
});
