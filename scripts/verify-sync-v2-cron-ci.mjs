/**
 * Actual pg_cron dispatcher smoke on a fresh synthetic Supabase PG17 service.
 * Intentionally does NOT claim the four original business schedules have been certified.
 * Prerequisites: four future business cases require migration-role and full schema replay.
 */
import assert from 'node:assert/strict';
import postgres from 'postgres';

const raw = process.env.KHATA_SYNC_V2_TEST_URL ?? '';
const url = new URL(raw);
assert.equal(url.protocol, 'postgres:', 'LOCAL_TEST_ONLY');
assert.equal(url.hostname, '127.0.0.1', 'LOCAL_TEST_ONLY');
assert.equal(url.port, '5432', 'LOCAL_TEST_ONLY');
assert.equal(url.pathname, '/postgres', 'DISPOSABLE_CRON_DATABASE_ONLY');
assert.equal(url.search, '', 'LOCAL_TEST_ONLY');
const sql = postgres(raw, {max: 2, connection: {application_name:'phase2b-ci-cron-dispatch',statement_timeout:20000}});
const names = ['khata-retired-company-purge','lottery-live-retention','orbis-lottery-collector','orbis-statement-relay-cleanup'];
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
try {
  const version=await sql`show server_version`;
  assert.match(version[0].server_version,/^17\./,'PG17_REQUIRED');
  const cfg=await sql`select current_setting('cron.database_name',true) as cron_db, current_setting('shared_preload_libraries') as preload`;
  assert.equal(cfg[0].cron_db,'postgres','CRON_WORKER_DATABASE_MISMATCH');
  assert.match(cfg[0].preload,/pg_cron/,'PG_CRON_WORKER_NOT_PRELOADED');
  const available=await sql`select name from pg_available_extensions where name in ('pg_cron','pg_net','supabase_vault')`;
  const ext=new Set(available.map(row=>row.name));
  assert(ext.has('pg_cron'), 'MISSING_PG_CRON_IMAGE');
  assert(ext.has('pg_net'), 'MISSING_PG_NET_IMAGE');
  // Supabase Vault extension typically has SQL extension name 'supabase_vault'.
  assert(ext.has('supabase_vault'), 'MISSING_SUPABASE_VAULT_IMAGE');
  await sql.unsafe('create extension if not exists pg_cron with schema pg_catalog');
  await sql.unsafe('create extension if not exists pg_net');
  await sql.unsafe('create extension if not exists supabase_vault');
  const installed=await sql`select extname from pg_extension where extname in ('pg_cron','pg_net','supabase_vault')`;
  assert.equal(installed.length,3,'EXTENSIONS_NOT_INSTALLED');
  // Actual worker must be scheduled, not a direct manual SQL call.
  await sql.unsafe(`create schema if not exists phase2b_ci;
    create table phase2b_ci.dispatch_receipts(name text primary key, fired_at timestamptz not null, runs integer not null default 1);
    create or replace function phase2b_ci.mark_dispatch(p_name text) returns void
    language plpgsql as $$begin
      insert into phase2b_ci.dispatch_receipts(name,fired_at) values(p_name,clock_timestamp())
      on conflict(name) do update set runs=phase2b_ci.dispatch_receipts.runs+1,fired_at=clock_timestamp();
    end$$;`);
  const before=await sql`select clock_timestamp() as t`;
  for (const name of names) {
    const job = `phase2b-ci-${name}`;
    // A 1-minute synthetic trigger verifies actual worker clock dispatch.
    // Original schedules and original business function bodies are NOT replaced or exercised.
    await sql`select cron.schedule(${job}, '* * * * *', ${`select phase2b_ci.mark_dispatch('${name}')`})`;
  }
  let receipts=[];
  for (let i=0;i<16;i++) {
    await sleep(5000);
    receipts=await sql`select name,fired_at,runs from phase2b_ci.dispatch_receipts`;
    if (receipts.length===4) break;
  }
  assert.equal(receipts.length,4,`ACTUAL_CRON_CLOCK_NOT_OBSERVED: ${receipts.map(r=>r.name).join(',')}`);
  assert(receipts.every(r=>r.fired_at>=before[0].t && r.runs>=1),'INVALID_DISPATCH_RECEIPT');
  const history=await sql`select jobname,status from cron.job_run_details d join cron.job j using(jobid) where j.jobname like 'phase2b-ci-%' order by d.start_time`;
  assert.equal(new Set(history.filter(x=>x.status==='succeeded').map(x=>x.jobname)).size,4,'MISSING_SUCCESSFUL_CRON_JOB_HISTORY');
  console.log(JSON.stringify({status:'PASS_DISPOSABLE_CRON_TRANSPORT', names, history:history.map(x=>({name:x.jobname,status:x.status})), boundary:'NO_ORIGINAL_SCHEDULE_EXECUTION'},null,2));
} finally {
  for (const name of names) {
    try { await sql`select cron.unschedule(${`phase2b-ci-${name}`})`; } catch {}
  }
  await sql.end({timeout:5});
}
