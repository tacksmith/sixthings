import {cp,mkdir,writeFile,rm} from 'node:fs/promises';
import {configuration,configScript} from './web-config.mjs';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('www','dist',{recursive:true});
await writeFile('dist/config.js',configScript(await configuration()));
console.log('Web/PWA build ready in dist/');
