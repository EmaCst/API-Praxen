const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'praxen-test-only-secret-at-least-32-characters';
const sessions = new Map();
let databaseDown = false;
const modelPath = require.resolve('../app/models');
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: {
  sequelize: { authenticate: async () => { if (databaseDown) throw new Error('offline'); } },
  atletas: { findOne: async ({where}) => where.id === where.userId ? { id: where.id } : null },
  sesiones: {
    findOrCreate: async ({where, defaults}) => {
      if (databaseDown) throw new Error('offline');
      if (sessions.has(where.sessionId)) return [sessions.get(where.sessionId), false];
      sessions.set(where.sessionId, defaults); return [defaults, true];
    },
    findOne: async ({where}) => {
      if (databaseDown) throw new Error('offline');
      const result = sessions.get(where.sessionId);
      return result?.athleteId === where.athleteId ? result : null;
    },
    findAndCountAll: async ({where, limit, offset}) => {
      const rows = [...sessions.values()].filter(x => x.athleteId === where.athleteId).sort((a,b) => b.startedAt-a.startedAt);
      return {count: rows.length, rows: rows.slice(offset, offset+limit)};
    },
  }, usuarios: {},
}};
const {app} = require('../server');
let server, base;
test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => new Promise(resolve => server.close(resolve)));
const token = (id=1) => jwt.sign({athleteId:id}, process.env.JWT_SECRET, {subject:String(id), issuer:'api-praxen', audience:'praxen-app', expiresIn:'1h'});
const payload = {
  sessionId:'f26cb524-1c92-4d9b-9866-3efcbeab1241', athleteId:999, mode:'circuit',
  startedAt:'2026-10-05T03:00:00.000Z', endedAt:'2026-10-05T03:05:00.000Z',
  exercises:[{exerciseType:'aimlab',sets:4,setDurationSeconds:60,restDurationSeconds:30,metrics:{hits:3,misses:1}}],
  footExercises:[{exerciseType:'feet_targets',metrics:{hits:2,misses:0,attempts:[]}}],
  runningExercises:[{exerciseType:'running_direction_change',metrics:{targetsReached:1,totalTravelledMeters:3}}],
};
async function request(path, body, auth=token()) {
  const response = await fetch(base+path, {method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}
test('rechaza resultados sin token y con token caducado', async () => {
  assert.equal((await request('/api/sesiones',payload,null)).status,401);
  const expired = jwt.sign({athleteId:1},process.env.JWT_SECRET,{subject:'1',issuer:'api-praxen',audience:'praxen-app',expiresIn:-1});
  assert.equal((await request('/api/sesiones',payload,expired)).status,401);
});
test('guarda los tres ejercicios, usa la identidad del token y permite reintentar', async () => {
  sessions.clear();
  const result=await request('/api/sesiones',payload);
  assert.equal(result.status,201); assert.equal(result.body.session.athleteId,1);
  assert.deepEqual(result.body.session.exercises,payload.exercises);
  assert.deepEqual(result.body.session.footExercises,payload.footExercises);
  assert.deepEqual(result.body.session.runningExercises,payload.runningExercises);
  const retry=await request('/api/sesiones',payload);
  assert.equal(retry.status,200); assert.equal(retry.body.created,false); assert.equal(sessions.size,1);
  assert.equal((await request('/api/sesiones',{...payload,mode:'individual'})).status,409);
  assert.equal((await request('/api/sesiones',payload,token(2))).status,409);
});
test('consulta y paginación aíslan los resultados de otras cuentas', async () => {
  assert.equal((await request('/api/sesiones/'+payload.sessionId)).status,200);
  assert.equal((await request('/api/sesiones/'+payload.sessionId,undefined,token(2))).status,404);
  const own=await request('/api/sesiones?limit=1&offset=0');
  assert.equal(own.body.total,1); assert.equal(own.body.sesiones.length,1);
  assert.equal((await request('/api/sesiones',undefined,token(2))).body.total,0);
  assert.equal((await request('/api/sesiones?limit=0')).status,400);
  assert.equal((await request('/api/sesiones/not-a-uuid')).status,400);
});
test('rechaza datos malformados y duraciones inválidas', async () => {
  assert.equal((await request('/api/sesiones',{...payload,exercises:[{...payload.exercises[0],sets:0}]})).status,400);
  const response=await fetch(base+'/api/sesiones',{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'});
  assert.equal(response.status,400);
});
test('health refleja PostgreSQL caído; errores de consulta son 500', async () => {
  assert.equal((await request('/api/health')).status,200);
  databaseDown=true;
  try {
    assert.equal((await request('/api/health')).status,503);
    assert.equal((await request('/api/sesiones/'+payload.sessionId)).status,500);
  } finally {databaseDown=false;}
});
