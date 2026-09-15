const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function worker(scope='https://example.test/',cacheNames=[]){
  const handlers={},store=new Map(),requested=[],deleted=[];let precache=[],currentCache;
  const cache={addAll:async assets=>{precache=assets;},put:async(k,v)=>store.set(k,v),match:async k=>store.get(k)};
  const context=vm.createContext({URL,URLSearchParams,
    self:{registration:{scope},clients:{claim:async()=>{}},addEventListener:(n,fn)=>{handlers[n]=fn;},skipWaiting:()=>{}},
    caches:{open:async name=>{currentCache=name;return cache;},keys:async()=>cacheNames,delete:async name=>{deleted.push(name);return true;}},
    fetch:async req=>{requested.push(req.url);throw Error('offline');}});
  vm.runInContext(fs.readFileSync('www/sw.js','utf8'),context);
  return {store,requested,deleted,currentCache:()=>currentCache,precache:()=>precache,handlers,fetch:async(url,mode='cors')=>{
    let response;handlers.fetch({request:{method:'GET',url,mode},respondWith:p=>{response=p;}});return response;
  }};
}
test('PWA precaches every script, stylesheet, and manifest from the entry page',async()=>{
  const sw=worker();let installed;sw.handlers.install({waitUntil:p=>{installed=p;}});await installed;
  const html=fs.readFileSync('www/index.html','utf8');
  for(const [,asset]of html.matchAll(/(?:src|href)="([^"#]+)"/g))assert.ok(sw.precache().includes('./'+asset),asset+' must work offline');
});
test('offline navigation with a new query falls back to the cached app shell',async()=>{
  for(const scope of ['https://example.test/','https://example.test/sixthings/']){
    const sw=worker(scope);sw.store.set('./index.html','offline page');
    assert.equal(await sw.fetch(scope+'?from=home','navigate'),'offline page');
  }
});
test('manifest launches and installs within root and project subpaths',()=>{
  const manifest=JSON.parse(fs.readFileSync('www/manifest.webmanifest','utf8'));
  for(const base of ['https://example.test/','https://example.test/sixthings/']){
    const manifestURL=base+'manifest.webmanifest';
    for(const field of ['start_url','id','scope'])assert.equal(new URL(manifest[field],manifestURL).href,base);
    for(const icon of manifest.icons)assert.ok(new URL(icon.src,manifestURL).href.startsWith(base+'icons/'));
  }
});
test('activation preserves caches belonging to other applications and paths',async()=>{
  const names=['another-app-cache','sixthings-v3:/other/:old','sixthings-v3:/:old','sixthings-v3-legacy','sixthings-v3:/sixthings/:old'];
  const sw=worker('https://example.test/sixthings/',names);
  let installed;sw.handlers.install({waitUntil:p=>{installed=p;}});await installed;
  names.push(sw.currentCache());
  let activated;sw.handlers.activate({waitUntil:p=>{activated=p;}});await activated;
  assert.deepEqual(sw.deleted,['sixthings-v3:/sixthings/:old']);
});
test('worker leaves cross-origin and out-of-scope requests to the browser',async()=>{
  const sw=worker('https://example.test/sixthings/');
  for(const url of ['https://other.test/sixthings/app.js','https://example.test/other/app.js','https://example.test/sixthings-other/app.js']){
    assert.equal(await sw.fetch(url),undefined);
  }
  assert.deepEqual(sw.requested,[]);
});
test('cache keys preserve release versions while dropping cache-busting timestamps',async()=>{
  const sw=worker();sw.store.set('https://example.test/app.js?v=new','new code');sw.store.set('https://example.test/app.js?v=old','old code');
  assert.equal(await sw.fetch('https://example.test/app.js?v=new&t=123'),'new code');
});
