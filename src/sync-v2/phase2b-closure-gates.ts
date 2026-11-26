/** Phase 2B release ledger. Audit evidence is deliberately distinct from a green CI run.
 * This file is not an authentication policy, a migration, or a feature flag.
 * A live writer is not certified merely because a disposable fixture uses its name.
 */
import { liveAuthenticatedExecutableFunctions, liveBackendFunctionCoverage, liveBackendTriggerCoverage,
  liveScheduledJobCoverage, gatewayDirectTableWrites } from './phase2a-coverage.ts'

export type EvidenceStatus = 'verified' | 'candidate' | 'blocked'

/** Exact LIVE authenticated RPC surface, 2026-11-25 read-only ACL recheck.
 * VERIFIED below means only that a particular boundary's native fixture passed;
 * it does not grant global Phase-2B completion.
 */
export const authenticatedRpcGates = {
  'orbis_khata.purge_allowed': ['candidate', 'Prove legacy purge privilege and live cron authority'],
  'public.khata_expense_bill_v2': ['candidate', 'Native invoice/expense-line writer capture and rollback'],
  'public.khata_expense_post_v1': ['candidate', 'Native old-client expense mutations and correction feed reconciliation'],
  'public.khata_expense_post_v2': ['candidate', 'Native new-client expense retry and lineage'],
  'public.khata_expense_profiles_v1': ['candidate', 'Native profile state, scheduling, delete and replay coverage'],
  'public.khata_expense_report_v1': ['candidate', 'Read-only projection reconciliation against committed feed'],
  'public.khata_expense_report_v2': ['candidate', 'Read-only projection reconciliation against committed feed'],
  'public.khata_inventory_post_v1': ['candidate', 'All opening/input/output/transfer and reversal variants under concurrent locks'],
  'public.khata_inventory_report_v1': ['candidate', 'Stock amounts and quantities reconcile across bootstrap and live feed'],
  'public.khata_lottery_store_v2': ['candidate', 'Every organization writer/financial correction requires distinct scope evidence'],
  'public.khata_master_delete_v2': ['candidate', 'Native master tombstone with foreign company, retry and rollback'],
  'public.khata_master_save_v2': ['candidate', 'Native party/item/warehouse save and update feed with old clients'],
  'public.khata_masters_v2': ['candidate', 'Read-only full master/catalog snapshot is complete'],
  'public.khata_party_balance_v2': ['candidate', 'Reconcile opening balances, payment links and ledger with read-only values'],
  'public.khata_post_v1': ['verified', '32 concurrent native PostgreSQL same-ID writes, exact one feed event'],
  'public.khata_prepare_company_v2': ['candidate', 'Historical/purged UUID reservation, bootstrap, rollback and fiscal settings'],
  'public.khata_report_revision_v1': ['candidate', 'Revision and feed high-water are compatible under concurrent mutations'],
  'public.khata_report_v1': ['candidate', 'Report totals match captured account projection'],
  'public.khata_workspace_v3': ['candidate', 'All sale/purchase/payment/advance/correction/numbering paths native-tested'],
} as const satisfies Record<(typeof liveAuthenticatedExecutableFunctions)[number], readonly [EvidenceStatus, string]>

/** Entry is included even if an automated job modifies a different scope.
 * A scheduler cannot silently inherit receipt guarantees from a route test.
 */
export const schedulerGates = {
  'khata-retired-company-purge': 'Live cron old-client purge, company terminal event, global ID fence, rollback',
  'lottery-live-retention': 'Verify no financial receipt/feed or required audit tombstone is removed',
  'orbis-lottery-collector': 'Verify external source import, organization scope and audit isolation',
  'orbis-statement-relay-cleanup': 'Verify recipient-only deletion cannot mutate owner ledger or feed',
} as const satisfies Record<keyof typeof liveScheduledJobCoverage, string>

export const nonRpcGates = {
  'legacy-triggers': 'Reconcile all 26 triggers, especially derived voucher/stock reversal side effects and ordering',
  'direct-edge-ingress': 'Audit all direct SQL writer ingress, Gateway verified principal, SQL grants and every module version',
  'historical-snapshot': 'Full authorized old-company snapshot + mixed-era reservation, rollback and oversized transfer',
  'device-authority': 'Revocation, scope/epoch, entitlement, old-client release policy and credential rotation',
  'cross-module-reconciliation': 'All captured money/stock/fiscal results and one producer per entity including v1/v2 concurrent writes',
} as const

/** Deferred to Phase 2C/2D/2G, NOT a prerequisite for Phase 2B server-only signoff.
 * This separate register remains blocked until actual Android A/B and Web clients exist.
 */
export const crossClientGates = {
  'staged-client-consumption': 'Android/Web atomic full-group staging, SHA verification, local cursor commit and recovery',
} as const

/** Fail closed: reporting zero open tasks cannot be forged by supplying partial
 * evidence. Each registered RPC, scheduler and invariant must have its own ID.
 */
export function assessPhase2bClosure(approvedEvidence: ReadonlySet<string>): {
  complete: boolean
  pending: string[]
} {
  const required = [
    ...liveAuthenticatedExecutableFunctions.map(name => `rpc:${name}`),
    ...Object.keys(liveBackendFunctionCoverage)
      .filter(name => !(liveAuthenticatedExecutableFunctions as readonly string[]).includes(name))
      .map(name => `internal-rpc:${name}`),
    ...Object.keys(liveBackendTriggerCoverage).map(name => `trigger:${name}`),
    ...Object.keys(schedulerGates).map(name => `cron:${name}`),
    ...Object.keys(gatewayDirectTableWrites).map(name => `edge:${name}`),
    ...Object.keys(nonRpcGates).map(name => `gate:${name}`),
  ]
  const pending = required.filter(name => !approvedEvidence.has(name))
  return { complete: pending.length === 0, pending }
}
