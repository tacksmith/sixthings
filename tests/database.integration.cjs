const {test,before} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const db = require('./support/database.cjs');
const {project,Engine} = require('../www/sync-engine.js');
const host=randomUUID(),guest=randomUUID(),third=randomUUID(),outsider=randomUUID();
before(async()=>{await db.setup();for(const id of [host,guest,third,outsider])await db.user(id);});
async function room() {const id=randomUUID();return db.rpc(host,'six_create_room',{p_room:id,p_data:project()});}
async function join(uid,id){const invite=await db.rpc(host,'six_create_invite',{p_room:id});return db.rpc(uid,'six_join_room',{p_code:invite.code});}
test('migration reruns without destroying data',async()=>{
  const r=await room();await db.setup();assert.equal((await db.rpc(host,'six_get_room',{p_room:r.room})).room,r.room);
});
test('creator owns a working room before another device joins; three members can join',async()=>{
  const r=await room();assert.equal(r.members,1);
  assert.equal((await join(guest,r.room)).members,2);assert.equal((await join(third,r.room)).members,3);
});
test('an invitation is single-use, with idempotent retry only for its recipient',async()=>{
  const r=await room();const invite=await db.rpc(host,'six_create_invite',{p_room:r.room});
  const args={p_code:invite.code};await db.rpc(guest,'six_join_room',args);
  assert.equal((await db.rpc(guest,'six_join_room',args)).room,r.room);
  await assert.rejects(db.rpc(third,'six_join_room',args),/invalid or expired/);
});
test('expired invitations are rejected by the database',async()=>{
  const r=await room();const invite=await db.rpc(host,'six_create_invite',{p_room:r.room});
  await db.sql(`UPDATE public.six_invites SET expires_at=now()-interval '1 second' WHERE code=${db.literal(invite.code)}`);
  await assert.rejects(db.rpc(guest,'six_join_room',{p_code:invite.code}),/invalid or expired/);
});
test('two simultaneous joins cannot consume the same invitation',async()=>{
  const r=await room();const invite=await db.rpc(host,'six_create_invite',{p_room:r.room});
  const result=await Promise.allSettled([guest,third].map(id=>db.rpc(id,'six_join_room',{p_code:invite.code})));
  assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
});
test('foreign users cannot read a room or overwrite its state',async()=>{
  const r=await room();await assert.rejects(db.rpc(outsider,'six_get_room',{p_room:r.room}),/not a room member/);
  await assert.rejects(db.rpc(outsider,'six_write_room',{p_room:r.room,p_revision:0,p_data:{},p_write_id:randomUUID()}),/not a room member/);
});
test('RLS hides foreign rows and direct writes/invitation enumeration are forbidden',async()=>{
  const r=await room();
  const rows=await db.sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=${db.literal(outsider)}; SELECT count(*) FROM public.six_rooms WHERE id=${db.literal(r.room)}; COMMIT;`);
  assert.ok(rows.split('\n').includes('0'));
  await assert.rejects(db.sql(`SET ROLE authenticated; SELECT * FROM public.six_invites`),/permission denied/);
  await assert.rejects(db.sql(`SET ROLE authenticated; UPDATE public.six_rooms SET data='{}'`),/permission denied/);
  await assert.rejects(db.sql(`SET ROLE anon; SELECT public.six_get_room(${db.literal(r.room)})`),/permission denied/);
});
test('concurrent compare-and-swap writes allow only one matching revision',async()=>{
  const r=await room();await join(guest,r.room);
  const attempts=await Promise.all([host,guest].map((uid,i)=>db.rpc(uid,'six_write_room',{
    p_room:r.room,p_revision:0,p_data:project({inbox:[{id:String(i),text:'fixture'}]}),p_write_id:randomUUID()})));
  assert.equal(attempts.filter(x=>x.applied).length,1);
  assert.equal((await db.rpc(host,'six_get_room',{p_room:r.room})).revision,1);
});
test('a null expected revision cannot bypass conflict detection',async()=>{
  const r=await room();await assert.rejects(db.rpc(host,'six_write_room',{
    p_room:r.room,p_revision:null,p_data:{},p_write_id:randomUUID()}),/invalid document/);
});
test('retrying an acknowledged write does not overwrite a newer write',async()=>{
  const r=await room();const id=randomUUID();
  const first={p_room:r.room,p_revision:0,p_data:project({inbox:[{id:'a',text:'a'}]}),p_write_id:id};
  await db.rpc(host,'six_write_room',first);
  await db.rpc(host,'six_write_room',{...first,p_revision:1,p_data:project(),p_write_id:randomUUID()});
  const retry=await db.rpc(host,'six_write_room',first);assert.equal(retry.revision,2);assert.deepEqual(retry.data.inbox,[]);
});
test('real PostgreSQL plus three client engines converge under contention',async()=>{
  const r=await room();await join(guest,r.room);await join(third,r.room);
  const engines=[host,guest,third].map(uid=>{
    const storage=new Map();return new Engine({room:r.room,initial:project(),uuid:randomUUID,apply:()=>{},
      storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
      transport:{read:room=>db.rpc(uid,'six_get_room',{p_room:room}),
        write:(room,revision,data,id)=>db.rpc(uid,'six_write_room',{p_room:room,p_revision:revision,p_data:data,p_write_id:id})}});
  });
  await Promise.all(engines.map(x=>x.flush()));
  engines.forEach((e,i)=>e.capture(project({inbox:[{id:String(i),text:'fixture '+i}]})));
  await Promise.all(engines.map(x=>x.flush()));await Promise.all(engines.map(x=>x.flush()));
  for(const engine of engines)assert.deepEqual(engine.view.inbox.map(x=>x.id).sort(),['0','1','2']);
});
test('legacy room migrates once for both members and rejects stale legacy writes',async()=>{
  await db.sql(`CREATE TABLE IF NOT EXISTS public.sync_data(room text PRIMARY KEY,data text,host_uid uuid,guest_uid uuid)`);
  await db.setup();const legacy='room-'+randomUUID();
  await db.sql(`INSERT INTO public.sync_data VALUES (${db.literal(legacy)},'{}',${db.literal(host)},${db.literal(guest)})`);
  const a=await db.rpc(host,'six_migrate_legacy',{p_legacy_room:legacy});
  const b=await db.rpc(guest,'six_migrate_legacy',{p_legacy_room:legacy});assert.equal(a.room,b.room);
  await assert.rejects(db.rpc(outsider,'six_migrate_legacy',{p_legacy_room:legacy}),/not a legacy room member/);
  await assert.rejects(db.sql(`UPDATE public.sync_data SET data='{}' WHERE room=${db.literal(legacy)}`),/sync upgraded/);
});
