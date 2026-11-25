// Native PostgreSQL 17-only, disposable company Sync v2 transaction acceptance.
// Never connects to a production DB, and never mutates the real Supabase project.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {setup} from './sql-fixture.mjs';

const url=new URL(process.env.KHATA_SYNC_V2_TEST_URL??'http://missing');
assert(url.protocol==='postgres:'&&url.hostname==='127.0.0.1'&&
  url.pathname==='/khata_sync_v2_test'&&!url.search,
'DISPOSABLE_LOCAL_POSTGRES_ONLY');
const sql=postgres(url.toString(),{max:16,connection:{application_name:'khata-sync-v2-company',statement_timeout:15000}});
const actor='22222222-2222-7222-8222-222222222222';
const owner='11111111-1111-7111-8111-111111111111';
const stranger='99999999-9999-7999-8999-999999999999';
const company='33333333-3333-7333-8333-333333333333';
const party='44444444-4444-7444-8444-444444444444';
const epoch='native-company-review';
const registration='native-review-phone';
const credentialDigest='a'.repeat(64);
const hash=s=>createHash('sha256').update(s).digest('hex');
const voucherId=randomUUID(),operationId=randomUUID();
const migrations=[
  '20261031075245_lottery_row_storage.sql',
  '20261031081126_continuous_production.sql',
  '20261101144338_expense_profile_schedules.sql',
  '20261105101338_safe_retired_company_purge.sql',
  '20261124173000_private_lottery_sync_payment.sql',
  '20261125100000_lottery_immutable_feed_recovery.sql',
  '20261125103000_sync_device_pairing.sql',
];
const count=async table=>(await sql.unsafe(`select count(*)::integer n from ${table}`))[0].n;
const head=async()=>(await sql.unsafe('select head::int n from sync_v2.scope where actor_id=$1 and kind=$2 and scope_id=$3',[actor,'company',company]))[0].n;
async function posting(id=voucherId,sub=owner){
  return sql.begin(async tx=>{
    await tx.unsafe("select set_config('request.jwt.claims',$1,true),set_config('orbis.khata.gateway_verified','v1',true)",
      [JSON.stringify({sub,role:'authenticated'})]);
    await tx.unsafe('set local role authenticated');
    const result=await tx.unsafe('select public.khata_post_v1($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$6,$7,$8,$9,$10::uuid) as voucher',
      [id,company,party,'receipt','2026-11-25','120','cash','','Native company review',null]);
    return result[0].voucher;
  });
}
async function receipt(id=voucherId,digest='b'.repeat(64),operation=operationId){
  return sql.begin(async tx=>(await tx.unsafe(
    'select sync_v2.finish_voucher($1,$2,$3,$4,$5,$6::jsonb)::text as seq',
    [actor,company,epoch,operation,digest,JSON.stringify({entityId:id})]))[0].seq);
}
const recover=async(after,item=null,offset=null,deviceProof=credentialDigest)=>(await sql.unsafe(
  'select sync_v2.read_trusted_company_group($1::uuid,$2,$3,$4,$5,$6::bigint,$7::integer,$8::integer) as value',
  [actor,registration,deviceProof,company,epoch,after,item,offset]))[0].value;

