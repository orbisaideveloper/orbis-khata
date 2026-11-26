/**
 * Fail-closed Phase 2B remaining-five evidence verifier.
 * Accepts evidence only for actual ORIGINAL business cron dispatches (not
 * synthetic transport probes) and a separately reviewed 26-trigger mixed run.
 * The verifier itself never marks historical local tests as independently certified.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const FOUR_ORIGINAL_JOBS = Object.freeze([
  'khata-retired-company-purge',
  'lottery-live-retention',
  'orbis-lottery-collector',
  'orbis-statement-relay-cleanup',
]);

export function verifyFinalFive(evidence, {sha, triggerIds}) {
  assert.match(sha, /^[a-f0-9]{40}$/, 'EXACT_GIT_SHA_REQUIRED');
  assert(Array.isArray(triggerIds) && triggerIds.length === 26, 'FROZEN_26_TRIGGER_IDS_REQUIRED');
  assert.equal(new Set(triggerIds).size, 26, 'DUPLICATE_FROZEN_TRIGGER_ID');
  assert(evidence && typeof evidence === 'object', 'EVIDENCE_OBJECT_REQUIRED');
  assert.equal(evidence.git_sha, sha, 'MISMATCHED_SOURCE_SHA');
  assert.match(evidence.workflow_run ?? '', /^https:\/\/github\.com\/orbisaideveloper\/orbis-khata\/actions\/runs\/[0-9]+$/, 'HOSTED_RUN_LINK_REQUIRED');
  assert(Array.isArray(evidence.cron), 'FOUR_CRON_RECEIPTS_REQUIRED');
  assert.equal(evidence.cron.length, 4, 'FOUR_CRON_RECEIPTS_REQUIRED');
  assert.deepEqual(new Set(evidence.cron.map(item => item.name)), new Set(FOUR_ORIGINAL_JOBS), 'ORIGINAL_JOB_NAMES_MISMATCH');
  for (const cron of evidence.cron) {
    assert.equal(cron.dispatch_kind, 'original-business-schedule', `${cron.name}: SYNTHETIC_DISPATCH_IS_NOT_ACCEPTED`);
    assert.equal(cron.status, 'succeeded', `${cron.name}: DISPATCH_NOT_SUCCESSFUL`);
    assert(Number.isSafeInteger(cron.job_id) && cron.job_id > 0, `${cron.name}: REAL_PG_CRON_JOB_ID_REQUIRED`);
    assert(Number.isSafeInteger(cron.run_id) && cron.run_id > 0, `${cron.name}: REAL_PG_CRON_RUN_ID_REQUIRED`);
    assert.match(cron.command_sha256 ?? '', /^[a-f0-9]{64}$/, `${cron.name}: EXACT_COMMAND_HASH_REQUIRED`);
    assert.equal(cron.source_command_matches, true, `${cron.name}: LIVE_SOURCE_COMMAND_MISMATCH`);
    assert.equal(cron.role_grants_verified, true, `${cron.name}: SCHEDULER_ROLE_NOT_VERIFIED`);
    assert.equal(cron.financial_sentinel_unchanged, true, `${cron.name}: FINANCIAL_DATA_CHANGED`);
    assert.equal(cron.company_scope_verified, true, `${cron.name}: TENANT_SCOPE_NOT_VERIFIED`);
    assert.equal(cron.rollback_verified, true, `${cron.name}: ROLLBACK_NOT_VERIFIED`);
    if (cron.name === 'orbis-lottery-collector') {
      assert.equal(cron.collector_http_received, true, 'COLLECTOR_HTTP_NOT_OBSERVED');
      assert.equal(cron.vault_token_verified_without_logging, true, 'COLLECTOR_VAULT_NOT_VERIFIED');
    }
    if (cron.name === 'khata-retired-company-purge') {
      assert.equal(cron.retention_and_eligibility_verified, true, 'PURGE_ELIGIBILITY_NOT_VERIFIED');
    }
  }
  const mixed = evidence.mixed;
  assert(mixed && typeof mixed === 'object', 'MIXED_26_TRIGGER_EVIDENCE_REQUIRED');
  assert.equal(mixed.status, 'succeeded', 'MIXED_MATRIX_DID_NOT_PASS');
  assert.equal(mixed.native_postgres_17, true, 'MIXED_NATIVE_PG17_NOT_VERIFIED');
  assert.equal(mixed.concurrent_v1_v2_writers, true, 'MIXED_V1_V2_CONCURRENCY_NOT_VERIFIED');
  assert.equal(mixed.cash_stock_receipt_feed_reconciled, true, 'MIXED_FINANCE_RECONCILIATION_MISSING');
  assert.equal(mixed.rollback_replay_isolation_verified, true, 'MIXED_SAFETY_GUARDS_MISSING');
  assert(Array.isArray(mixed.trigger_receipts), 'MIXED_TRIGGER_RECEIPTS_MISSING');
  assert.equal(mixed.trigger_receipts.length, 26, 'MIXED_ALL_26_REQUIRED');
  assert.deepEqual(new Set(mixed.trigger_receipts.map(x => x.id)), new Set(triggerIds), 'MIXED_TRIGGER_REGISTRY_MISMATCH');
  for (const receipt of mixed.trigger_receipts) {
    assert.equal(receipt.executed_in_same_dataset, true, `${receipt.id}: NOT_IN_COMBINED_DATASET`);
    assert.equal(receipt.effect_asserted, true, `${receipt.id}: EFFECT_NOT_ASSERTED`);
    assert.equal(receipt.rollback_or_negative_asserted, true, `${receipt.id}: NEGATIVE_OR_ROLLBACK_MISSING`);
  }
  assert.match(evidence.artifact_sha256 ?? '', /^[a-f0-9]{64}$/, 'ARTIFACT_PROVENANCE_REQUIRED');
  assert.equal(evidence.independent_review?.status, 'approved', 'INDEPENDENT_REVIEW_REQUIRED');
  assert(typeof evidence.independent_review?.reviewer === 'string' && evidence.independent_review.reviewer.trim().length > 0, 'REVIEWER_REQUIRED');
  assert.equal(evidence.independent_review?.git_sha, sha, 'REVIEWER_SOURCE_SHA_MISMATCH');
  return {status: 'FIVE_CASES_EVIDENCE_ACCEPTED', git_sha: sha};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [evidencePath, triggerManifestPath, sha] = process.argv.slice(2);
  assert(evidencePath && triggerManifestPath && sha, 'USAGE: evidence.json 64-gate-register.json GIT_SHA');
  const evidence=JSON.parse(await readFile(evidencePath, 'utf8'));
  const rows=JSON.parse(await readFile(triggerManifestPath, 'utf8'));
  const triggerIds=rows.map(row=>row.gate_id).filter(id=>id.startsWith('trigger:'));
  console.log(JSON.stringify(verifyFinalFive(evidence,{sha,triggerIds}),null,2));
}
