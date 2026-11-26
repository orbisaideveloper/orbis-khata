import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=p=>readFile(p,'utf8');
const workflow=await load('.github/workflows/sync-v2-phase2b-final-gates.yml');
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

test('cron CI waits for final TCP PostgreSQL and captures failing Docker startup logs',()=>{
 assert.match(workflow,/listen_addresses='\*'/);
 assert.match(workflow,/shared_preload_libraries=pg_stat_statements,pg_cron,pg_net/);
 assert.match(workflow,/node --input-type=module -e/);
 assert.match(workflow,/postgres:\/\/supabase_admin@127\.0\.0\.1:5432\/khata_sync_v2_test/);
 assert.match(workflow,/FINAL_HOST_TCP_DATABASE_AND_ADMIN_ROLE_READY/);
 assert.match(workflow,/DISPOSABLE_POSTGRES_EXITED_DURING_INIT/);
 assert.match(workflow,/disposable-db-log\.txt/);
 assert.doesNotMatch(workflow,/if docker exec orbis-phase2b-disposable pg_isready -U postgres/);
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
 assert.match(workflow,/current_user as role/);
 assert.match(workflow,/supabase_admin/);
 assert.doesNotMatch(workflow,/GRANT CREATE ON DATABASE|ALTER ROLE postgres SUPERUSER/i);
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
