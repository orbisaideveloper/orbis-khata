/** Phase 2A: exhaustive source-routing & identity coverage inventory.
 * This metadata is for development auditing ONLY. It is NOT a server entitlement
 * list, a production authorization source, a migration, or a live feed emitter.
 * Source: frozen ADR-SYNC-002 / ADR-ENTITLEMENT-001, 2026-11-25 main.
 * Runtime phase 2B/2E gates remain independently blocked until proved.
 */
import type { KhataOperation } from '../accounting/server-gateway.ts'
import type { InventoryKind } from '../inventory/model.ts'
import type { ProfileCommand } from '../expense-profiles/model.ts'
import type { RelayCommand } from '../customer-view/relay/model.ts'
import type { ShareCommand } from '../customer-view/contract.ts'

type Family = 'catalog' | 'ledger' | 'invoice' | 'expense' | 'master' | 'inventory' | 'settings' | 'lottery' | 'lifecycle' | 'external'
type Kind = 'read' | 'write' | 'mixed' | 'sync' | 'relay' | 'recovery' | 'guard' | 'revision' | 'derived-write'
type Route = Readonly<{ family: Family; kind: Kind }>
/** Do not assume coverage implies the underlying command has a v2 adapter. */
export const familyContracts = {
  'catalog': { scope: 'account-catalog', identity: 'company.id; scope.epoch', children: 'company-id-reservation,owner-binding,company-settings', invariant: 'catalog lifecycle and historical purged UUID fence', nextGate: '2B' },
  'ledger': { scope: 'company', identity: 'voucher.id; operationId', children: 'voucher.reverses,party.id,payment-link.id', invariant: 'voucher/expense and cash/PWD are distinct business effects', nextGate: '2B+2E' },
  'invoice': { scope: 'company', identity: 'bill.id; operationId', children: 'payment.id,inventory-document.id,route.input-id,fiscal-reference', invariant: 'sale/purchase paid and unpaid, correction/reversal and production child IDs', nextGate: '2B+2E' },
  'expense': { scope: 'company', identity: 'expense.id; profile.operationId', children: 'expense_bill_lines.id,profile_payment.id,reversal.parent_id', invariant: 'expense/advance schedules and deterministic rollback', nextGate: '2B+2E' },
  'master': { scope: 'company', identity: 'party.id; item.id', children: 'master-audit.id,master tombstone,opening_balance.id', invariant: 'party/item deletes and opening balance must not bypass feed', nextGate: '2B+2E' },
  'inventory': { scope: 'company', identity: 'inventory_document.id; company.id', children: 'stock_movement.doc_id,production_input.id,production_output.id,stock_reversal.id', invariant: 'quantity and cost/order preserved, account/stock locks, correction', nextGate: '2B+2E' },
  'settings': { scope: 'company', identity: 'company.id; fiscal_scope', children: 'settings revision,fiscal counter,number reservation', invariant: 'settings and sequence version, no last-write-wins on numbering', nextGate: '2B+2E' },
  'lottery': { scope: 'lottery-organization', identity: 'organization.id; operationId', children: 'seller/draft/stockist/PWD/commission/payment/settlement/audit.id', invariant: 'exact cash vs noncash PWD, seller ledger, posted correction and tombstones', nextGate: '2B+2E' },
  'lifecycle': { scope: 'account-catalog', identity: 'company.id; scope.epoch', children: 'retired_at,purge_tombstone,scope-id-reservation', invariant: 'retire/restore/purge and scheduled trigger exact same transaction', nextGate: '2B' },
  'external': { scope: 'separate-readonly-relay', identity: 'invitation.id; archive.id', children: 'recipient authorization and ack/recovery revision', invariant: 'Customer View and Drive archives MUST NOT grant owner financial write', nextGate: '2F' },
} as const satisfies Record<Family, { scope: string; identity: string; children: string; invariant: string; nextGate: string }>

