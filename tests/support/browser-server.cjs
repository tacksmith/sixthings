// Local-only test adapter: real PostgreSQL/RPCs with disposable mock auth.
// Never deploy this adapter. Production uses Supabase Auth and PostgREST.
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const db=require('./database.cjs');
const users=new Map();
const root=path.resolve('www');
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png'};
function session(uid,origin){
  const now=Math.floor(Date.now()/1000);
  const body={sub:uid,role:'authenticated',aud:'authenticated',iss:origin+'/auth/v1',iat:now,exp:now+3600};
  const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(body)).toString('base64url')+'.local-test-signature';
  users.set(token,uid);
  return {access_token:token,refresh_token:randomUUID(),token_type:'bearer',expires_in:3600,expires_at:now+3600,
    user:{id:uid,aud:'authenticated',role:'authenticated',is_anonymous:true,app_metadata:{provider:'anonymous'},user_metadata:{},created_at:new Date().toISOString()}};
}
async function handle(req,res){
  const origin='http://'+req.headers.host;
  const url=new URL(req.url,origin);
  const reply=(code,data)=>res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(data));
  try{
    if(req.method==='POST'){
      let raw='';for await(const chunk of req)raw+=chunk;
      const body=JSON.parse(raw||'{}');
      if(url.pathname==='/auth/v1/signup'){const uid=randomUUID();await db.user(uid);reply(200,session(uid,origin));return;}
      if(url.pathname.startsWith('/rest/v1/rpc/')){
        const uid=users.get((req.headers.authorization||'').replace(/^Bearer /,''));
        if(!uid){reply(401,{message:'Invalid local test session'});return;}
        const data=await db.rpc(uid,url.pathname.split('/').pop(),body);reply(200,data);return;
      }
    }
    if(url.pathname==='/config.js'){
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-cache'}).end('window.SIXTHINGS_CONFIG='+JSON.stringify({url:origin,anonKey:'local-test-public-key'})+';');return;
    }
    const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if(!file.startsWith(root+path.sep)){reply(403,{});return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}).end(await fs.readFile(file));
  }catch(error){if(!res.headersSent)reply(400,{message:error.message,code:'TEST_ERROR'});else res.end();}
}
db.setup().then(()=>{
  const ports=(process.env.SIXTHINGS_TEST_PORTS || '8765,8766,8767').split(',').map(Number);
  for(const port of ports)http.createServer(handle).listen(port,'127.0.0.1',()=>console.log('Isolated sync test server ready on '+port));
});
