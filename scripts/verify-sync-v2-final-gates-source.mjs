/** Evidence-first final-five preflight: validates immutable production contracts.
 * NEVER upgrades transport or selected mixed tests into business gate signoff.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const files = {
  purge:'supabase/migrations/20261028184713_khata_accounting_completion_v3.sql',
  retention:'supabase/migrations/20261122142011_lottery_live_per_draw.sql',
  collector:'supabase/migrations/20261121145730_lottery_scheduler.sql',
  relay:'supabase/migrations/20261121182053_customer_statement_relay.sql',
  coverage:'src/sync-v2/phase2a-coverage.ts',
  combined:'scripts/verify-sync-v2-combined-writers.mjs',
};
const source=Object.fromEntries(await Promise.all(Object.entries(files).map(async ([k,p])=>[k,await readFile(p,'utf8')])));
const named=[
  ['khata-retired-company-purge','purge'],
  ['lottery-live-retention','retention'],
  ['orbis-lottery-collector','collector'],
  ['orbis-statement-relay-cleanup','relay'],
];
for(const [name,key] of named){
  assert(source[key].includes(`cron.schedule('${name}'`), `MISSING_ORIGINAL_SCHEDULE:${name}`);
  assert(source.coverage.includes(`'${name}'`),`MISSING_FROZEN_REGISTRY:${name}`);
}
assert.match(source.purge,/purge_retired_companies\(\)/);
assert.match(source.retention,/delete from lottery_private\.live_draw_cache/);
assert.match(source.retention,/update lottery_private\.live_cache/);
assert.match(source.collector,/lottery_private\.tick\(\)/);
assert.match(source.collector,/vault\.decrypted_secrets/);
assert.match(source.relay,/statement_relay_cleanup_v1\(\)/);
assert.match(source.combined,/assert\.|assert\(/, 'MIXED_WRITER_ASSERTIONS_MISSING');
console.log(JSON.stringify({verdict:'PASS_SOURCE_CONTRACT_ONLY',originalCronNames:named.map(x=>x[0]),mixedFixturePresent:true,independent64CaseSignoff:'NOT_CERTIFIED',remainingOriginalBusinessDispatch:'BLOCKED',remainingAll26ConcurrentTriggerMatrix:'PARTIAL'},null,2));
