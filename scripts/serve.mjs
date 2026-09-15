import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {configuration,configScript} from './web-config.mjs';
const root=resolve('www'),config=await configuration();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    const body=pathname==='/config.js'?configScript(config):await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}).end(body);
  } catch {res.writeHead(404).end('Not found');}
}).listen(Number(process.env.PORT||8080),'127.0.0.1',()=>console.log('Web/PWA preview: http://localhost:'+(process.env.PORT||8080)));
