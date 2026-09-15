const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {project, merge, copy, Engine} = require('../www/sync-engine.js');
const item = (id, text = id) => ({id, text, done:false, skipped:false});
const memory = () => {const map = new Map(); return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
function server(initial = project()) {
  let row = {revision:0, data:copy(initial)};
  const writes = new Set();
  return {
    read:async()=>copy(row),
    write:async(room, revision, data, id)=>{
      if (writes.has(id)) return {...copy(row),applied:true};
      if (revision !== row.revision) return {...copy(row),applied:false};
      row={revision:row.revision+1,data:copy(data)};
      writes.add(id);
      return {...copy(row),applied:true};
    },
  };
}
function device(transport, {storage=memory(),initial=project()} = {}) {
  let state=copy(initial), status;
  const engine=new Engine({room:'test-room',initial:state,storage,transport,uuid:randomUUID,
    apply:data=>{state=data;},status:value=>{status=value;}});
  engine.restore();
  return {engine,storage,get state(){return state;},get status(){return status;},
    edit(fn){fn(state);engine.capture(state);},flush:()=>engine.flush()};
}
test('remote deletion, settings, plan clearing and chance use propagate', () => {
  const base=project({inbox:[item('a')],plan:{date:'2026-09-16',items:[item('p')]}});
  const remote=copy(base); remote.inbox=[]; remote.plan=null;
  remote.settings.allowSkip=true; remote.usedTodayChance=true;
  assert.deepEqual(merge(base,base,remote),remote);
});
test('deletion wins against an offline edit and cannot resurrect an item', () => {
  const base=project({inbox:[item('a')]});
  const local=copy(base), remote=copy(base);
  local.inbox=[]; remote.inbox[0].text='offline edit';
  assert.deepEqual(merge(base,local,remote).inbox,[]);
  assert.deepEqual(merge(base,remote,local).inbox,[]);
});
test('an explicit reset also clears additions made by a disconnected device', async () => {
  const backend=server(project({inbox:[item('old')]})),a=device(backend),b=device(backend);
  await Promise.all([a.flush(),b.flush()]);b.edit(s=>s.inbox.push(item('offline')));
  a.engine.capture(project({resetId:randomUUID()}));await a.flush();await b.flush();
  assert.deepEqual(b.state.inbox,[]);assert.deepEqual((await backend.read()).data.inbox,[]);
});
test('independent edits of the same task survive', () => {
  const base=project({inbox:[item('a')]});
  const local=copy(base), remote=copy(base);
  local.inbox[0].done=true; remote.inbox[0].text='new text';
  assert.deepEqual(merge(base,local,remote).inbox,[{...item('a','new text'),done:true}]);
});
test('reordering and concurrent additions survive together', () => {
  const base=project({inbox:[item('a'),item('b')]});
  const local=copy(base), remote=copy(base);
  local.inbox.reverse(); remote.inbox.push(item('c'));
  assert.deepEqual(merge(base,local,remote).inbox.map(x=>x.id),['b','c','a']);
});
test('notification permission and notification history stay device-local', () => {
  assert.equal(project({settings:{notify:true},lastNotified:{morning:'today'}}).settings.notify,undefined);
  assert.equal(project().lastNotified,undefined);
});
test('three devices concurrently add tasks and converge', async () => {
  const backend=server(), devices=[device(backend),device(backend),device(backend)];
  await Promise.all(devices.map(d=>d.flush()));
  devices.forEach((d,i)=>d.edit(s=>s.inbox.push(item(String(i)))));
  await Promise.all(devices.map(d=>d.flush()));
  await Promise.all(devices.map(d=>d.flush()));
  for(const d of devices){assert.deepEqual(d.state.inbox.map(x=>x.id).sort(),['0','1','2']);assert.equal(d.status,'connected');}
});
test('deletion stays deleted on an offline device after reconnecting', async () => {
  const backend=server(project({inbox:[item('a')]})), a=device(backend),b=device(backend);
  await Promise.all([a.flush(),b.flush()]);
  b.edit(s=>s.inbox[0].text='changed offline');
  a.edit(s=>s.inbox=[]);await a.flush();await b.flush();await a.flush();
  assert.deepEqual(a.state.inbox,[]);assert.deepEqual(b.state.inbox,[]);
});
test('failed upload stays pending and retries after a full reload', async () => {
  const backend=server(), storage=memory();let failing=true;
  const transport={read:backend.read,write:async(...args)=>{if(failing)throw Error('offline');return backend.write(...args);}};
  const a=device(transport,{storage});await a.flush();a.edit(s=>s.inbox.push(item('a')));
  await assert.rejects(a.flush(),/offline/);assert.equal(a.status,'reconnecting');
  a.engine.stop();failing=false;
  const reloaded=device(transport,{storage});await reloaded.flush();
  assert.equal((await backend.read()).data.inbox[0].id,'a');assert.equal(reloaded.engine.dirty,false);
});
test('lost acknowledgement is idempotent and does not override a later remote edit', async () => {
  const backend=server();let lose=true;
  const transport={read:backend.read,write:async(...args)=>{const r=await backend.write(...args);if(lose){lose=false;throw Error('lost response');}return r;}};
  const a=device(transport),b=device(backend);await a.flush();await b.flush();
  a.edit(s=>s.settings.itemLimit=4);await assert.rejects(a.flush(),/lost response/);
  await b.flush();b.edit(s=>s.settings.itemLimit=3);await b.flush();await a.flush();
  assert.equal(a.state.settings.itemLimit,3);assert.equal((await backend.read()).revision,2);
});
test('edits made while a write is in flight are uploaded too', async () => {
  const backend=server();let release, entered;
  const started=new Promise(r=>{entered=r;});let first=true;
  const transport={read:backend.read,write:async(...args)=>{
    if(first){first=false;entered();await new Promise(r=>{release=r;});}return backend.write(...args);
  }};
  const a=device(transport);await a.flush();a.edit(s=>s.inbox.push(item('a')));
  const pending=a.flush();await started;a.edit(s=>s.inbox.push(item('b')));release();await pending;
  assert.deepEqual((await backend.read()).data.inbox.map(x=>x.id),['a','b']);
});
test('duplicate pulls do not rerender or create extra server writes', async () => {
  const backend=server();let renders=0;
  const engine=new Engine({room:'r',initial:project(),storage:memory(),transport:backend,uuid:randomUUID,apply:()=>{renders++;}});
  await engine.flush();await engine.flush();assert.equal(renders,0);assert.equal((await backend.read()).revision,0);
});
test('a response from an old room cannot change the current UI', async () => {
  let finish;let rendered=false;
  const engine=new Engine({room:'old',initial:project(),storage:memory(),transport:{read:()=>new Promise(r=>{finish=r;})},
    apply:()=>{rendered=true;},uuid:randomUUID});
  const running=engine.flush();engine.stop();finish({revision:1,data:project({inbox:[item('old')]})});
  await running;assert.equal(rendered,false);
});
test('route comparison: whole-state replacement loses concurrent additions; CAS merge preserves them', async () => {
  const base=project();const a=copy(base),b=copy(base);a.inbox.push(item('a'));b.inbox.push(item('b'));
  let naive=copy(a);naive=copy(b);assert.equal(naive.inbox.length,1);
  const backend=server(),left=device(backend),right=device(backend);await Promise.all([left.flush(),right.flush()]);
  left.edit(s=>s.inbox.push(item('a')));right.edit(s=>s.inbox.push(item('b')));
  await Promise.all([left.flush(),right.flush()]);assert.equal((await backend.read()).data.inbox.length,2);
});
