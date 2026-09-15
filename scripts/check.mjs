import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
for(const file of ['app.js','sync.js','sync-engine.js','i18n.js','sw.js','config.js'])execFileSync(process.execPath,['--check','www/'+file]);
const html=readFileSync('www/index.html','utf8'),app=readFileSync('www/app.js','utf8');
const version=app.match(/const APP_VERSION = "([^"]+)"/)[1];
for(const name of ['app.js','sync.js','sync-engine.js','i18n.js','styles.css'])assert.ok(html.includes(name+'?v='+version),name+' version mismatch');
for(const [,asset] of html.matchAll(/(?:src|href)="([^"#]+)"/g))assert.ok(existsSync('www/'+asset.split('?')[0]),asset+' missing');
console.log('JavaScript, asset references, and release versions checked.');
