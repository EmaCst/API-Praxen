const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'praxen-username-test-only-secret-32-characters';
const users = new Map(), athletes = new Map(), sessions = new Map();
let failAthlete = false, failUnique = false;
const modelPath = require.resolve('../app/models');
require.cache[modelPath] = { id:modelPath, filename:modelPath, loaded:true, exports: {
  sequelize: {
    authenticate: async () => {},
    query: async () => [[{column_name:'email'},{column_name:'password_hash'}]],
    sync: async () => { throw new Error('sync no debe ejecutarse para el esquema anterior'); },
    transaction: async callback => {
      const previousUsers = new Map(users), previousAthletes = new Map(athletes);
      try { return await callback({}); }
      catch (error) {
        users.clear(); athletes.clear();
        previousUsers.forEach((v,k) => users.set(k,v));
        previousAthletes.forEach((v,k) => athletes.set(k,v));
        throw error;
      }
    },
  },
  usuarios: {
    findOne: async ({where}) => users.get(where.username) || null,
    create: async values => {
      if (failUnique || users.has(values.username)) throw Object.assign(new Error('duplicate'), {name:'SequelizeUniqueConstraintError'});
      const user = {id:users.size+1,...values}; users.set(user.username,user); return user;
    },
  },
  atletas: {
    create: async values => {
      if (failAthlete) throw new Error('profile failure');
      const athlete = {id:athletes.size+1,...values}; athletes.set(athlete.userId,athlete); return athlete;
    },
    findOne: async ({where}) => athletes.get(where.userId) || null,
  },
  sesiones: {
    findOrCreate: async ({where,defaults}) => {
      if (sessions.has(where.sessionId)) return [sessions.get(where.sessionId),false];
      sessions.set(where.sessionId,defaults); return [defaults,true];
    },
    findOne: async ({where}) => {
      const session=sessions.get(where.sessionId);
      return session?.athleteId===where.athleteId ? session : null;
    },
  },
}};
const {app,startServer} = require('../server');
let server, base;
test.before(async () => {
  server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  base='http://127.0.0.1:'+server.address().port;
});
test.after(() => new Promise(resolve => server.close(resolve)));
async function request(route,body) {
  const response=await fetch(base+'/api/auth/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}
const account={nombre:'Ana Pérez',federacion:'Atletismo',username:'  Ana.Perez  ',password:'PraxenPrueba2026!'};

test('registra sin correo, almacena bcrypt 12 y devuelve username sin contraseña ni hash',async () => {
  const r=await request('register',account);
  assert.equal(r.status,201);
  assert.deepEqual(r.body.user,{id:1,nombre:'Ana Pérez',username:'ana.perez'});
  assert.equal(r.body.atleta.federacion,'Atletismo');
  assert.equal('passwordHash' in r.body.user,false); assert.equal('password' in r.body.user,false); assert.equal('email' in r.body.user,false);
  const stored=users.get('ana.perez');
  assert.notEqual(stored.passwordHash,account.password);
  assert.equal(bcrypt.getRounds(stored.passwordHash),12);
  assert.equal(await bcrypt.compare(account.password,stored.passwordHash),true);
  const claims=jwt.verify(r.body.token,process.env.JWT_SECRET,{issuer:'api-praxen',audience:'praxen-app'});
  assert.equal(claims.sub,'1'); assert.equal(claims.athleteId,1);
});
test('login normaliza username y conserva el perfil de atleta',async () => {
  const r=await request('login',{username:' ANA.PEREZ ',password:account.password});
  assert.equal(r.status,200); assert.equal(r.body.user.username,'ana.perez'); assert.equal(r.body.atleta.id,1);
  assert.ok(r.body.token);
});
test('usuario inexistente y contraseña incorrecta tienen el mismo error',async () => {
  const missing=await request('login',{username:'nadie',password:account.password});
  const incorrect=await request('login',{username:'ana.perez',password:'incorrecta'});
  assert.equal(missing.status,401); assert.equal(incorrect.status,401); assert.deepEqual(missing.body,incorrect.body);
});
test('rechaza usernames repetidos incluso cambiando mayúsculas',async () => {
  const r=await request('register',{...account,username:'ANA.PEREZ',nombre:'Otra persona'});
  assert.equal(r.status,409); assert.equal(users.size,1); assert.equal(athletes.size,1);
});
test('gestiona la restricción unique si otra solicitud registra el username primero',async () => {
  failUnique=true;
  try { assert.equal((await request('register',{...account,username:'otro'})).status,409); }
  finally { failUnique=false; }
});
test('registro conserva la transacción: si falla el atleta no deja cuenta huérfana',async () => {
  failAthlete=true;
  try {
    assert.equal((await request('register',{...account,username:'rollback'})).status,500);
    assert.equal(users.has('rollback'),false); assert.equal(athletes.size,1);
  } finally {failAthlete=false;}
});
test('rechaza payload de correo y usernames inválidos sin crear cuentas',async () => {
  assert.equal((await request('login',{email:'ana@example.com',password:account.password})).status,400);
  assert.equal((await request('register',{...account,username:undefined,email:'ana@example.com'})).status,400);
  assert.equal((await request('register',{...account,username:'ana perez'})).status,400);
  assert.equal(users.size,1);
});
test('Google y recuperación por correo ya no son rutas de este flujo',async () => {
  for (const route of ['google','forgot-password','reset-password']) assert.equal((await request(route,{})).status,404);
});

test('token obtenido por username guarda y consulta resultados del mismo atleta',async () => {
  const login=await request('login',{username:'ana.perez',password:account.password});
  const payload={sessionId:'f26cb524-1c92-4d9b-9866-3efcbeab1241',athleteId:999,mode:'individual',
    startedAt:'2026-10-13T06:00:00Z',endedAt:'2026-10-13T06:01:00Z',
    exercises:[{exerciseType:'aimlab',sets:1,setDurationSeconds:60,restDurationSeconds:0,metrics:{hits:15,misses:3}}]};
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+login.body.token};
  const saved=await fetch(base+'/api/sesiones',{method:'POST',headers,body:JSON.stringify(payload)});
  assert.equal(saved.status,201);
  const body=await saved.json(); assert.equal(body.session.athleteId,login.body.atleta.id);
  const read=await fetch(base+'/api/sesiones/'+payload.sessionId,{headers});
  assert.equal(read.status,200); assert.deepEqual((await read.json()).exercises,payload.exercises);
});
test('arranque con esquema de correo se detiene sin ejecutar sync ni borrar cuentas',async () => {
  await assert.rejects(startServer(),/tabla users todavía usa el esquema de correo/);
  assert.equal(users.size,1); assert.equal(athletes.size,1);
});
