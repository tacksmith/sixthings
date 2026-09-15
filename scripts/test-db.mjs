import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const directory=await mkdtemp(join(tmpdir(),'sixthings-test-db-'));
let started=false;
try {
  await run('initdb',['-D',directory,'--auth=trust','--no-locale','-E','UTF8']);
  await run('pg_ctl',['-D',directory,'-l',join(directory,'server.log'),'-o',`-h '' -k '${directory}'`,'start']);
  started=true;
  const child=spawn(process.execPath,['--test','tests/database.integration.cjs'],{
    stdio:'inherit',env:{...process.env,SIXTHINGS_TEST_PG_DIR:directory,SIXTHINGS_TEST_PG_PORT:'5432'}});
  process.exitCode=await new Promise(resolve=>child.on('exit',resolve));
} finally {
  if(started)await run('pg_ctl',['-D',directory,'-m','fast','stop']);
  await rm(directory,{recursive:true,force:true});
}
