/**
 * Native PG17 catalog and transactional smoke acceptance for the EXACT 2026-11-25
 * frozen 26 legacy triggers and 26 function names. Uses disposable CI DB ONLY.
 * A catalog match is NOT sufficient to certify any per-writer financial gate.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {setup} from './sql-fixture.mjs';
import {buildRegister} from './verify-sync-v2-phase2b-evidence.mjs';
import {verifyEdgeWriters} from './sync-v2-edge-writer-fixture.mjs';
import {verifyTriggerBehavior} from './sync-v2-trigger-behavior-fixture.mjs';

const url=new URL(process.env.KHATA_SYNC_V2_TEST_URL??'http://invalid');
assert.equal(url.protocol,'postgres:','LOCAL_DISPOSABLE_PG_ONLY');
assert.equal(url.hostname,'127.0.0.1','LOCAL_DISPOSABLE_PG_ONLY');
assert.equal(url.port,'5432','LOCAL_DISPOSABLE_PG_ONLY');
assert.equal(url.pathname,'/khata_sync_v2_test','LOCAL_DISPOSABLE_PG_ONLY');
assert.equal(url.search,'','LOCAL_DISPOSABLE_PG_ONLY');
const sql=postgres(url.toString(),{max:4,connection:{application_name:'khata-phase2b-catalog',statement_timeout:30000}});
const migrations=[
 '20261031075245_lottery_row_storage.sql',
 '20261031081126_continuous_production.sql',
 '20261101144338_expense_profile_schedules.sql',
 '20261101191307_lottery_party_sharing.sql',
 '20261102075520_master_party_link_metadata.sql',
 '20261104122849_report_revision_and_party_lookup.sql',
 '20261105040047_warehouse_transfer_stock_guard.sql',
 '20261105084705_gateway_request_admission.sql',
 '20261105101338_safe_retired_company_purge.sql',
 '20261115120000_drive_account_recovery.sql',
 '20261121145334_lottery_draw_cache.sql',
 '20261121182053_customer_statement_relay.sql',
 '20261124173000_private_lottery_sync_payment.sql',
 '20261125100000_lottery_immutable_feed_recovery.sql',
 '20261125103000_sync_device_pairing.sql',
];
const cov=await readFile('src/sync-v2/phase2a-coverage.ts','utf8');
const closure=await readFile('src/sync-v2/phase2b-closure-gates.ts','utf8');
const register=buildRegister(cov,closure);
assert.equal(register.groups.trigger.length,26);
assert.equal(register.groups.rpc.length+register.groups['internal-rpc'].length,26);
try{
 const [{version}]=await sql`select current_setting('server_version_num')::int as version`;
 assert(version>=170000&&version<180000,'PG17_REQUIRED');
 const schedulerExtensions=await sql`select name,installed_version from pg_available_extensions
   where name in ('pg_cron','pg_net','supabase_vault') order by name`;
 console.log('NATIVE_ENV '+JSON.stringify({version,schedulerExtensions}));
 const e=await sql.unsafe("select count(*)::int n from information_schema.tables where table_schema='public'");
 assert.equal(e[0].n,0,'DISPOSABLE_EMPTY_DB_REQUIRED');
 const init=await sql.reserve();
 try {
   await setup({exec:s=>init.unsafe(s),query:async(s,args=[])=>({rows:await init.unsafe(s,args)})});
   for(const file of migrations)await init.unsafe(await readFile('supabase/migrations/'+file,'utf8'));
 }finally{init.release()}
 const rows=await sql.unsafe(`select n.nspname as schema,c.relname as tab,t.tgname as name,
  t.tgenabled as enabled,p.proname as function_name,
  pg_get_triggerdef(t.oid) as definition
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid where not t.tgisinternal`);
 const byId=new Map(rows.map(x=>[`${x.schema}.${x.tab}.${x.name}`,x]));
 for(const name of register.groups.trigger){
   const found=byId.get(name);assert(found,`MISSING_NATIVE_PG_TRIGGER:${name}`);
   assert(['O','A'].includes(found.enabled),`DISABLED_NATIVE_PG_TRIGGER:${name}`);
   assert(found.function_name&&/^CREATE TRIGGER/i.test(found.definition),`INVALID_TRIGGER_DEF:${name}`);
   console.log(`PASS TRIGGER_CATALOG_PRECHECK ${name}`);
 }
 console.log('PASS native PG17: exact 26/26 live-listed trigger names installed and enabled; bound functions present');
 const procs=await sql.unsafe(`select n.nspname as schema,p.proname as name,p.oid,
   has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_executable
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','orbis_khata')`);
 for(const gate of [...register.groups.rpc,...register.groups['internal-rpc']]){
   const [schema,name]=gate.split('.');const matches=procs.filter(p=>p.schema===schema&&p.name===name);
   assert(matches.length,`MISSING_NATIVE_PG_FUNCTION:${gate}`);
   assert(matches.every(p=>!p.anonymous_executable),`ANON_EXECUTE_GRANT_${gate}`);
   console.log(`PASS FUNCTION_ACL_PRECHECK ${gate}`);
 }
 console.log('PASS native PG17: exact 26/26 listed function names exist and anon has no direct EXECUTE');
 const owner=randomUUID(), company=randomUUID(),party=randomUUID();
 await sql.unsafe('insert into auth.users(id) values($1)',[owner]);
 await sql.unsafe('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[owner]);
 await sql.unsafe('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3)',[company,'Phase2B synthetic trigger audit',owner]);
 const rev=async()=>Number((await sql.unsafe('select revision from public.khata_report_revisions where company_id=$1',[company]))[0].revision);
 const before=await rev();
 await sql.unsafe('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',[party,company,'Synthetic company party','both']);
 assert.equal(await rev(),before+1,'TRIGGER_REVISION_MUST_INCREMENT_ON_COMMIT');
 await assert.rejects(sql.begin(async tx=>{
   await tx.unsafe('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',[randomUUID(),company,'Should be rolled back','both']);
   throw Error('EXPECTED_ROLLBACK_PROBE');
 }),/EXPECTED_ROLLBACK_PROBE/);
 assert.equal(await rev(),before+1,'TRIGGER_REVISION_MUST_ROLLBACK');
 assert.equal((await sql.unsafe('select count(*)::int n from public.khata_parties where company_id=$1',[company]))[0].n,1);
 console.log('PASS native PG17: committed party mutation increments revision exactly once, transaction abort restores head and rows');
 await verifyTriggerBehavior(sql);
 await verifyEdgeWriters(sql);
 if(globalThis.Deno?.env?.get('PHASE2B_NATIVE_DENO_HTTP')==='enabled'){
   assert(globalThis.__phase2bNativeDenoVerified===true,'DENO_LISTENER_CALLBACK_NOT_VERIFIED');
   const [acl]=await sql`select has_table_privilege('anon','orbis_khata.drive_account_recovery','INSERT') as a,
     has_table_privilege('authenticated','orbis_khata.drive_account_recovery','SELECT') as b,
     has_table_privilege('anon','public.khata_companies','INSERT') as c`;
   assert(!acl.a&&!acl.b&&!acl.c,'DIRECT_EDGE_SQL_ROLE_EXPOSURE');
   console.log('EXECUTED_CASE '+JSON.stringify({id:'gate:direct-edge-ingress',outcome:'PASS',observed:'Native Deno HTTP listener with original VM-transpiled Edge handler, v1 version fence, 3 direct writers, synthetic Central verifier, PG17 role ACL, wrong-owner denial, retry and rollback; live deployment not tested'}));
 }
 console.log('BOUNDARY: native per-case results only; pg_cron, hosted Edge, full server acceptance and independent review are not certified');
}finally{await sql.end({timeout:5})}
