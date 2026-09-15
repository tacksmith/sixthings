const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {readFile} = require('node:fs/promises');
const run = promisify(execFile);
function options() {
  const directory = process.env.SIXTHINGS_TEST_PG_DIR;
  if (!directory || !directory.includes('sixthings-')) throw Error('An isolated SIXTHINGS_TEST_PG_DIR is required');
  return ['-XAt','-h',directory,'-p',process.env.SIXTHINGS_TEST_PG_PORT || '5432','-d','postgres','-v','ON_ERROR_STOP=1'];
}
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
async function sql(statement) {
  const {stdout} = await run('psql', [...options(),'-c',statement], {maxBuffer:4*1024*1024});
  return stdout.trim();
}
async function setup() {
  await sql(`
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  `);
  await sql(await readFile(new URL('../../docs/supabase-schema-v3.sql', 'file://' + __filename), 'utf8'));
}
async function user(id) { await sql(`INSERT INTO auth.users(id) VALUES (${literal(id)}) ON CONFLICT DO NOTHING`); }
const functions = new Set(['six_get_room','six_create_room','six_create_invite','six_join_room','six_write_room','six_leave_room','six_migrate_legacy']);
async function rpc(uid, name, args) {
  if (!functions.has(name) || !/^[a-f0-9-]{36}$/.test(uid)) throw Error('Invalid test RPC');
  const parameters = Object.entries(args).map(([key,value])=>{
    if (!/^p_[a-z_]+$/.test(key)) throw Error('Invalid argument');
    return key+' => '+(value===null?'NULL':typeof value==='number'?String(value):literal(typeof value==='object'?JSON.stringify(value):value));
  }).join(',');
  const result = await sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=${literal(uid)};
    SELECT public.${name}(${parameters}); COMMIT;`);
  const json = result.split('\n').find(line=>line.startsWith('{'));
  return json ? JSON.parse(json) : null;
}
module.exports={sql,setup,user,rpc,literal};