export const gatewayOperationCoverage = {
  'lottery-sync': { family: 'lottery', kind: 'sync' },
  'company-sync': { family: 'ledger', kind: 'sync' },
  'customer-relay': { family: 'external', kind: 'relay' },
  'lottery-seller-recovery': { family: 'external', kind: 'read' },
  'lottery-export': { family: 'external', kind: 'read' },
  'company-export': { family: 'external', kind: 'read' },
  'drive-recovery': { family: 'external', kind: 'recovery' },
  'party-sharing': { family: 'external', kind: 'relay' },
  'expense-profiles': { family: 'expense', kind: 'mixed' },
  'lottery': { family: 'lottery', kind: 'mixed' },
  'workspace': { family: 'invoice', kind: 'mixed' },
  'retired-companies': { family: 'lifecycle', kind: 'read' },
  'masters': { family: 'master', kind: 'read' },
  'party-save': { family: 'master', kind: 'write' },
  'item-save': { family: 'master', kind: 'write' },
  'party-delete': { family: 'master', kind: 'write' },
  'item-delete': { family: 'master', kind: 'write' },
  'party-balance': { family: 'ledger', kind: 'read' },
  'expense-bill': { family: 'expense', kind: 'write' },
  'companies': { family: 'catalog', kind: 'read' },
  'create': { family: 'catalog', kind: 'write' },
  'report': { family: 'ledger', kind: 'read' },
  'post': { family: 'ledger', kind: 'write' },
  'expense-report': { family: 'expense', kind: 'read' },
  'expense-post': { family: 'expense', kind: 'write' },
  'inventory-post': { family: 'inventory', kind: 'write' },
  'inventory-report': { family: 'inventory', kind: 'read' },
} as const satisfies Record<KhataOperation['operation'], Route>

export const workspaceActionCoverage = {
  'production': { family: 'inventory', kind: 'write' },
  'settings': { family: 'settings', kind: 'read' },
  'accounts': { family: 'settings', kind: 'read' },
  'settings-save': { family: 'settings', kind: 'write' },
  'invoice-save': { family: 'invoice', kind: 'write' },
  'number-preview': { family: 'settings', kind: 'read' },
  'number': { family: 'settings', kind: 'write' },
  'expense': { family: 'expense', kind: 'write' },
  'payment': { family: 'ledger', kind: 'write' },
  'detail': { family: 'invoice', kind: 'read' },
  'retire': { family: 'lifecycle', kind: 'write' },
  'restore': { family: 'lifecycle', kind: 'write' },
  'bill': { family: 'invoice', kind: 'write' },
  'correct': { family: 'invoice', kind: 'write' },
} as const satisfies Record<string, Route>

export const lotteryReadCoverage = {
  'listOrganizations': { family: 'lottery', kind: 'read' },
  'getWorkspace': { family: 'lottery', kind: 'read' },
  'getWorkspaceHistory': { family: 'lottery', kind: 'read' },
  'previewSale': { family: 'lottery', kind: 'read' },
  'getVerifiedSummary': { family: 'lottery', kind: 'read' },
  'analyzeVerifiedAccounting': { family: 'lottery', kind: 'read' },
  'previewAccountingVoid': { family: 'lottery', kind: 'read' },
} as const satisfies Record<string, Route>

export const lotteryWriteCoverage = {
  'createOrganization': { family: 'lottery', kind: 'write' },
  'createParty': { family: 'lottery', kind: 'write' },
  'updatePartyProfile': { family: 'lottery', kind: 'write' },
  'updateOrganizationTdsRate': { family: 'lottery', kind: 'write' },
  'updateOrganizationPreferences': { family: 'lottery', kind: 'write' },
  'updateUserLedgerStorage': { family: 'lottery', kind: 'write' },
  'createPeriod': { family: 'lottery', kind: 'write' },
  'createFinancialYearPeriod': { family: 'lottery', kind: 'write' },
  'recordStockMovement': { family: 'lottery', kind: 'write' },
  'saveDailyStockistEntry': { family: 'lottery', kind: 'write' },
  'clearDailyEntries': { family: 'lottery', kind: 'write' },
  'recordSale': { family: 'lottery', kind: 'write' },
  'createDailySellerDraft': { family: 'lottery', kind: 'write' },
  'updateDailySellerDraft': { family: 'lottery', kind: 'write' },
  'deleteDailySellerDraft': { family: 'lottery', kind: 'write' },
  'postDailySellerDraft': { family: 'lottery', kind: 'write' },
  'correctPostedSale': { family: 'lottery', kind: 'write' },
  'correctAccountingTransaction': { family: 'lottery', kind: 'write' },
  'voidAccountingTransaction': { family: 'lottery', kind: 'write' },
  'recordPayment': { family: 'lottery', kind: 'write' },
  'recordSettlement': { family: 'lottery', kind: 'write' },
  'createExpenseCategory': { family: 'lottery', kind: 'write' },
  'updateExpenseCategory': { family: 'lottery', kind: 'write' },
  'deleteExpenseCategory': { family: 'lottery', kind: 'write' },
  'createExpenseProfile': { family: 'lottery', kind: 'write' },
  'updateExpenseProfile': { family: 'lottery', kind: 'write' },
  'recordExpenseBill': { family: 'lottery', kind: 'write' },
  'recordExpensePayment': { family: 'lottery', kind: 'write' },
  'recordCustomerBill': { family: 'lottery', kind: 'write' },
} as const satisfies Record<string, Route>

