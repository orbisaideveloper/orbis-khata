/**
 * Phase 2B: four ORIGINAL business cron commands against disposable Supabase PG17.
 * Requires KHATA_SYNC_V2_TEST_URL with an exact loopback synthetic database,
 * pg_cron background workers, pg_net, Vault, and Docker host-gateway networking.
 * No live Supabase secrets, database IDs, URLs or production mutations.
 * This test changes only the DISPOSABLE schedules' timing to once per minute;
 * the recorded business SQL commands are taken unchanged from checked-in migrations.
 * Lottery collector's original IST time-window guard remains unchanged.
 */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {isIPv4} from 'node:net';
import {join} from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import postgres from 'postgres';
import {initializeDisposableDatabase} from './sync-v2-disposable-db-fixture.mjs';

const dbUrl=process.env.KHATA_SYNC_V2_TEST_URL??'';
const u=new URL(dbUrl);
assert.equal(u.protocol,'postgres:');
assert.equal(u.hostname,'127.0.0.1');
assert.equal(u.port,'5432');
assert.equal(u.pathname,'/khata_sync_v2_test');
assert.equal(u.search,'');
assert.equal(u.username,'supabase_admin','DISPOSABLE_ADMIN_ONLY');
assert(!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL,
  'PRODUCTION_CREDENTIAL_ENV_NOT_ALLOWED');
// Checked-in SQL migrations contain explicit BEGIN/COMMIT. Postgres.js must
// pin their entire execution to one connection; pooled max:8 rejects these as
// UNSAFE_TRANSACTION. pg_cron background workers use separate server connections.
const sql=postgres(dbUrl,{max:1,connection:{statement_timeout:30000,application_name:'orbis-phase2b-original-cron-disposable'}});
const names=['khata-retired-company-purge','lottery-live-retention','orbis-lottery-collector','orbis-statement-relay-cleanup'];
const files={
  'khata-retired-company-purge':'supabase/migrations/20261028184713_khata_accounting_completion_v3.sql',
  'lottery-live-retention':'supabase/migrations/20261122142011_lottery_live_per_draw.sql',
  'orbis-lottery-collector':'supabase/migrations/20261121145730_lottery_scheduler.sql',
  'orbis-statement-relay-cleanup':'supabase/migrations/20261121182053_customer_statement_relay.sql',
};
const expected={
  'khata-retired-company-purge':'select orbis_khata.purge_retired_companies()',
  'orbis-lottery-collector':'select lottery_private.tick()',
  'orbis-statement-relay-cleanup':'select orbis_khata.statement_relay_cleanup_v1()',
};
const sha=s=>createHash('sha256').update(s).digest('hex');
const deadlineMs=Number(process.env.PHASE2B_CRON_DEADLINE_MS??1050000);
assert(deadlineMs>=60000&&deadlineMs<=1200000,'DISPOSABLE_TIMEOUT_BOUND');
const result={version:1,classification:'ORIGINAL_BUSINESS_CRON_DISPOSABLE_ONLY',git_sha:process.env.GITHUB_SHA??'LOCAL_UNVERIFIED',
  source_hashes:{},cron:[],collector:{observed:false},certification:'NOT_INDEPENDENTLY_REVIEWED'};
