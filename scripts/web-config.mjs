import {readFile} from 'node:fs/promises';
export async function configuration() {
  const local={};
  try {
    for(const line of (await readFile('.env.local','utf8')).split('\n')) {
      const match=line.match(/^(SIXTHINGS_SUPABASE_(?:URL|ANON_KEY))=(.*)$/);
      if(match)local[match[1]]=match[2].startsWith('"')?JSON.parse(match[2]):match[2];
    }
  } catch(error) { if(error.code!=='ENOENT')throw error; }
  const config={url:process.env.SIXTHINGS_SUPABASE_URL??local.SIXTHINGS_SUPABASE_URL??'',
    anonKey:process.env.SIXTHINGS_SUPABASE_ANON_KEY??local.SIXTHINGS_SUPABASE_ANON_KEY??''};
  let role;
  try {role=JSON.parse(Buffer.from(config.anonKey.split('.')[1]||'','base64url').toString()).role;} catch {}
  if(config.anonKey.startsWith('sb_secret_')||role==='service_role')throw Error('Use a publishable/anon key; secret keys must never enter a browser build.');
  return config;
}
export const configScript=config=>'window.SIXTHINGS_CONFIG = '+JSON.stringify(config)+';\n';
