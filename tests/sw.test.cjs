const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function worker(){
  const handlers={},store=new Map(),requested=[];let precache=[];
  const cache={addAll:async assets=>{precache=assets;},put:async(k,v)=>store.set(k,v),match:async k=>store.get(k)};
  const context=vm.createContext({URL,URLSearchParams,
    self:{location:{origin:'https://example.test'},addEventListener:(n,fn)=>{handlers[n]=fn;},skipWaiting:()=>{}},
    caches:{open:async()=>cache},fetch:async req=>{requested.push(req.url);throw Error('offline');}});
  vm.runInContext(fs.readFileSync('www/sw.js','utf8'),context);
  return {store,requested,precache:()=>precache,handlers,fetch:async(url,mode='cors')=>{
    let response;handlers.fetch({request:{method:'GET',url,mode},respondWith:p=>{response=p;}});return response;
  }};
}
test('PWA precaches every script, stylesheet, and manifest from the entry page',async()=>{
  const sw=worker();let installed;sw.handlers.install({waitUntil:p=>{installed=p;}});await installed;
  const html=fs.readFileSync('www/index.html','utf8');
  for(const [,asset]of html.matchAll(/(?:src|href)="([^"#]+)"/g))assert.ok(sw.precache().includes('./'+asset),asset+' must work offline');
});
test('offline navigation with a new query falls back to the cached app shell',async()=>{
  const sw=worker();sw.store.set('./index.html','offline page');
  assert.equal(await sw.fetch('https://example.test/?from=home','navigate'),'offline page');
});
test('cache keys preserve release versions while dropping cache-busting timestamps',async()=>{
  const sw=worker();sw.store.set('https://example.test/app.js?v=new','new code');sw.store.set('https://example.test/app.js?v=old','old code');
  assert.equal(await sw.fetch('https://example.test/app.js?v=new&t=123'),'new code');
});