const token=randomBytes(32).toString('hex');
let httpHits=0;
const receiver=createServer(async(req,res)=>{
  const authorization=req.headers.authorization??'';
  const got=Buffer.from(sha(authorization));
  const want=Buffer.from(sha(`Bearer ${token}`));
  const valid=timingSafeEqual(got,want);
  if(req.method==='POST'&&req.url==='/collector'&&valid){httpHits++;res.writeHead(200);res.end('{}');}
  else {res.writeHead(403);res.end('forbidden');}
});
const collectorBind=process.env.PHASE2B_COLLECTOR_BIND;
assert(isIPv4(collectorBind??'')&&collectorBind!=='0.0.0.0','DISPOSABLE_COLLECTOR_BRIDGE_ADDRESS_REQUIRED');
const evidenceDir=process.env.PHASE2B_CRON_EVIDENCE_DIR??'quality-reports/phase2b';
let listening=false;
try{
  receiver.listen(18547,collectorBind);await once(receiver,'listening');listening=true;
  const [{v,preload,cronDb,role,admin}]=await sql`select current_user as role,
    (select rolsuper from pg_roles where rolname=current_user) as admin,
    current_setting('server_version_num')::int as v,
    current_setting('shared_preload_libraries') as preload,
    current_setting('cron.database_name',true) as "cronDb"`;
  assert.equal(role,'supabase_admin','DISPOSABLE_ADMIN_REQUIRED');
  assert.equal(admin,true,'DISPOSABLE_SUPERUSER_REQUIRED');
  assert(v>=170000&&v<180000,'POSTGRES_17_REQUIRED');
  assert.match(preload,/\bpg_cron\b/,'REAL_CRON_WORKER_REQUIRED');
  assert.match(preload,/\bpgsodium\b/,'VAULT_ROOT_KEY_PRELOAD_REQUIRED');
  assert.match(preload,/\bsupabase_vault\b/,'VAULT_EXTENSION_PRELOAD_REQUIRED');
  const [{configFile,vaultKeyScript}]=await sql`select current_setting('config_file') as "configFile",
    current_setting('vault.getkey_script',true) as "vaultKeyScript"`;
  assert.equal(configFile,'/etc/postgresql/postgresql.conf','SUPABASE_IMAGE_CONFIG_REQUIRED');
  assert(vaultKeyScript,'VAULT_GETKEY_SCRIPT_CONFIGURATION_REQUIRED');
  assert.equal(cronDb,'khata_sync_v2_test','CRON_DATABASE_MUST_MATCH_SYNTHETIC_DB');
  const [{netDb}]=await sql`select current_setting('pg_net.database_name',true) as "netDb"`;
  assert.equal(netDb,'khata_sync_v2_test','NET_DATABASE_MUST_MATCH_SYNTHETIC_DB');
  const available=await sql`select name from pg_available_extensions where name in ('pg_cron','pg_net','supabase_vault')`;
  for(const ext of ['pg_cron','pg_net','supabase_vault'])
    assert(available.some(x=>x.name===ext),`MISSING_SUPABASE_EXTENSION:${ext}`);
  await sql.unsafe('create schema if not exists extensions');
  await sql.unsafe('create extension if not exists pg_cron with schema pg_catalog');
  await sql.unsafe('create extension if not exists pg_net with schema extensions');
  await sql.unsafe('create extension if not exists supabase_vault');
  // This replays the already checked-in migration chain and review-only adapter
  // in an EMPTY test database. It never applies the candidate to the live project.
  await initializeDisposableDatabase(sql,{supabaseRolesAlreadyInitialized:true});
  for(const file of ['20261122112424_lottery_live_cache.sql','20261122142011_lottery_live_per_draw.sql']) {
    await sql.unsafe(await readFile(`supabase/migrations/${file}`,'utf8'));
  }
  for(const [name,file] of Object.entries(files)) result.source_hashes[name]=sha(await readFile(file,'utf8'));
  const draw=await readFile(files['lottery-live-retention'],'utf8');
  const retention=draw.match(/cron\.schedule\('lottery-live-retention','17 0 \* \* \*',\$job\$([\s\S]*?)\$job\$\)/)?.[1];
  assert(retention,'EXACT_RETENTION_COMMAND_NOT_FOUND');
  expected['lottery-live-retention']=retention;
  for(const [name,file] of Object.entries(files)) {
    const source=await readFile(file,'utf8');
    assert(source.includes(`cron.schedule('${name}'`),`ORIGINAL_SCHEDULE_MISSING:${name}`);
    assert(source.includes(expected[name]),`SCHEDULE_COMMAND_SOURCE_MISMATCH:${name}`);
  }
  const existing=await sql`select jobname,command from cron.job where jobname = any(${names})`;
  // The collector is intentionally not activated by the production migration.
  // Install EXACT command in this disposable database only.
  if(!existing.some(x=>x.jobname==='orbis-lottery-collector'))
    await sql`select cron.schedule('orbis-lottery-collector','30 seconds',${expected['orbis-lottery-collector']})`;
  const revision=await sql`select jobname,jobid,command from cron.job where jobname = any(${names})`;
  assert.equal(revision.length,4,'ALL_FOUR_REAL_SCHEDULES_MUST_EXIST');
  for (const job of revision) {
    assert.equal(job.command,expected[job.jobname],`ORIGINAL_COMMAND_MISMATCH:${job.jobname}`);
    await sql`select cron.alter_job(${job.jobid},active:=false)`;
  }
  // Use synthetic actors/tenants; no customer data. Preserve unrelated finance.
  const owner=randomUUID(),safe=randomUUID(),old=randomUUID(),linkOld=randomUUID(),linkNew=randomUUID();
  const other=randomUUID(), foreignCompany=randomUUID(), party=randomUUID(), foreignParty=randomUUID();
  await sql`insert into auth.users(id) values(${owner}),(${other})`;
  await sql`insert into orbis_khata.ledger_owners(id,legacy) values(${owner},false),(${other},false)`;
  await sql`insert into public.khata_companies(id,owner_id,name) values(${foreignCompany},${other},'Independent Synthetic Tenant')`;
  await sql`insert into public.khata_companies(id,owner_id,name) values(${safe},${owner},'Safe Synthetic Tenant'),
    (${old},${owner},'Expired Synthetic Tenant')`;
  await sql`update public.khata_companies set deleted_at=now()-interval '45 days',
    purge_after=now()-interval '1 day' where id=${old}`;
  const today=(await sql`select (now() at time zone 'Asia/Kolkata')::date::text as d`)[0].d;
  await sql`insert into lottery_private.live_draw_cache(draw_date,slot,payload) values
    ((${today})::date-45,'1pm','{"old":true}'),((${today})::date,'6pm','{"new":true}')`;
  await sql`update lottery_private.live_cache set payload=${sql.json({date:'2000-01-01',old:true})}
    where singleton=true`;
  await sql`insert into orbis_khata.statement_links(id,owner_identity,recipient_display,scope)
    values(${linkOld},${owner},'ORB-U-ABCDEFGH',${sql.json({module:'khata',company:safe,party:randomUUID()})}),
      (${linkNew},${owner},'ORB-U-BCDEFGHJ',${sql.json({module:'khata',company:safe,party:randomUUID()})})`;
  await sql`insert into orbis_khata.statement_mailbox(link_id,revision,base,patch,expires_at)
    values(${linkOld},1,0,'{}',now()-interval '1 day'),(${linkNew},1,0,'{}',now()+interval '3 days')`;
  // Vault is a real extension, not a fake table. No secret bytes go to logs.
  await sql`select vault.create_secret(${token},'orbis_lottery_worker','disposable phase2b collector')`;
  // Functional cryptography check: the real Vault decrypts the newly created
  // secret to the original value. Compare only hashes in Node, no key/token logs.
  const [vaultProbe]=await sql`select encode(sha256(convert_to(decrypted_secret,'UTF8')),'hex') as digest
    from vault.decrypted_secrets where name='orbis_lottery_worker'`;
  assert(vaultProbe && vaultProbe.digest===sha(token),'VAULT_REAL_ENCRYPT_DECRYPT_ROUNDTRIP_FAILED');
  const [{workerHash}]=await sql`select encode(sha256(convert_to(${token},'UTF8')),'hex') as "workerHash"`;
  await sql`update lottery_private.provider_gate set collector_url='http://host.docker.internal:18547/collector',worker_hash=${workerHash} where singleton`;
  await sql`insert into public.khata_parties(id,company_id,name,kind)
    values(${party},${safe},'Protected party','both'),(${foreignParty},${foreignCompany},'Independent party','both')`;
  const post=(actor,company,customer,amount)=>sql.begin(async tx=>{
    await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:actor,role:'authenticated'})},true),
      set_config('orbis.khata.gateway_verified','v1',true)`;
    await tx`set local role authenticated`;
    await tx`select public.khata_post_v1(${randomUUID()}::uuid,${company}::uuid,${customer}::uuid,
      'receipt',${today}::date,${amount},'cash','','Synthetic cron financial sentinel',null)`;
  });
  await post(owner,safe,party,'125');
  await post(other,foreignCompany,foreignParty,'250');
  await assert.rejects(post(owner,foreignCompany,foreignParty,'1'),/COMPANY_NOT_ACCESSIBLE|COMPANY_DENIED/);
  const sentinel=async()=>Array.from(await sql`select company_id,id,amount_minor::text as amount
    from public.khata_vouchers where company_id in (${safe},${foreignCompany}) order by company_id,id`);
  const before=await sentinel();
  assert.deepEqual(before.map(row=>row.amount).sort(),['125','250'],'NONZERO_TENANT_SENTINELS_REQUIRED');
  await assert.rejects(sql.begin(async tx=>{
    await tx`select orbis_khata.purge_retired_companies()`;
    assert.equal((await tx`select count(*)::int as n from public.khata_companies where id=${old}`)[0].n,0);
    throw new Error('DISPOSABLE_PURGE_ROLLBACK');
  }),/DISPOSABLE_PURGE_ROLLBACK/);
  assert.equal((await sql`select count(*)::int as n from public.khata_companies where id=${old}`)[0].n,1);
  assert.deepEqual(await sentinel(),before,'ROLLBACK_FINANCIAL_SENTINEL_CHANGED');
  result.rollback_verified=true;
  // Change timing only. The same stored business command runs in the worker.
  const [{since}]=await sql`select clock_timestamp() as since`;
  for(const job of revision) await sql`select cron.alter_job(${job.jobid},schedule:='* * * * *',active:=true)`;
  const until=Date.now()+deadlineMs;
  let history=[];
  while(Date.now()<until){
    await sleep(3000);
    history=await sql`select j.jobid,j.jobname,d.runid,d.status,d.return_message,d.start_time
      from cron.job j join cron.job_run_details d on j.jobid=d.jobid
      where j.jobname=any(${names}) and d.start_time>=${since} order by d.start_time`;
    if(names.every(name=>history.some(x=>x.jobname===name&&x.status==='succeeded'))&&httpHits>0) break;
  }
  for(const name of names){
    const runs=history.filter(r=>r.jobname===name&&r.status==='succeeded');
    assert(runs.length>0,`NO_ACTUAL_ORIGINAL_SCHEDULER_DISPATCH:${name}`);
    const job=revision.find(r=>r.jobname===name);
    result.cron.push({name,job_id:job.jobid,run_id:runs.at(-1).runid,status:'succeeded',
      dispatch_kind:'original-business-schedule',command_sha256:sha(job.command),source_command_matches:true,
      source_file:files[name]});
  }
  assert(httpHits>0,'ORIGINAL_COLLECTOR_NO_HTTP_DELIVERY_IN_IST_WINDOW');
  result.collector={observed:true,authenticated:true,requests:httpHits,secret_logged:false};
  assert.equal((await sql`select count(*)::int as n from public.khata_companies where id=${old}`)[0].n,0,'EXPIRED_COMPANY_NOT_PURGED');
  assert.equal((await sql`select count(*)::int as n from public.khata_companies where id=${safe}`)[0].n,1,'ACTIVE_COMPANY_PURGED');
  assert.equal((await sql`select count(*)::int as n from lottery_private.live_draw_cache where draw_date<(${today})::date-28`)[0].n,0);
  assert.equal((await sql`select count(*)::int as n from lottery_private.live_draw_cache where draw_date=(${today})::date`)[0].n,1);
  assert.equal((await sql`select payload is null as cleared from lottery_private.live_cache where singleton`)[0].cleared,true,'OLD_LIVE_METADATA_NOT_CLEARED');
  assert.equal((await sql`select count(*)::int as n from orbis_khata.statement_mailbox where link_id=${linkOld}`)[0].n,0);
  assert.equal((await sql`select count(*)::int as n from orbis_khata.statement_mailbox where link_id=${linkNew}`)[0].n,1);
  assert.deepEqual(await sentinel(),before,'FINANCIAL_SENTINEL_CHANGED');
  result.financial_sentinel_unchanged=true;
  result.company_scope_verified=true;
  result.status='LOCAL_DISPOSABLE_RUNTIME_PASSED_NO_INDEPENDENT_REVIEW';
  console.log('FOUR_ORIGINAL_CRON_DISPATCHES '+JSON.stringify({names,collector_requests:httpHits,financial_sentinel_unchanged:true}));
} finally {
  try {for(const name of names) await sql`select cron.unschedule(${name})`;} catch {}
  try {
    await mkdir(evidenceDir,{recursive:true});
    await writeFile(join(evidenceDir,'business-cron.json'),JSON.stringify(result,null,2));
  } finally {
    await sql.end({timeout:5});
    if(listening) await new Promise(resolve=>receiver.close(resolve));
  }
}
