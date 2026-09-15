const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto').webcrypto;
function context(client) {
  const memory=new Map(),events={};let timer=0;
  const box=vm.createContext({crypto,AbortController,console,
    window:{SIXTHINGS_CONFIG:{url:'http://localhost',anonKey:'test-key'},supabase:{createClient:()=>client},addEventListener:(name,fn)=>{events[name]=fn;}},
    document:{addEventListener(){}},localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},
    setTimeout:()=>++timer,clearTimeout(){},setInterval:()=>++timer,clearInterval(){}});
  for(const name of ['sync-engine.js','sync.js'])vm.runInContext(fs.readFileSync('www/'+name,'utf8'),box);
  vm.runInContext('let fixture=SixSync.project();Sync.onGetData=()=>fixture;Sync.onData=p=>{fixture=p.data;};',box);
  return {run:code=>vm.runInContext(code,box),events,memory};
}
function backend() {
  const rooms=new Map();let invites=0;
  return {rooms,get invites(){return invites;},auth:{
    getSession:async()=>({data:{session:{user:{id:'test-existing-identity'}}}}),
    signInAnonymously:async()=>{throw Error('Must reuse existing identity');}},
    rpc:async(name,args)=>{
      if(name==='six_create_room'){rooms.set(args.p_room,{room:args.p_room,data:args.p_data,revision:0,members:1});return {data:rooms.get(args.p_room)};}
      if(name==='six_get_room')return {data:rooms.get(args.p_room)};
      if(name==='six_create_invite'){invites++;return {data:{code:String(invites).padStart(12,'0')}};}
      throw Error('Unexpected RPC '+name);
    }};
}
test('existing anonymous identity survives refresh',async()=>{
  const c=context(backend());assert.equal(await c.run('Sync.syncInit()'),true);
  assert.equal(c.run('Sync.uid'),'test-existing-identity');
});
test('anonymous authentication errors do not enable sync',async()=>{
  const client=backend();client.auth.getSession=async()=>({data:{session:null}});
  client.auth.signInAnonymously=async()=>({error:{message:'auth unavailable'}});
  const c=context(client);assert.equal(await c.run('Sync.syncInit()'),false);assert.equal(c.run('Sync.enabled'),false);
});
test('coming online after an unpaired startup clears the stale connection error',async()=>{
  const client=backend();let offline=true;
  client.auth.getSession=async()=>offline?{error:{message:'offline'}}:{data:{session:{user:{id:'restored'}}}};
  const c=context(client);assert.equal(await c.run('Sync.syncInit()'),false);
  offline=false;await c.events.online();assert.equal(c.run('Sync.enabled'),true);assert.equal(c.run('Sync.connState'),'off');
});
test('room creation database errors reach the UI',async()=>{
  const client=backend();client.rpc=async()=>({error:{message:'database unavailable'}});
  const c=context(client);const result=await c.run('Sync.syncCreatePairing()');
  assert.equal(result.ok,false);assert.match(result.reason,/database unavailable/);assert.equal(c.run('Sync.paired'),false);
});
test('host enters a usable room without receiving any realtime event',async()=>{
  const client=backend(),c=context(client);const result=await c.run('Sync.syncCreatePairing()');
  assert.equal(result.ok,true);assert.equal(result.code.length,12);
  assert.equal(c.run('Sync.paired'),true);assert.equal(c.run('Sync.connState'),'connected');
});
test('adding a third device does not discard or replace the existing room',async()=>{
  const client=backend(),c=context(client);await c.run('Sync.syncCreatePairing()');const room=c.run('Sync.room');
  await c.run('Sync.syncCreatePairing()');assert.equal(c.run('Sync.room'),room);assert.equal(client.rooms.size,1);assert.equal(client.invites,2);
});
test('disconnect during creation prevents a late response from reconnecting',async()=>{
  const client=backend(),original=client.rpc;let release,started;
  const ready=new Promise(r=>{started=r;});
  client.rpc=async(name,args)=>{if(name==='six_create_room'){started();await new Promise(r=>{release=r;});}return original(name,args);};
  const c=context(client),pending=c.run('Sync.syncCreatePairing()');await ready;
  await c.run('Sync.syncDisconnect()');release();const result=await pending;
  assert.equal(result.ok,false);assert.equal(c.run('Sync.paired'),false);assert.equal(c.run('Sync.room'),null);
});
test('app applies settings, deletions, chance state while keeping notification permission local',()=>{
  const c=context(backend());
  c.memory.set('sixthings:v1',JSON.stringify({inbox:[{id:'a',text:'a'}],settings:{notify:true}}));
  const source=fs.readFileSync('www/app.js','utf8');c.run(source.slice(0,source.indexOf('// 全局同步指示器')));
  c.run('idbBackup=()=>{};render=()=>{};toast=()=>{};');
  c.run('syncApplyRemote({data:SixSync.project({settings:{allowSkip:true},usedTodayChance:true})})');
  assert.equal(c.run('S.inbox.length'),0);assert.equal(c.run('S.settings.allowSkip'),true);
  assert.equal(c.run('S.usedTodayChance'),true);assert.equal(c.run('S.settings.notify'),true);
});
test('two devices activating the same plan keep the same task identities',()=>{
  const ids=[];
  for(let i=0;i<2;i++){
    const c=context(backend());c.memory.set('sixthings:v1',JSON.stringify({plan:{date:'2000-01-01',items:[{id:'same-plan-task',text:'fixture'}]}}));
    const source=fs.readFileSync('www/app.js','utf8');c.run(source.slice(0,source.indexOf('// 全局同步指示器')));
    c.run('save=()=>{};activateToday()');ids.push(c.run('getToday().items[0].id'));
  }
  assert.deepEqual(ids,['same-plan-task','same-plan-task']);
});
