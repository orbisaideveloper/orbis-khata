/** Source boundary checks ONLY. These cannot replace native PG cron/Edge execution. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p=>readFile(p,'utf8');
const accounting=await read('supabase/migrations/20261028184713_khata_accounting_completion_v3.sql');
const lottoRetention=await read('supabase/migrations/20261122142011_lottery_live_per_draw.sql');
const lottoScheduler=await read('supabase/migrations/20261121145730_lottery_scheduler.sql');
const statement=await read('supabase/migrations/20261121182053_customer_statement_relay.sql');
const edge=await read('supabase/functions/orbis-khata-data/index.ts');

test('company purge cron is private, explicitly scheduled and guarded by company tombstone procedure',()=>{
  assert.match(accounting,/revoke all on function orbis_khata\.purge_retired_companies\(\) from public,anon,authenticated/i);
  assert.match(accounting,/cron\.schedule\('khata-retired-company-purge','17 3 \* \* \*','select orbis_khata\.purge_retired_companies\(\)'\)/);
  assert.match(accounting,/perform pg_advisory_xact_lock\(/);
  assert.match(accounting,/set_config\('orbis\.khata\.purge_company',cid::text,true\)/);
});
test('live retention cron deletes only live result cache, not financial ledger',()=>{
  const m=lottoRetention.match(/cron\.schedule\('lottery-live-retention'[^;]+;[^;]+;/);
  assert(m,'retention schedule missing');
  assert.match(m[0],/delete from lottery_private\.live_draw_cache/);
  assert.match(m[0],/update lottery_private\.live_cache/);
  assert.doesNotMatch(m[0],/khata_vouchers|khata_lottery_records|sync_v2\.event|sync_v2\.receipt/i);
});
test('lottery collector cron requires Vault worker secret and does not embed production tokens',()=>{
  assert.match(lottoScheduler,/cron\.schedule\('orbis-lottery-collector','30 seconds','select lottery_private\.tick\(\)'\)/);
  assert.match(lottoScheduler,/from vault\.decrypted_secrets where name='orbis_lottery_worker'/);
  assert.match(lottoScheduler,/revoke all on function lottery_private\.tick\(\),lottery_private\.start_scheduler\(text\) from public,anon,authenticated,service_role/);
  assert.match(lottoScheduler,/Authorization','Bearer '\|\|token/);
  assert.doesNotMatch(lottoScheduler,/service_role_key\s*=|eyJhbGciOiJIUzI1Ni/);
});
test('statement cleanup cron expires recipient mailbox and only resyncs links',()=>{
  const m=statement.match(/create function orbis_khata\.statement_relay_cleanup_v1\(\)[\s\S]*?\$cleanup\$;/);
  assert(m,'statement cleanup function missing');
  assert.match(m[0],/delete from orbis_khata\.statement_mailbox/);
  assert.match(m[0],/update orbis_khata\.statement_links set resync=true/);
  assert.doesNotMatch(m[0],/delete from public\.khata_vouchers|update public\.khata_vouchers/i);
  assert.match(statement,/cron\.schedule\('orbis-statement-relay-cleanup','17 \* \* \* \*','select orbis_khata\.statement_relay_cleanup_v1\(\)'\)/);
});
test('direct Edge writes are behind verified principal and owner mapping in one SQL transaction',()=>{
  assert.match(edge,/createKhataGateway\(\{[\s\S]*?verify,/);
  assert.match(edge,/execute: async \(principal, operation\) => sql\.begin\(async \(tx\) =>/);
  assert.match(edge,/resolve_ledger_owner\(\$\{principal\.orbisIdentityId\}::uuid\)/);
  assert.match(edge,/if \(operation\.input\.actor !== actor\) throw new Error\('KHATA_RECOVERY_IDENTITY_MISMATCH'\)/);
  assert.match(edge,/where identity_id = \$\{actor\}::uuid/);
  assert.match(edge,/insert into public\.khata_companies\(id,name,owner_id\)/);
  assert.match(edge,/insert into public\.khata_parties\(id,name,company_id,kind\)/);
  assert.match(edge,/KHATA_IDEMPOTENCY_CONFLICT/);
  assert.match(edge,/COMPANY_NOT_ACCESSIBLE/);
});
