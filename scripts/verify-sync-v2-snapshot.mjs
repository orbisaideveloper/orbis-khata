// Isolated native PostgreSQL 17 historical company snapshot acceptance.
// Fails closed if pointed at anything except the disposable CI database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { setup } from './sql-fixture.mjs';

const url = new URL(process.env.KHATA_SYNC_V2_TEST_URL ?? 'http://missing');
assert.equal(url.protocol, 'postgres:');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/khata_sync_v2_test');
assert.equal(url.search, '');
const db = postgres(url.toString(), { max: 6, connection: {
  application_name: 'khata-sync-v2-native-snapshot', statement_timeout: 30000,
}});
const owner='11111111-1111-7111-8111-111111111111';
const actor='22222222-2222-7222-8222-222222222222';
const company='33333333-3333-7333-8333-333333333333';
const other='55555555-5555-7555-8555-555555555555';
const credential='a'.repeat(64);
const registration='snapshot-test-android';
const epoch='snapshot-native-ci';
const migrations=[
  '20261031075245_lottery_row_storage.sql',
  '20261031081126_continuous_production.sql',
  '20261101144338_expense_profile_schedules.sql',
  '20261105101338_safe_retired_company_purge.sql',
  '20261124173000_private_lottery_sync_payment.sql',
  '20261125100000_lottery_immutable_feed_recovery.sql',
  '20261125103000_sync_device_pairing.sql',
];
const snapshot=async({scope=company,digest=credential,afterModel=null,afterKey=null,head=null,limit=100,bytes=262144}={})=>
  (await db.unsafe(`select sync_v2.read_trusted_company_snapshot(
    $1::uuid,$2,$3,$4::uuid,$5,$6::bigint,$7,$8,$9,$10) as snapshot`,
  [actor,registration,digest,scope,epoch,head,afterModel,afterKey,limit,bytes]))[0].snapshot;

try {
  const existing=await db`select count(*)::integer n from information_schema.tables where table_schema='public'`;
  assert.equal(existing[0].n,0,'DISPOSABLE_EMPTY_POSTGRES_ONLY');
  const init=await db.reserve();
  try {
    await setup({exec:statement=>init.unsafe(statement),query:async(statement,parameters=[])=>({rows:await init.unsafe(statement,parameters)})});
    for(const f of migrations) await init.unsafe(await readFile('supabase/migrations/'+f,'utf8'));
    for(const f of [
      '20261125_private_company_financial_capture.review.sql',
      '20261125_private_company_group_recovery.review.sql',
      '20261126_private_company_historical_snapshot.review.sql',
    ]) await init.unsafe(await readFile('supabase/review-candidates/'+f,'utf8'));
    await init.unsafe('grant usage on schema auth to authenticated');
  } finally {init.release();}
  const catalog=await db.unsafe(`select c.relname as name from pg_class c
    join pg_namespace ns on ns.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='company_id' and not a.attisdropped
    where ns.nspname='public' and c.relkind in ('r','p') order by c.relname`);
  assert.equal(catalog.length,22,'COMPANY_RELATION_INVENTORY_DRIFT');
  const text=await readFile('supabase/review-candidates/20261126_private_company_historical_snapshot.review.sql','utf8');
  for(const {name} of catalog)assert(text.includes(`from public.${name} r where r.company_id=c`),`MISSING_SNAPSHOT_MODEL_${name}`);
  console.log('PASS native PG17: all 22 company-scoped schema models captured by snapshot contract');

  await db.unsafe('insert into auth.users(id) values($1)',[owner]);
  await db.unsafe('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[owner]);
  await db.unsafe('insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values($1,$2,$3)',[actor,owner,'native-synthetic-test']);
  await db.unsafe('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3),($4,$5,$3)',[company,'Main synthetic company',owner,other,'Foreign company']);
  await db.unsafe("insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values($1,'company',$2,$3,'active')",[actor,company,epoch]);
  await db.unsafe('insert into sync_v2.registered_device(actor,registration,credential_sha256,client,primary_android,expires_at) values($1,$2,$3,$4,true,now()+interval \'1 day\')',[actor,registration,credential,'android']);
  await db.unsafe("insert into sync_v2.sync_entitlement(actor,capability,expires_at) values($1,'sync.single-primary',now()+interval '1 day')",[actor]);
  await db.unsafe("insert into sync_v2.device_scope_grant(actor,registration,kind,scope_id,epoch,can_write) values($1,$2,'company',$3,$4,false)",[actor,registration,company,epoch]);
  const parties=Array.from({length:30},()=>randomUUID());
  for(const [n,id] of parties.entries()) await db.unsafe('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',[id,company,`Synthetic ${n}`,'both']);
  const foreign=randomUUID();
  await db.unsafe('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',[foreign,other,'PRIVATE OTHER COMPANY','both']);
  let page=await snapshot({limit:7});const head=page.highWater;const records=[];
  for(let i=0;i<15;i++){
    records.push(...page.rows);
    if(page.done)break;
    assert(page.nextModel && page.nextKey,'INCOMPLETE_CURSOR');
    page=await snapshot({head,afterModel:page.nextModel,afterKey:page.nextKey,limit:7});
    assert.equal(page.highWater,head,'REVISION_CHANGED_BETWEEN_PAGES');
    assert(i<14,'UNBOUNDED_PAGINATION');
  }
  assert.equal(records.length,31,'LOSSLESS_SNAPSHOT_ROW_COUNT');
  assert.equal(new Set(records.map(r=>`${r.model}:${r.key}`)).size,31,'DUPLICATE_SNAPSHOT_ROW');
  assert.equal(records.some(r=>r.projectionJson.includes(foreign)),false,'CROSS_COMPANY_DATA_LEAK');
  assert(records.some(r=>r.model==='khata_companies'),'MISSING_COMPANY_ROOT');
  console.log('PASS native PG17: 31 historical rows, 7-row paging, no repeats, cross-company isolation');

  await assert.rejects(snapshot({scope:other}),/SYNC_/);
  await assert.rejects(snapshot({digest:'invalid'}),/SYNC_TRUSTED_DEVICE_DENIED/);
  await assert.rejects(snapshot({head,afterModel:'bogus-model',afterKey:'[]',limit:1}),/SYNC_COMPANY_SNAPSHOT_CURSOR_OR_LIMIT/);
  await assert.rejects(snapshot({limit:101}),/SYNC_COMPANY_SNAPSHOT_CURSOR_OR_LIMIT/);
  await assert.rejects(snapshot({bytes:512}),/SYNC_COMPANY_SNAPSHOT_PAGE_TOO_LARGE/);
  console.log('PASS native PG17: deny foreign scope, missing credential, fabricated cursor and oversize page');

  const first=await snapshot({limit:1});
  await db.unsafe('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',[randomUUID(),company,'Later revision','both']);
  await assert.rejects(snapshot({head:first.highWater,afterModel:first.nextModel,afterKey:first.nextKey,limit:1}),/SYNC_COMPANY_SNAPSHOT_STALE/);
  await db.unsafe('update sync_v2.registered_device set revoked_at=now() where actor=$1 and registration=$2',[actor,registration]);
  await assert.rejects(snapshot(),/SYNC_TRUSTED_DEVICE_DENIED/);
  console.log('PASS native PG17: revision fence and revoked device fail closed');
  console.log('PASS isolated native PostgreSQL historical snapshot; NOT all Phase 2B writers or real client E2E');
} finally {await db.end({timeout:5});}
