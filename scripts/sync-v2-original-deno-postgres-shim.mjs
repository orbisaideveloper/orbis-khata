import assert from 'node:assert/strict';
import postgres from 'postgres';
export default function syntheticPostgres(original,config={}) {
  assert.equal(new URL(original).hostname,'db.gqyaxsczlmvppxuoqbox.supabase.co');
  const url=new URL(Deno.env.get('KHATA_SYNC_V2_TEST_URL')??'http://missing');
  assert.equal(url.protocol,'postgres:');assert.equal(url.hostname,'127.0.0.1');
  assert.equal(url.port,'5432');assert.equal(url.pathname,'/khata_sync_v2_test');
  return postgres(url.href,{max:config.max??3,prepare:false,connect_timeout:8});
}
