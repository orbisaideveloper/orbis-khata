import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import postgres from 'postgres';
import {setup} from './sql-fixture.mjs';
import {provisionTransfer} from './sync-v2-recovery-fixture.mjs';

const url=new URL(process.env.KHATA_SYNC_V2_TEST_URL??'http://missing');
assert(url.protocol==='postgres:' && url.hostname==='127.0.0.1' && url.pathname==='/khata_sync_v2_test' && !url.search);
const sql=postgres(url.toString(),{max:10,connection:{statement_timeout:15000}});
const tenants=Array.from({length:3},(_,i)=>({
  actor:`11111111-1111-7111-8111-11111111111${i}`,
  owner:crypto.randomUUID(),company:crypto.randomUUID(),party:crypto.randomUUID(),
}));
const book=tenants[0],epoch='rollout';
const read=(path)=>readFile('supabase/'+path,'utf8');
const apply=async files=>{
  const conn=await sql.reserve();
  try{for(const file of files)await conn.unsafe(await read(file));}finally{conn.release();}
};
const legacy=(book,work,verified=true)=>sql.begin(async tx=>{
  await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:book.owner,role:'authenticated'})},true),
    set_config('orbis.khata.gateway_verified',${verified?'v1':''},true)`;
  await tx`set local role authenticated`;
  return work(tx);
});
const voucher=(tx,book,id,amount='125')=>tx`select public.khata_post_v1(${id}::uuid,${book.company}::uuid,
  ${book.party}::uuid,'receipt','2026-10-01',${amount},'cash','','Synthetic rollout',null)`;
async function fingerprint(){
  return (await sql`select encode(sha256(convert_to(jsonb_build_object(
    'companies',(select jsonb_agg(to_jsonb(c) order by c.id) from public.khata_companies c),
    'parties',(select jsonb_agg(to_jsonb(p) order by p.id) from public.khata_parties p),
    'vouchers',(select jsonb_agg(to_jsonb(v) order by v.id) from public.khata_vouchers v),
    'inventory',(select jsonb_agg(to_jsonb(i) order by i.id) from public.khata_inventory_documents i)
  )::text,'UTF8')),'hex') as digest`)[0].digest;
}
try{
  assert.equal((await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`)[0].n,0);
  const init=await sql.reserve();
  try{
    await setup({exec:statement=>init.unsafe(statement),query:async(statement,params=[])=>({rows:await init.unsafe(statement,params)})});
    await init.unsafe('grant usage on schema auth to authenticated');
  }finally{init.release();}
  await apply(['migrations/20261031075245_lottery_row_storage.sql',
    'migrations/20261031081126_continuous_production.sql',
    'migrations/20261101144338_expense_profile_schedules.sql','migrations/20261105101338_safe_retired_company_purge.sql']);
  for(const t of tenants){
    await sql`insert into orbis_khata.ledger_owners(id,legacy) values(${t.owner},false)`;
    await sql`insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference)
      values(${t.actor},${t.owner},'synthetic-fixture')`;
    await sql`insert into public.khata_companies(id,owner_id,name) values(${t.company},${t.owner},'Existing company')`;
    await sql`insert into public.khata_parties(id,company_id,name,kind) values(${t.party},${t.company},'Existing party','both')`;
    await legacy(t,async tx=>{for(let i=0;i<200;i++)await voucher(tx,t,crypto.randomUUID());});
  }
  const before=await fingerprint();
  await assert.rejects(sql.begin(async tx=>{
    await tx.unsafe(await read('tests/sync-v2/kernel.sql'));
    throw new Error('ROLLOUT_ABORT_PROBE');
  }),/ROLLOUT_ABORT_PROBE/);
  assert.equal((await sql`select to_regnamespace('sync_v2') as fixture`)[0].fixture,null);
  assert.equal(await fingerprint(),before);

  const initialSize=(await sql`select pg_total_relation_size('public.khata_vouchers') as bytes`)[0].bytes;
  const migrateStarted=performance.now();
  await apply([
    'tests/sync-v2/kernel.sql','tests/sync-v2/module-kind-registry.sql','tests/sync-v2/grouped-feed.sql',
    'tests/sync-v2/khata-writer.sql','tests/sync-v2/company-id-fence.sql','tests/sync-v2/company-lifecycle-capture.sql',
    'tests/sync-v2/voucher-stock-order.sql','tests/sync-v2/voucher-capture.sql',
    'tests/sync-v2/company-direct-write-fence.sql','tests/sync-v2/expense-master-lock-order.sql',
    'tests/sync-v2/production-stock-authorization.sql','tests/sync-v2/purge-stock-order.sql',
    'tests/sync-v2/purge-sweep.sql','tests/sync-v2/settlement-expense-capture.sql',
    'tests/sync-v2/company-operational-capture.sql','tests/sync-v2/company-projection-sections.sql',
    'tests/sync-v2/lottery-capture.sql','tests/sync-v2/authorized-module-feed.sql',
    'tests/sync-v2/trusted-device-authority.sql','tests/sync-v2/recovery-transfer.sql',
  ]);
  const migrationMs=Math.round(performance.now()-migrateStarted);
  assert.equal(await fingerprint(),before);
  assert.equal((await sql`select count(*)::int as n from sync_v2.company_identity where not purged`)[0].n,3);

  await sql`insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)
    values(${book.actor},'company',${book.company},${epoch},'active')`;
  await assert.rejects(legacy(book,tx=>voucher(tx,book,crypto.randomUUID()),false));
  await assert.rejects(legacy(tenants[1],tx=>voucher(tx,book,crypto.randomUUID())),/COMPANY_NOT_ACCESSIBLE/);
  await assert.rejects(legacy(book,tx=>tx`select * from sync_v2.event`),error=>error.code==='42501');

  const posting=performance.now();
  await Promise.all(Array.from({length:16},()=>legacy(book,tx=>voucher(tx,book,crypto.randomUUID()))));
  const concurrentMs=Math.round(performance.now()-posting);
  const start='16';
  const groupStarted=performance.now();
  await legacy(book,async tx=>{for(let i=0;i<510;i++)await voucher(tx,book,crypto.randomUUID(),'1');});
  const groupWriteMs=Math.round(performance.now()-groupStarted);
  await assert.rejects(sql`select sync_v2.read_grouped_feed(${book.actor},'company',${book.company},${epoch},${start}::bigint,1)`,
    /SYNC_FEED_GROUP_TOO_LARGE/);
  const transfers=await provisionTransfer(sql,book.actor,'company',book.company,epoch);
  const group=await transfers.open(start);
  assert.equal(group.items,510);
  const recovered=await transfers.download(group);
  assert.equal(recovered.length,510);
  assert.equal(recovered.at(-1).seq,'526');
  assert.equal(recovered.reduce((sum,event)=>sum+BigInt(JSON.parse(event.change[0].projectionJson).amount_minor),0n),510n);
  const snapshot=await transfers.open();
  assert.equal(snapshot.next,'526');
  const recoveredBook=await transfers.download(snapshot);
  const accountImage=recoveredBook.filter(r=>r.entityType==='voucher').map(r=>JSON.parse(r.projectionJson));
  assert.equal(accountImage.length,726);
  assert(accountImage.every(v=>v.company_id===book.company));
  assert.equal(accountImage.reduce((sum,v)=>sum+BigInt(v.amount_minor),0n),27510n);

  // Activation rollback rehearsal: stop new Sync reads; legacy accounting
  // remains authoritative and older scope shipments are fenced.
  await sql`update sync_v2.registered_device set revoked_at=now() where actor=${book.actor}`;
  await assert.rejects(transfers.read(snapshot.transfer,1,0),/SYNC_TRUSTED_DEVICE_DENIED/);
  await legacy(book,tx=>voucher(tx,book,crypto.randomUUID(),'25'));
  const [totals]=await sql`select count(*)::int as n,sum(amount_minor)::text as amount from public.khata_vouchers
    where company_id=${book.company}`;
  assert.deepEqual({...totals},{n:727,amount:'27535'});
  const [{size}]=await sql`select jsonb_build_object(
    'voucherBytes',pg_total_relation_size('public.khata_vouchers'),
    'feedBytes',pg_total_relation_size('sync_v2.event'),
    'transferBytes',pg_total_relation_size('sync_v2.recovery_transfer_item'),
    'transferToastBytes',pg_total_relation_size(reltoastrelid)
  ) as size from pg_class where oid='sync_v2.recovery_transfer_item'::regclass`;
  await sql`update sync_v2.recovery_transfer set opened_at=now()-interval '1 day'`;
  assert.equal((await sql`select sync_v2.dispose_recovery_transfers(now(),1) as removed`)[0].removed,1);
  assert.equal((await sql`select count(*)::int as n from sync_v2.recovery_transfer_item`)[0].n,0);
  assert.equal((await sql`select count(*)::int as n from sync_v2.event`)[0].n,527);
  console.log('ROLLOUT_METRIC '+JSON.stringify({tenants:3,legacyVouchers:600,initialVoucherBytes:initialSize,
    migrationMs,concurrentMs,groupWriteMs,...size}));
  console.log('PASS: additive SQL on populated tenant data, reversible activation, 510-event group, legacy posting and retained feed.');
}finally{await sql.end({timeout:5});}
