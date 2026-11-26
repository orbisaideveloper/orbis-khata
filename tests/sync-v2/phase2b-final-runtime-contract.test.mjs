import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=p=>readFile(p,'utf8');
const workflow=await load('.github/workflows/sync-v2-phase2b-final-gates.yml');
const launcher=await load('scripts/run-phase2b-business-cron-docker.sh');
const cron=await load('scripts/verify-sync-v2-business-cron-runtime.mjs');
const mixed=await load('scripts/verify-sync-v2-mixed-26-runtime.mjs');
const fixtures=await load('scripts/sync-v2-trigger-behavior-fixture.mjs');
const disposable=await load('scripts/sync-v2-disposable-db-fixture.mjs');
const count=(txt,pattern)=>(txt.match(pattern)||[]).length;

test('CI runs only on isolated branch push/manual and never deploys or reads production secrets',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/ci\/phase2b-final-five-20261126/);
 assert.doesNotMatch(workflow,/\$\{\{\s*secrets\.|^\s*(?:SUPABASE_SERVICE_ROLE_KEY:|deploy:|force: true)|git push|render\.com/im);
});
test('business cron invokes ORIGINAL database functions rather than synthetic mark_dispatch',()=>{
 for(const v of ['khata-retired-company-purge','lottery-live-retention','orbis-lottery-collector','orbis-statement-relay-cleanup'])assert(cron.includes(v));
 assert.doesNotMatch(cron,/mark_dispatch|phase2b_ci\.dispatch_receipts/);
 assert.match(cron,/cron\.job_run_details/);
});
test('cron requires exact business-command identity and durable run receipts',()=>{
 assert.match(cron,/ORIGINAL_COMMAND_MISMATCH/);
 assert.match(cron,/NO_ACTUAL_ORIGINAL_SCHEDULER_DISPATCH/);
 assert.match(cron,/source_command_matches:true/);
});
test('cron rejects non-disposable database targets and production keys',()=>{
 assert.match(cron,/127\.0\.0\.1/);
 assert.match(cron,/khata_sync_v2_test/);
 assert.match(cron,/PRODUCTION_CREDENTIAL_ENV_NOT_ALLOWED/);
});
test('pg_net HTTP callback uses Vault and never prints token',()=>{
 assert.match(cron,/vault\.create_secret/);
 assert.match(cron,/httpHits>0/);
 assert.match(cron,/timingSafeEqual/);
 assert.doesNotMatch(cron,/console\.log\([^\n]*token/);
});
test('runtime verifies safe retention, other tenant and monetary invariants',()=>{
 assert.match(cron,/EXPIRED_COMPANY_NOT_PURGED/);
 assert.match(cron,/ACTIVE_COMPANY_PURGED/);
 assert.match(cron,/FINANCIAL_SENTINEL_CHANGED/);
 assert.match(cron,/OLD_LIVE_METADATA_NOT_CLEARED/);
});
test('26 expected trigger IDs are named exactly once',()=>{
 const list=mixed.slice(mixed.indexOf('const expected=['),mixed.indexOf('].map(x=>',mixed.indexOf('const expected=[')));
 assert.equal(count(list,/^(?:'public\.|'orbis_khata\.)/gm),26);
 assert.match(mixed,/ALL_26_SAME_DATASET_REQUIRED/);
 assert.match(mixed,/ALL_26_TRIGGER_BEHAVIORS_NOT_EXECUTED/);
});
test('original trigger behavior fixture remains backwards compatible and takes callback only after full matrix',()=>{
 assert.match(fixtures,/verifyTriggerBehavior\(sql, onCombinedDatasetReady = undefined\)/);
 assert(fixtures.indexOf('await verifyLotteryStore')<fixtures.indexOf('if (onCombinedDatasetReady)'));
 assert.match(fixtures,/onCombinedDatasetReady\(\{sql,session,owner,other,company,party,actor,gate\}\)/);
});
test('mixed runner checks exact two writes, replay, rollback, foreign owner and feed',()=>{
 for(const v of ['MIXED_WRITERS_MUST_ADD_EXACTLY_TWO_VOUCHERS','MIXED_CAPTURE_MUST_ADD_EXACTLY_TWO_EVENTS','EXACT_CASH_MINOR_UNIT_DELTA','REPLAY_CHANGED_LEDGER_FEED_OR_REVISION','ROLLBACK_CHANGED_LEDGER_FEED_OR_REVISION','FOREIGN_OWNER_CHANGED_LEDGER'])assert(mixed.includes(v));
});

test('mixed writers enroll exactly the same actor/company after legacy 26-trigger coverage',()=>{
 const complete=mixed.indexOf('ALL_26_SAME_DATASET_REQUIRED');
 const enroll=mixed.indexOf('insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle)');
 const writes=mixed.indexOf('await Promise.all([session(owner,tx=>legacy(tx)),session(owner,tx=>newV2(tx))])');
 assert(complete>=0&&enroll>complete&&writes>enroll,'SCOPE_ENROLLMENT_MUST_PRECEDE_CONCURRENT_WRITES');
 assert.match(mixed,/values\(\$\{actor\},'company',\$\{company\},\$\{epoch\},'active'\)/);
 assert.match(mixed,/CAPTURE_MUST_USE_VERIFIED_OWNER_IDENTITY/);
 assert.match(mixed,/EXACT_TWO_VOUCHER_TO_FEED_LINKS/);
 assert.match(mixed,/WRONG_SCOPE_OR_EPOCH_IN_MIXED_CAPTURE/);
 assert.match(mixed,/GAP_OR_DUPLICATE_IN_ALL_COMMITTED_FEED_EVENTS/);
});

test('cron CI waits for final TCP PostgreSQL and records safe Docker exit diagnostics',()=>{
 assert.match(launcher,/listen_addresses='\*'/);
 assert.match(launcher,/postgres -D \/etc\/postgresql -c listen_addresses=/);
 assert.doesNotMatch(launcher,/\s-c shared_preload_libraries=/);
 assert.match(launcher,/node --input-type=module -e/);
 assert.match(launcher,/export KHATA_SYNC_V2_TEST_URL="postgres:\/\/supabase_admin:\$\{POSTGRES_PASSWORD\}@127\.0\.0\.1:5432\/khata_sync_v2_test"/);
 assert.match(launcher,/FINAL_HOST_TCP_DATABASE_AND_EXTENSION_PRELOAD_READY/);
 assert.match(launcher,/DISPOSABLE_POSTGRES_EXITED_DURING_INIT/);
 assert.match(launcher,/container-state\.txt/);
 assert.doesNotMatch(launcher,/if docker exec orbis-phase2b-disposable pg_isready -U postgres/);
 assert.match(workflow,/bash scripts\/run-phase2b-business-cron-docker\.sh/);
});

test('mixed v2 capture allows interleaved legitimate events but denies feed gaps, duplicates and wrong vouchers',()=>{
 assert.match(mixed,/GAP_OR_DUPLICATE_IN_ALL_COMMITTED_FEED_EVENTS/);
 assert.match(mixed,/SCOPE_HEAD_AND_COMMITTED_FEED_DISAGREE/);
 assert.match(mixed,/MIXED_VOUCHER_LINEAGE_MISSING_OR_DUPLICATED/);
 assert.match(mixed,/TWO_VOUCHER_FEED_LINKS_NOT_ORDERED/);
 assert.doesNotMatch(mixed,/NONCONTIGUOUS_FIRST_TWO_CAPTURE_SEQUENCES/);
});

test('Cron privileges are confined to disposable Supabase superuser, not production',()=>{
 assert.match(cron,/DISPOSABLE_ADMIN_REQUIRED/);
 assert.match(cron,/DISPOSABLE_SUPERUSER_REQUIRED/);
 assert.match(cron,/supabaseRolesAlreadyInitialized:true/);
 assert.match(cron,/PRODUCTION_CREDENTIAL_ENV_NOT_ALLOWED/);
 assert.match(launcher,/current_user as role/);
 assert.match(launcher,/supabase_admin/);
 assert.doesNotMatch(launcher,/GRANT CREATE ON DATABASE|ALTER ROLE postgres SUPERUSER/i);
});

test('Supabase-aware bootstrap does not re-create existing global roles',()=>{
 assert.match(disposable,/SUPABASE_BOOTSTRAP_ROLE_MISSING/);
 assert.match(disposable,/SUPABASE_DISPOSABLE_ADMIN_PRIVILEGES_REQUIRED/);
 assert.match(disposable,/if\(supabaseRolesAlreadyInitialized\)/);
 assert.match(disposable,/create table if not exists auth\.users/);
 assert.match(disposable,/to_regprocedure\('auth\.uid\(\)'\)/);
 assert.match(disposable,/await setup\(\{/);
});


test('Cron SQL migration transaction BEGIN/COMMIT never enters a multi-connection pool',()=>{
 assert.match(cron,/postgres\(dbUrl,\{max:1,connection:/);
 assert.doesNotMatch(cron,/postgres\(dbUrl,\{max:[2-9]/);
 assert.match(cron,/initializeDisposableDatabase\(sql,\{supabaseRolesAlreadyInitialized:true\}\)/);
 assert.match(cron,/await sql\.unsafe\(await readFile/);
 // Do not weaken the independent mixed-26 concurrency test's database pool.
 assert.match(disposable,/postgres\(url\.href, \{ max: 8,/);
});


test('Supabase Vault readiness checks real server rather than guessed root-key paths',()=>{
 assert(!launcher.includes("-c shared_preload_libraries="));
 assert(launcher.includes("postgres -D /etc/postgresql -c listen_addresses="));
 assert(launcher.includes("supabase_vault"));
 assert(launcher.includes("vault.getkey_script"));
 assert(launcher.includes("DISPOSABLE_PG_PREFLIGHT_FAILED"));
 assert(launcher.includes("DISPOSABLE_PG_PREFLIGHT_SQL_ERROR"));
 assert(launcher.includes("FINAL_HOST_TCP_DATABASE_AND_EXTENSION_PRELOAD_READY"));
 assert(!launcher.includes("docker exec orbis-phase2b-disposable test -s /etc/postgresql-custom/pgsodium_root.key"));
 assert(!launcher.includes("pgsodium.getkey_script"));
 assert(cron.includes("VAULT_ROOT_KEY_PRELOAD_REQUIRED"));
 assert(cron.includes("VAULT_EXTENSION_PRELOAD_REQUIRED"));
 assert(cron.includes("SUPABASE_IMAGE_CONFIG_REQUIRED"));
 assert(cron.includes("VAULT_GETKEY_SCRIPT_CONFIGURATION_REQUIRED"));
 assert(!cron.includes("VAULT_ROOT_KEY_LOADER_REQUIRED"));
 assert(cron.includes("vault.create_secret"));
 assert(cron.includes("VAULT_REAL_ENCRYPT_DECRYPT_ROUNDTRIP_FAILED"));
 assert(cron.includes("vault.decrypted_secrets"));
 assert(!launcher.includes("cat /etc/postgresql-custom/pgsodium_root.key"));
});


test('Supabase original configuration is never replaced with an incomplete preload list',()=>{
 assert.match(launcher,/postgres -D \/etc\/postgresql -c listen_addresses=/);
 assert.doesNotMatch(launcher,/\s-c shared_preload_libraries=/);
 assert.match(launcher,/MISSING_PRELOAD_/);
 assert.match(launcher,/WRONG_IMAGE_CONFIG/);
 assert.match(launcher,/VAULT_GETKEY_SCRIPT_NOT_CONFIGURED/);
 assert.match(launcher,/pg_net.database_name=khata_sync_v2_test/);
 assert.match(launcher,/WRONG_PG_NET_DATABASE/);
 assert.match(cron,/NET_DATABASE_MUST_MATCH_SYNTHETIC_DB/);
 assert.match(cron,/VAULT_EXTENSION_PRELOAD_REQUIRED/);
 assert.match(cron,/VAULT_REAL_ENCRYPT_DECRYPT_ROUNDTRIP_FAILED/);
});

test('shared runner uses an isolated bridge, a loopback database and exact host prerequisite failures',()=>{
 assert.match(launcher,/LOCAL_UNIX_DOCKER_SOCKET_REQUIRED/);
 assert.match(launcher,/DOCKER_CLI_NOT_FOUND/);
 assert.match(launcher,/127\.0\.0\.1:5432:5432/);
 assert.match(launcher,/network create --driver bridge/);
 assert.match(launcher,/rm -fv "\$container"/);
 assert.match(cron,/receiver\.listen\(18547,collectorBind\)/);
});

test('native business fixture requires protected nonzero finance and rollback before real dispatch',()=>{
 assert.match(cron,/NONZERO_TENANT_SENTINELS_REQUIRED/);
 assert.match(cron,/ROLLBACK_FINANCIAL_SENTINEL_CHANGED/);
 assert.match(cron,/FINANCIAL_SENTINEL_CHANGED/);
 assert.match(cron,/d\.start_time>=\$\{since\}/);
 assert.match(cron,/schedule:='\* \* \* \* \*',active:=true/);
});

test('disposable PG17 uses a fresh password for authenticated host TCP, without trust override',()=>{
 assert.match(launcher,/randomBytes\(24\)\.toString\("hex"\)/);
 assert.match(launcher,/export POSTGRES_PASSWORD=/);
 assert.match(launcher,/export KHATA_SYNC_V2_TEST_URL="postgres:\/\/supabase_admin:\$\{POSTGRES_PASSWORD\}@127\.0\.0\.1:5432\/khata_sync_v2_test"/);
 assert.match(launcher,/-e POSTGRES_PASSWORD \\/);
 assert.doesNotMatch(launcher,/POSTGRES_HOST_AUTH_METHOD=trust/);
 assert.doesNotMatch(launcher,/POSTGRES_PASSWORD=disposable-only/);
});

test('the isolated 4-Cron runner restores the one suppressed original purge job before checking exact names',()=>{
 assert.match(disposable,/\.replace\("select cron\.schedule\('khata-retired-company-purge'/);
 assert.match(cron,/if\(!existing\.some\(x=>x\.jobname==='khata-retired-company-purge'\)\)/);
 assert.match(cron,/cron\.schedule\('khata-retired-company-purge','17 3 \* \* \*',\$\{expected\['khata-retired-company-purge'\]\}\)/);
 assert.match(cron,/revision\.map\(job=>job\.jobname\)\.sort\(\)/);
 assert.match(cron,/ORIGINAL_COMMAND_MISMATCH/);
 assert.match(cron,/NO_ACTUAL_ORIGINAL_SCHEDULER_DISPATCH/);
 assert.doesNotMatch(cron,/mark_dispatch|phase2b_ci\.dispatch_receipts/);
});

const schedulerSql=await load('supabase/migrations/20261121145730_lottery_scheduler.sql');
const drawCacheSql=await load('supabase/migrations/20261121145334_lottery_draw_cache.sql');
test('4 cron fixture applies original collector migration before worker writes',()=>{
 assert.match(drawCacheSql,/create table lottery_private\.provider_gate/);
 assert.match(schedulerSql,/alter table lottery_private\.provider_gate add column collector_url text;/);
 assert.match(schedulerSql,/create function lottery_private\.tick\(\)/);
 const init=cron.indexOf('await initializeDisposableDatabase(sql,{supabaseRolesAlreadyInitialized:true})');
 const mig=cron.indexOf("await sql.unsafe(await readFile('supabase/migrations/20261121145730_lottery_scheduler.sql','utf8'))");
 const write=cron.indexOf('await sql`update lottery_private.provider_gate set collector_url=');
 assert(init>=0&&mig>init&&write>mig,'COLLECTOR_MIGRATION_ORDER_INVALID');
 for(const field of ['collectorUrl','collectorTick','purgeCompany','relayCleanup','liveDrawCache','statementMailbox'])
  assert(cron.includes(field),`MISSING_PREFLIGHT:${field}`);
 assert.match(cron,/DISPOSABLE_CRON_SCHEMA_MISSING:/);
 assert.doesNotMatch(cron,/alter table lottery_private\.provider_gate add column collector_url text/);
});

test('Supabase docker synthetic financial posting uses auth.uid subject and guards both tenants',()=>{
 assert.match(cron,/set_config\('request\.jwt\.claim\.sub',\$\{actor\},true\)/);
 assert.match(cron,/set_config\('request\.jwt\.claims',\$\{JSON\.stringify\(\{sub:actor,role:'authenticated'\}\)\},true\)/);
 assert.match(cron,/DISPOSABLE_AUTH_UID_NOT_ACTOR/);
 assert.match(cron,/DISPOSABLE_ROLE_NOT_AUTHENTICATED/);
 assert.match(cron,/DISPOSABLE_OWNER_SCOPE_MISMATCH/);
 assert.match(cron,/const shouldOwn=\(actor===owner&&company===safe\)\|\|\(actor===other&&company===foreignCompany\)/);
 assert.match(cron,/await assert\.rejects\(post\(owner,foreignCompany,foreignParty,'1'\)/);
 assert.doesNotMatch(cron,/disable row level security|create or replace function auth\.uid|set row_security = off/i);
});
