import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=p=>readFile(p,'utf8');
const workflow=await load('.github/workflows/sync-v2-phase2b-final-gates.yml');
const cron=await load('scripts/verify-sync-v2-business-cron-runtime.mjs');
const mixed=await load('scripts/verify-sync-v2-mixed-26-runtime.mjs');
const fixtures=await load('scripts/sync-v2-trigger-behavior-fixture.mjs');
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