export const expenseProfileActionCoverage = {
  'list': { family: 'expense', kind: 'read' },
  'save': { family: 'expense', kind: 'write' },
  'category': { family: 'expense', kind: 'write' },
  'category-delete': { family: 'expense', kind: 'write' },
  'pay': { family: 'expense', kind: 'write' },
  'void': { family: 'expense', kind: 'write' },
  'delete': { family: 'expense', kind: 'write' },
  'bill': { family: 'expense', kind: 'write' },
  'bill-void': { family: 'expense', kind: 'write' },
} as const satisfies Record<ProfileCommand['action'], Route>

export const inventoryKindCoverage = {
  'item': { family: 'master', kind: 'write' },
  'warehouse': { family: 'inventory', kind: 'write' },
  'purchase': { family: 'inventory', kind: 'write' },
  'sale': { family: 'inventory', kind: 'write' },
  'opening': { family: 'inventory', kind: 'write' },
  'transfer': { family: 'inventory', kind: 'write' },
  'production-input': { family: 'inventory', kind: 'write' },
  'production-output': { family: 'inventory', kind: 'write' },
} as const satisfies Record<InventoryKind, Route>

export const customerRelayActionCoverage = {
  'list': { family: 'external', kind: 'read' },
  'invite': { family: 'external', kind: 'relay' },
  'accept': { family: 'external', kind: 'relay' },
  'revoke': { family: 'external', kind: 'relay' },
  'resync': { family: 'external', kind: 'relay' },
  'pull': { family: 'external', kind: 'read' },
  'ack': { family: 'external', kind: 'relay' },
  'publish': { family: 'external', kind: 'relay' },
} as const satisfies Record<RelayCommand['action'], Route>

export const lotteryPartySharingCoverage = {
  'list': { family: 'external', kind: 'read' },
  'choices': { family: 'external', kind: 'read' },
  'invite': { family: 'external', kind: 'relay' },
  'accept': { family: 'external', kind: 'relay' },
  'decline': { family: 'external', kind: 'relay' },
  'revoke': { family: 'external', kind: 'relay' },
  'statement': { family: 'external', kind: 'read' },
} as const satisfies Record<ShareCommand['action'], Route>

/** D4/P1–P7 unresolved values are deliberately NOT invented. */
export const policyDecisionRegister = {
  P1: { question: 'Free/Basic Web access, primary replacement and Plus device counts', state: 'owner-required' },
  P2: { question: 'Offline authorization expiry, revocation grace, and lost phone path', state: 'owner-required' },
  P3: { question: 'Feed/tombstone retention and legal/privacy deletion budgets', state: 'owner-required' },
  P4: { question: 'Encrypted backup RPO/RTO, disaster recovery ownership', state: 'owner-required' },
  P5: { question: 'Dependent financial conflict approval and audit UX', state: 'owner-required' },
  P6: { question: 'Old Android/PWA min version, multi-stage cutover and device lifecycle', state: 'owner-required' },
  P7: { question: 'Traffic budget and measured latency, cost and battery SLO', state: 'owner-required' },
} as const

