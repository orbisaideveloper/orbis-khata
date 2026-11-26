import test from 'node:test';
import assert from 'node:assert/strict';
import {FOUR_ORIGINAL_JOBS, verifyFinalFive} from '../../scripts/verify-sync-v2-final-five-evidence.mjs';
const sha='a'.repeat(40), triggerIds=Array.from({length:26},(_,i)=>`trigger:real_${i}`);
function valid() {
  return {
    git_sha:sha,workflow_run:'https://github.com/orbisaideveloper/orbis-khata/actions/runs/12345',
    artifact_sha256:'b'.repeat(64),
    independent_review:{status:'approved',reviewer:'separate-authorized-reviewer',git_sha:sha},
    cron:FOUR_ORIGINAL_JOBS.map((name,i)=>({
      name,dispatch_kind:'original-business-schedule',status:'succeeded',job_id:i+1,run_id:i+100,
      command_sha256:'c'.repeat(64),source_command_matches:true,role_grants_verified:true,
      financial_sentinel_unchanged:true,company_scope_verified:true,rollback_verified:true,
      collector_http_received:true,vault_token_verified_without_logging:true,
      retention_and_eligibility_verified:true,
    })),
    mixed:{status:'succeeded',native_postgres_17:true,concurrent_v1_v2_writers:true,
      cash_stock_receipt_feed_reconciled:true,rollback_replay_isolation_verified:true,
      trigger_receipts:triggerIds.map(id=>({id,executed_in_same_dataset:true,effect_asserted:true,rollback_or_negative_asserted:true}))},
  };
}
const verify=e=>verifyFinalFive(e,{sha,triggerIds});
test('requires exact original four and 26 independent receipts',()=>assert.equal(verify(valid()).status,'FIVE_CASES_EVIDENCE_ACCEPTED'));
test('rejects synthetic cron even if clock dispatched',()=>{const x=valid();x.cron[0].dispatch_kind='synthetic-transport';assert.throws(()=>verify(x),/SYNTHETIC/)});
test('rejects missing original cron job',()=>{const x=valid();x.cron.pop();assert.throws(()=>verify(x),/FOUR_CRON/)});
test('rejects failed original cron dispatch',()=>{const x=valid();x.cron[1].status='failed';assert.throws(()=>verify(x),/DISPATCH_NOT_SUCCESSFUL/)});
test('requires durable original pg_cron run details',()=>{const x=valid();x.cron[1].run_id=0;assert.throws(()=>verify(x),/RUN_ID_REQUIRED/)});
test('rejects missing collector HTTP',()=>{const x=valid();x.cron[2].collector_http_received=false;assert.throws(()=>verify(x),/COLLECTOR_HTTP/)});
test('rejects missing Vault security proof',()=>{const x=valid();x.cron[2].vault_token_verified_without_logging=false;assert.throws(()=>verify(x),/VAULT/)});
test('rejects mismatched business source commands',()=>{const x=valid();x.cron[3].source_command_matches=false;assert.throws(()=>verify(x),/SOURCE_COMMAND_MISMATCH/)});
test('rejects unverified finance sentinel',()=>{const x=valid();x.cron[3].financial_sentinel_unchanged=false;assert.throws(()=>verify(x),/FINANCIAL_DATA_CHANGED/)});
test('rejects incomplete mixed all-26 dataset',()=>{const x=valid();x.mixed.trigger_receipts.pop();assert.throws(()=>verify(x),/MIXED_ALL_26_REQUIRED/)});
test('rejects missing trigger negative assertion',()=>{const x=valid();x.mixed.trigger_receipts[1].rollback_or_negative_asserted=false;assert.throws(()=>verify(x),/NEGATIVE_OR_ROLLBACK/)});
test('rejects fake global CI pass without independent review',()=>{const x=valid();x.independent_review.status='pending';assert.throws(()=>verify(x),/INDEPENDENT_REVIEW_REQUIRED/)});
test('rejects evidence from a different SHA',()=>{const x=valid();x.git_sha='d'.repeat(40);assert.throws(()=>verify(x),/MISMATCHED_SOURCE_SHA/)});