try{
  assert.equal((await sql`select count(*)::integer n from information_schema.tables where table_schema='public'`)[0].n,0,
    'Native database must be empty before installing candidates');
  const init=await sql.reserve();
  try{
    await setup({exec:statement=>init.unsafe(statement),query:async(statement,params=[])=>({rows:await init.unsafe(statement,params)})});
    for(const file of migrations)await init.unsafe(await readFile(`supabase/migrations/${file}`,'utf8'));
    for(const file of ['20261125_private_company_financial_capture.review.sql',
      '20261125_private_company_group_recovery.review.sql'])
      await init.unsafe(await readFile(`supabase/review-candidates/${file}`,'utf8'));
    await init.unsafe('grant usage on schema auth to authenticated');
  }finally{init.release();}
  await sql.unsafe('insert into auth.users(id) values($1),($2)',[owner,stranger]);
  await sql.unsafe('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[owner]);
  await sql.unsafe('insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values($1,$2,$3)',
    [actor,owner,'native-ci-only']);
  await sql.unsafe('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3)',[company,'Native review',owner]);
  await sql.unsafe('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',
    [party,company,'Native fixture party','both']);
  await sql.unsafe("insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values($1,'company',$2,$3,'active')",
    [actor,company,epoch]);
  await sql.unsafe('insert into sync_v2.registered_device(actor,registration,credential_sha256,client,primary_android,expires_at) values($1,$2,$3,$4,true,now()+interval \'1 day\')',
    [actor,registration,credentialDigest,'android']);
  await sql.unsafe("insert into sync_v2.sync_entitlement(actor,capability,expires_at) values($1,'sync.single-primary',now()+interval '1 day')",[actor]);
  await sql.unsafe("insert into sync_v2.device_scope_grant(actor,registration,kind,scope_id,epoch,can_write) values($1,$2,'company',$3,$4,false)",
    [actor,registration,company,epoch]);

  // True multi-session old-client idempotency: 32 concurrent same-ID posts.
  const value=await Promise.all(Array.from({length:32},()=>posting()));
  assert.equal(new Set(value.map(String)).size,1);
  assert.equal(await count('public.khata_vouchers'),1);
  assert.equal(await head(),1);
  assert.equal(await count('sync_v2.event'),1);
  const before=await head();
  await assert.rejects(posting(voucherId,stranger));
  assert.equal(await head(),before);
  console.log('PASS native PostgreSQL: 32 concurrent legacy retries -> one voucher and one feed event; foreign owner denied');

  const sequences=await Promise.all(Array.from({length:32},()=>receipt()));
  assert.equal(new Set(sequences).size,1);
  assert.equal(await count('sync_v2.receipt'),1);
  assert.equal(await head(),before);
  await assert.rejects(receipt(voucherId,'c'.repeat(64)),/SYNC_OPERATION_CONFLICT/);
  assert.equal(await head(),before);
  console.log('PASS native PostgreSQL: 32 concurrent exact receipt retries, immutable digest conflict');

  // Group recovery remains atomic despite default feed limit 500.
  await sql.begin(async tx=>{
    await tx.unsafe('update sync_v2.scope set head=head+510 where actor_id=$1 and scope_id=$2',[actor,company]);
    await tx.unsafe(`insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,operation_id,change)
      select $1,'company',$2,$3,n,null,jsonb_build_array(jsonb_build_object('entityType','audit','n',n))
      from generate_series(2,511) n`,[actor,company,epoch]);
  });
  await assert.rejects(sql.unsafe('select sync_v2.read_trusted_feed($1::uuid,$2,$3,$4,$5,$6,1,500)',
    [actor,registration,credentialDigest,'company',company,epoch]),/SYNC_FEED_GROUP_TOO_LARGE/);
  const manifest=await recover(1);
  assert.equal(manifest.next,'511');
  assert.equal(manifest.items,510);
  const part=await recover(1,510,0);
  const content=Buffer.from(part.hex,'hex');
  assert.equal(hash(content),part.sha256);
  assert.equal(JSON.parse(content.toString()).seq,'511');
  await assert.rejects(recover(2),/SYNC_FEED_SPLIT_CURSOR/);
  await assert.rejects(recover(1,null,null,'wrong'),/SYNC_TRUSTED_DEVICE_DENIED/);
  console.log('PASS native PostgreSQL: transaction >500 events, verified integrity fragments, split cursor, credential denial');

  // Retired company must not accept a new voucher without capturing it.
  await sql.unsafe('update public.khata_companies set deleted_at=now() where id=$1',[company]);
  const afterRetire=await head();
  await assert.rejects(posting(randomUUID()),/COMPANY_NOT_ACCESSIBLE|SYNC_COMPANY_CAPTURE_UNAVAILABLE/);
  assert.equal(await head(),afterRetire);
  assert.equal(await count('public.khata_vouchers'),1);
  await assert.rejects(recover(1),/SYNC_COMPANY_RECOVERY_DENIED/);
  console.log('PASS native PostgreSQL: retired scope rejects money write and protected recovery read');
  console.log('PASS: all company-native CI acceptance gates. NOT production migration, real device E2E or release signoff.');
}finally{await sql.end({timeout:5});}
