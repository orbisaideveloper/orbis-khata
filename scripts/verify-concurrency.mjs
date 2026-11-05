import {phase2SafetyCases} from './phase2-safety-cases.mjs';
import {warehouseTransferCases} from './warehouse-transfer-cases.mjs';
// Native PostgreSQL only. Refuse remote/live targets; never substitute PGlite.
import postgres from 'postgres';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup} from './sql-fixture.mjs';
const url=new URL(process.env.KHATA_CONCURRENCY_DATABASE_URL??'http://missing');
assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/khata_concurrency_test','Disposable localhost test database required');
const sql=postgres(url.toString(),{max:24,connection:{application_name:'khata-concurrency',statement_timeout:15000},onnotice:()=>{}});
const owner='11111111-1111-7111-8111-111111111111',company='33333333-3333-4333-8333-333333333333',party='55555555-5555-4555-8555-555555555555';
const command=(id,amount='10000')=>[id,company,party,'receipt','2026-10-03',amount];
const query='select public.khata_post_v1($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$6,\'cash\',\'\',\'Concurrent fixture\',null::uuid)';
async function authorize(tx,sub=owner){await tx.unsafe("select set_config('request.jwt.claims',$1,true),set_config('orbis.khata.gateway_verified','v1',true)",[JSON.stringify({sub,role:'authenticated'})]);await tx.unsafe('set local role authenticated');}
const post=(id,amount)=>sql.begin(async tx=>{await authorize(tx);return tx.unsafe(query,command(id,amount));});
const revision=()=>sql.begin(async tx=>{await authorize(tx);return (await tx.unsafe('select public.khata_report_revision_v1($1::uuid) as value',[company]))[0].value;});
try{
 assert.equal((await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`)[0].n,0,'Test database must be empty');
 // Schema files contain their own BEGIN/COMMIT. Keep every statement on one
 // reserved connection; the pool below must stay multi-connection for the test.
 const bootstrap=await sql.reserve();
 try{
  await setup({exec:text=>bootstrap.unsafe(text),query:async(text,params=[])=>({rows:await bootstrap.unsafe(text,params)})});
  await bootstrap.unsafe(await readFile('supabase/migrations/20261104122849_report_revision_and_party_lookup.sql','utf8'));
  // Match Supabase's auth.uid() schema visibility for authenticated callers.
  // No access to auth.users or financial tables is added.
  await bootstrap.unsafe('grant usage on schema auth to authenticated');
 }finally{
  try{await bootstrap.unsafe('rollback');}finally{bootstrap.release();}
 }
 await sql.unsafe('insert into auth.users values($1)',[owner]);
 await sql.unsafe('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[owner]);
 await sql.unsafe("insert into public.khata_companies(id,owner_id,name) values($1,$2,'Concurrent fixture')",[company,owner]);
 await sql.unsafe("insert into public.khata_parties(id,company_id,name,kind) values($1,$2,'Customer','both')",[party,company]);
 // Hold independent connections together to prove overlap, not just Promise.all.
 const sessions=await Promise.all(Array.from({length:8},()=>sql`select pg_backend_pid() as pid,clock_timestamp() as started,pg_sleep(2),clock_timestamp() as ended`));
 assert.equal(new Set(sessions.map(r=>r[0].pid)).size,8);
 assert(Math.max(...sessions.map(r=>+new Date(r[0].started)))<Math.min(...sessions.map(r=>+new Date(r[0].ended))),'Independent database sessions must overlap');
 console.log('PASS: 8 distinct overlapping PostgreSQL sessions');
 const id=crypto.randomUUID();await Promise.all(Array.from({length:32},()=>post(id)));
 assert.equal((await sql.unsafe('select count(*)::int as n from public.khata_vouchers where id=$1',[id]))[0].n,1);
 const afterReplay=await revision();await post(id);assert.equal(await revision(),afterReplay);
 await assert.rejects(post(id,'20000'),/IDEMPOTENCY_CONFLICT/);assert.equal(await revision(),afterReplay);
 console.log('PASS: 32 concurrent same-ID requests produce one voucher; replay/conflict preserve revision');
 const ids=Array.from({length:32},()=>crypto.randomUUID());await Promise.all(ids.map(id=>post(id)));
 assert.equal((await sql`select count(*)::int as n from public.khata_vouchers`)[0].n,33);
 assert.equal((await sql`select sum(amount_minor)::text as total from public.khata_vouchers`)[0].total,'330000');
 const beforeRollback=await revision();
 await assert.rejects(sql.begin(async tx=>{await authorize(tx);await tx.unsafe(query,command(crypto.randomUUID()));throw new Error('fixture rollback');}),/fixture rollback/);
 assert.equal(await revision(),beforeRollback);
 await assert.rejects(sql.begin(async tx=>{await authorize(tx,'22222222-2222-7222-8222-222222222222');await tx.unsafe(query,command(crypto.randomUUID()));}));
 assert.equal((await sql`select count(*)::int as n from public.khata_vouchers`)[0].n,33);
 console.log('PASS: concurrent distinct saves, rollback and foreign-owner rejection');
 const reader=await sql.reserve();let writer;
 try{
  await reader.unsafe('begin');await authorize(reader);await reader.unsafe('select public.khata_report_revision_v1($1::uuid)',[company]);
  writer=post(crypto.randomUUID());writer.catch(()=>{});
  let blocked=false;const deadline=Date.now()+5000;
  while(Date.now()<deadline){const rows=await sql`select count(*)::int as n from pg_stat_activity where application_name='khata-concurrency' and wait_event_type='Lock'`;if(rows[0].n>0){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,50));}
  assert(blocked,'Writer must wait while report revision read lock is held');
  await reader.unsafe('commit');await writer;
 }finally{await reader.unsafe('rollback');reader.release();}
 assert.equal((await sql`select count(*)::int as n from public.khata_vouchers`)[0].n,34);
 console.log('PASS: report read lock blocks concurrent save, release allows atomic completion');
 await warehouseTransferCases({owner,parallel:true,install:async()=>{const bootstrapGuard=await sql.reserve();try{await bootstrapGuard.unsafe(await readFile('supabase/migrations/20261105040047_warehouse_transfer_stock_guard.sql','utf8'));}finally{bootstrapGuard.release();}},query:async(q,p=[])=>({rows:await sql.unsafe(q,p)}),write:p=>sql.begin(async tx=>{await authorize(tx);return tx.unsafe('select public.khata_inventory_post_v1($1::jsonb)',[tx.json(p)]);})});
 await sql.unsafe(await readFile('supabase/migrations/20261105052854_gateway_request_admission.sql','utf8'));
 const phase2Connection=await sql.reserve();
 try{
  for(const file of ['20261101144338_expense_profile_schedules.sql','20261105053009_safe_retired_company_purge.sql']) await phase2Connection.unsafe(await readFile('supabase/migrations/'+file,'utf8'));
  await phase2SafetyCases({exec:q=>phase2Connection.unsafe(q),query:async(q,p=[])=>({rows:await phase2Connection.unsafe(q,p)})});
 }finally{phase2Connection.release();}
 console.log('PASS: native quota permissions/reset and retired-company retention/atomic dependency isolation');
 let stableQuotaWindow=false;
 for(let attempt=0;attempt<2&&!stableQuotaWindow;attempt++){
  const quotaIdentity=crypto.randomUUID().replace(/^(.{14})./,(_match,prefix)=>prefix+'7');
  const before=(await sql`select date_trunc('minute',clock_timestamp())::text as window`)[0].window;
  await Promise.all(Array.from({length:64},()=>sql.unsafe('select orbis_khata.admit_gateway_request($1::uuid)',[quotaIdentity])));
  const counters=(await sql.unsafe("select minute_used,burst_used,date_trunc('minute',clock_timestamp())::text as window from orbis_khata.gateway_request_windows where identity_id=$1",[quotaIdentity]))[0];
  if(counters.window!==before){continue;}
  assert.equal(counters.minute_used,64);
  assert(counters.burst_used>=1&&counters.burst_used<=64);
  stableQuotaWindow=true;
 }
 assert(stableQuotaWindow,'Admission concurrency must complete within a stable minute window');
 console.log('PASS: shared identity admission serializes 64 concurrent requests without lost updates');
 console.log('FINAL: PASS — scoped native database concurrency fixtures; not production/million-user capacity certification');
}finally{await sql.end({timeout:5});}