/** Verified 2026-11-25 against the READ-ONLY live PostgreSQL pg_proc catalog.
 * New production DB definitions must be audited here before any phase 2B rollout.
 */
export const liveBackendFunctionCoverage = {
  'orbis_khata.purge_allowed': { family: 'lifecycle', kind: 'guard' },
  'orbis_khata.purge_retired_companies': { family: 'lifecycle', kind: 'write' },
  'public.khata_expense_bill_v2': { family: 'expense', kind: 'write' },
  'public.khata_expense_immutable': { family: 'expense', kind: 'guard' },
  'public.khata_expense_post_v1': { family: 'expense', kind: 'write' },
  'public.khata_expense_post_v2': { family: 'expense', kind: 'write' },
  'public.khata_expense_profiles_v1': { family: 'expense', kind: 'write' },
  'public.khata_expense_report_v1': { family: 'expense', kind: 'read' },
  'public.khata_expense_report_v2': { family: 'expense', kind: 'read' },
  'public.khata_inventory_post_v1': { family: 'inventory', kind: 'write' },
  'public.khata_inventory_report_v1': { family: 'inventory', kind: 'read' },
  'public.khata_lottery_store_v1': { family: 'lottery', kind: 'write' },
  'public.khata_lottery_store_v2': { family: 'lottery', kind: 'write' },
  'public.khata_master_delete_v2': { family: 'master', kind: 'write' },
  'public.khata_master_save_v2': { family: 'master', kind: 'write' },
  'public.khata_masters_v2': { family: 'master', kind: 'read' },
  'public.khata_party_balance_v2': { family: 'ledger', kind: 'read' },
  'public.khata_post_v1': { family: 'ledger', kind: 'write' },
  'public.khata_prepare_company_v2': { family: 'catalog', kind: 'write' },
  'public.khata_report_revision_v1': { family: 'settings', kind: 'revision' },
  'public.khata_report_v1': { family: 'ledger', kind: 'read' },
  'public.khata_validate_voucher': { family: 'ledger', kind: 'guard' },
  'public.khata_workspace_v3': { family: 'invoice', kind: 'mixed' },
  'public.khata_workspace_v3_before_production': { family: 'invoice', kind: 'write' },
  'public.khata_workspace_v3_legacy': { family: 'invoice', kind: 'write' },
  'public.khata_workspace_v3_numbered': { family: 'invoice', kind: 'write' },
} as const satisfies Record<string, Route>

/** Verified 2026-11-25 against the READ-ONLY live pg_trigger catalog.
 * Derived voucher-trigger inventory effects are writers, not mere guard triggers.
 */
export const liveBackendTriggerCoverage = {
  'orbis_khata.lottery_party_shares.statement_permission_from_legacy': { family: 'external', kind: 'relay' },
  'orbis_khata.statement_links.statement_permission_to_legacy': { family: 'external', kind: 'relay' },
  'public.khata_companies.khata_report_revision_watch': { family: 'lifecycle', kind: 'revision' },
  'public.khata_expense_bill_lines.immutable': { family: 'expense', kind: 'guard' },
  'public.khata_expense_events.expense_immutable': { family: 'expense', kind: 'guard' },
  'public.khata_expense_events.khata_report_revision_watch': { family: 'expense', kind: 'revision' },
  'public.khata_inventory_documents.inventory_immutable': { family: 'inventory', kind: 'guard' },
  'public.khata_inventory_documents.khata_report_revision_watch': { family: 'inventory', kind: 'revision' },
  'public.khata_inventory_documents.khata_warehouse_transfer_guard': { family: 'inventory', kind: 'guard' },
  'public.khata_items.khata_report_revision_watch': { family: 'master', kind: 'revision' },
  'public.khata_items.master_guard': { family: 'master', kind: 'guard' },
  'public.khata_master_audit.immutable': { family: 'master', kind: 'guard' },
  'public.khata_opening_expense_payments.immutable': { family: 'expense', kind: 'guard' },
  'public.khata_opening_expense_payments.khata_report_revision_watch': { family: 'expense', kind: 'revision' },
  'public.khata_parties.khata_report_revision_watch': { family: 'master', kind: 'revision' },
  'public.khata_parties.master_guard': { family: 'master', kind: 'guard' },
  'public.khata_stock_movements.inventory_immutable': { family: 'inventory', kind: 'guard' },
  'public.khata_stock_movements.khata_report_revision_watch': { family: 'inventory', kind: 'revision' },
  'public.khata_stock_reversals.inventory_immutable': { family: 'inventory', kind: 'guard' },
  'public.khata_stock_reversals.khata_report_revision_watch': { family: 'inventory', kind: 'revision' },
  'public.khata_vouchers.inventory_voucher_reversal': { family: 'inventory', kind: 'derived-write' },
  'public.khata_vouchers.khata_production_purchase_reverse': { family: 'inventory', kind: 'derived-write' },
  'public.khata_vouchers.khata_report_revision_watch': { family: 'ledger', kind: 'revision' },
  'public.khata_vouchers.khata_voucher_validate': { family: 'ledger', kind: 'guard' },
  'public.khata_warehouses.inventory_immutable': { family: 'inventory', kind: 'guard' },
  'public.khata_warehouses.khata_report_revision_watch': { family: 'inventory', kind: 'revision' },
} as const satisfies Record<string, Route>

/** Existing LIVE authenticated EXECUTE grant set. Not a claim that each function
 * can reach tables as `authenticated`; this is an ingress audit obligation.
 * Direct table INSERT/UPDATE/DELETE grants for these roles were absent in the
 * separately read pg_class ACL results, not proof every invoker path is safe.
 */
export const liveAuthenticatedExecutableFunctions = [
  'orbis_khata.purge_allowed',
  'public.khata_expense_bill_v2',
  'public.khata_expense_post_v1',
  'public.khata_expense_post_v2',
  'public.khata_expense_profiles_v1',
  'public.khata_expense_report_v1',
  'public.khata_expense_report_v2',
  'public.khata_inventory_post_v1',
  'public.khata_inventory_report_v1',
  'public.khata_lottery_store_v2',
  'public.khata_master_delete_v2',
  'public.khata_master_save_v2',
  'public.khata_masters_v2',
  'public.khata_party_balance_v2',
  'public.khata_post_v1',
  'public.khata_prepare_company_v2',
  'public.khata_report_revision_v1',
  'public.khata_report_v1',
  'public.khata_workspace_v3',
] as const

/** Read-only observed production pg_cron job names (2026-11-25).
 * These scheduled ingress/cleanup paths must not be lost in phase 2B/2E.
 */
export const liveScheduledJobCoverage = {
  'khata-retired-company-purge': { family: 'lifecycle', kind: 'write' },
  'lottery-live-retention': { family: 'external', kind: 'guard' },
  'orbis-lottery-collector': { family: 'external', kind: 'write' },
  'orbis-statement-relay-cleanup': { family: 'external', kind: 'write' },
} as const satisfies Record<string, Route>

/** FROZEN ADR references. Business policy values P1-P7 are owner-owned. */
export const frozenPhase2AContract = {
  protocolVersion: 2,
  coreDecision: 'ADR-SYNC-002',
  entitlementDecision: 'ADR-ENTITLEMENT-001',
  scopeKinds: ['company', 'lottery-organization', 'account-catalog'],
  receiptIdentity: 'actorId+deviceRegistrationId+scope.kind+scope.id+scope.epoch+operationId+canonicalDigest',
  conflictPolicy: 'dependency-subgraph-not-amount-or-date',
  authority: 'verified-central-actor + server-owned-tenant-scope + device-entitlement',
  compatibility: 'old-client-v1-continues-until-captured-or-gated',
  customerView: 'separate-recipient-read-only;never-owner-web-write',
} as const

/** Direct SQL DML in the checked-in HTTP gateway. Those writes bypass an
 * operation router and require explicit capture/lock review in phase 2B.
 */
export const gatewayDirectTableWrites = {
  'orbis_khata.drive_account_recovery': { family: 'external', kind: 'recovery' },
  'public.khata_companies': { family: 'catalog', kind: 'write' },
  'public.khata_parties': { family: 'master', kind: 'write' },
} as const satisfies Record<string, Route>
