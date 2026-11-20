import { readOnlineSellerRecovery } from '../accounting/api';
import { validateRecoverySnapshot, type SellerRecoverySnapshot, type RecoverySale, type SellerRecoveryRequest } from './seller-recovery-contract';
import { accountingBusinessDate } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate';
import { rupeesToPaise } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingMoney';
import type { AccountingOutboxRecord, AccountingLocalScope, AccountingSellerWorkingRecord, AccountingSellerWorkingRow, LotteryAccountingLocalStore } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore';
import type { LotteryAccountingClient } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingClient';

export type RecoveryMode = 'retry' | 'discard' | 'keep-local';
type Context = { scope: AccountingLocalScope; store: LotteryAccountingLocalStore; api: LotteryAccountingClient;
  read: () => Promise<Pick<SellerRecoverySnapshot, 'organization' | 'draftSales' | 'sales'>>; active: () => boolean; beforeResolve?: () => void };

/** Reads just this party/day and the locally referenced bill, never the full export. */
export async function readSellerRecoveryWorkspace(actor: string, request: SellerRecoveryRequest): Promise<SellerRecoverySnapshot> {
  const payload = await readOnlineSellerRecovery(actor, request) as { actor?: string; version?: number; snapshot: SellerRecoverySnapshot };
  if (payload?.actor !== actor || payload.version !== 1) throw new Error('RECOVERY_SCOPE_INVALID');
  validateRecoverySnapshot(payload.snapshot, request);
  return payload.snapshot;
}

export class SellerRecoveryConflict extends Error {
  readonly server: { dispatch: string; returns: string; commissionPaise: string } | null;
  constructor(sale?: { dispatchQuantity: number; morningReturnQuantity: number; dayReturnQuantity: number; eveningReturnQuantity: number; commissionPaise: string }) {
    super('RECOVERY_SERVER_DIFFERS');
    this.server = sale ? { dispatch: String(sale.dispatchQuantity),
      returns: `${sale.morningReturnQuantity} / ${sale.dayReturnQuantity} / ${sale.eveningReturnQuantity}`, commissionPaise: sale.commissionPaise } : null;
  }
}

function inputRow(row: AccountingSellerWorkingRow) {
  return [row.saleId ?? '', row.partyId, row.dispatchQuantity, row.morningReturnQuantity,
    row.dayReturnQuantity, row.eveningReturnQuantity, row.commissionRupees, row.syncVersion ?? null, row.replacesVoidId ?? ''];
}

function serverRow(workspace: Pick<SellerRecoverySnapshot, 'organization' | 'draftSales' | 'sales'>, record: AccountingSellerWorkingRecord, requireIdentity = true) {
  const matches = [...workspace.draftSales, ...workspace.sales].filter(sale => sale.partyId === record.partyId &&
    accountingBusinessDate(sale.occurredAt) === accountingBusinessDate(record.occurredAt));
  if (matches.length > 1) throw new Error('RECOVERY_AMBIGUOUS');
  const sale = matches[0];
  if (requireIdentity && sale && record.row.saleId && sale.id !== record.row.saleId) throw new SellerRecoveryConflict(sale);
  return sale;
}

function sameValues(sale: NonNullable<ReturnType<typeof serverRow>>, row: AccountingSellerWorkingRow) {
  return BigInt(sale.dispatchQuantity) === BigInt(row.dispatchQuantity) &&
    BigInt(sale.morningReturnQuantity) === BigInt(row.morningReturnQuantity) &&
    BigInt(sale.dayReturnQuantity) === BigInt(row.dayReturnQuantity) &&
    BigInt(sale.eveningReturnQuantity) === BigInt(row.eveningReturnQuantity) &&
    sale.commissionPaise === rupeesToPaise(row.commissionRupees);
}

/** Only draft retry is allowed. Payments/posted accounting are never deleted or corrected here. */
export async function recoverSellerEntry(context: Context, displayed: AccountingSellerWorkingRecord, mode: RecoveryMode, reviewed?: RecoverySale | null) {
  const { scope, store, active } = context;
  if (scope.ownerKind !== 'PUBLIC_USER' || !store.resolveSellerRecovery || !store.getSellerSyncOperation) throw new Error('RECOVERY_UNAVAILABLE');
  const current = (await store.listSellerRows(scope)).find(record => record.key === displayed.key);
  if (!current || JSON.stringify(inputRow(current.row)) !== JSON.stringify(inputRow(displayed.row))) throw new Error('RECOVERY_LOCAL_CHANGED');
  if (current.partyId !== current.row.partyId) throw new Error('RECOVERY_SCOPE_INVALID');
  if (current.syncState === 'SYNCING' || current.syncState === 'LOCAL_SAVED') throw new Error('RECOVERY_BUSY');
  const operation = await store.getSellerSyncOperation(scope, current.occurredAt, current.partyId);
  const workspace = await context.read();
  if (!active() || workspace.organization.id !== scope.organizationId || workspace.organization.userLedgerStorage !== 'CLOUD') throw new Error('RECOVERY_SCOPE_INVALID');
  const sale = serverRow(workspace, current, mode === 'retry');
  if (mode === 'keep-local') await keepPhoneValues(context, current, operation, sale, reviewed);
  if (mode === 'retry' && (!sale || !sameValues(sale, current.row))) {
    validateRetry(current, operation, sale);
    await retryDraft(context, current, operation, sale);
  }
  if (!active()) throw new Error('RECOVERY_SCOPE_INVALID');
  context.beforeResolve?.();
  await store.resolveSellerRecovery(scope, current, operation, mode === 'discard' ? 'discarded' : 'confirmed');
  return mode === 'discard' ? 'discarded' : 'confirmed';
}

async function keepPhoneValues(context: Context, current: AccountingSellerWorkingRecord, operation: AccountingOutboxRecord | null,
  sale: ReturnType<typeof serverRow>, reviewed?: RecoverySale | null) {
  if (sale && sameValues(sale, current.row)) return;
  if (JSON.stringify(sale ?? null) !== JSON.stringify(reviewed ?? null)) throw new Error('RECOVERY_SERVER_CHANGED');
  if (sale && sale.status !== 'DRAFT') throw new Error('RECOVERY_POSTED_ENTRY');
  if (!operation) throw new Error('RECOVERY_OPERATION_MISSING');
  if (!sale && BigInt(current.row.dispatchQuantity) === 0n) throw new Error('RECOVERY_EMPTY');
  const revision = sale?.syncVersion ?? 0;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([operation.operationId, inputRow(current.row), sale?.id ?? '', revision]))));
  const hex = Array.from(bytes.slice(0,16), value=>value.toString(16).padStart(2,'0'));
  hex[6]='4'+hex[6].slice(1); hex[8]=((Number.parseInt(hex[8],16)&63)|128).toString(16);
  const id=hex.join('');
  const operationId=`${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
  await retryDraft(context, current, {...operation,operationId,expectedVersion:revision}, sale);
}

function validateRetry(current: AccountingSellerWorkingRecord, operation: AccountingOutboxRecord | null, sale: ReturnType<typeof serverRow>): asserts operation is AccountingOutboxRecord {
    if (!operation || JSON.stringify(inputRow(operation.payload)) !== JSON.stringify(inputRow(current.row))) throw new Error('RECOVERY_OPERATION_MISSING');
    if ((sale && (sale.status !== 'DRAFT' || sale.syncVersion !== operation.expectedVersion)) || (!sale && (current.row.saleId || operation.expectedVersion !== 0))) throw new SellerRecoveryConflict(sale);
  if (!sale && BigInt(current.row.dispatchQuantity) === 0n) throw new Error('RECOVERY_EMPTY');
}

async function retryDraft(context: Context, current: AccountingSellerWorkingRecord, operation: AccountingOutboxRecord, sale: ReturnType<typeof serverRow>) {
  const { scope, api, active } = context;
    const row = current.row;
    const payload = { organizationId: scope.organizationId, partyId: row.partyId, periodId: null,
      occurredAt: accountingBusinessDate(current.occurredAt), dispatchQuantity: row.dispatchQuantity,
      morningReturnQuantity: row.morningReturnQuantity, dayReturnQuantity: row.dayReturnQuantity,
      eveningReturnQuantity: row.eveningReturnQuantity, commissionPaise: rupeesToPaise(row.commissionRupees),
      operationId: operation.operationId, expectedVersion: operation.expectedVersion,
      ...(!sale && row.replacesVoidId ? { replacesVoidId: row.replacesVoidId } : {}) };
    if (!active()) throw new Error('RECOVERY_SCOPE_INVALID');
    if (sale) await api.updateDailySellerDraft(sale.id, payload);
    else await api.saveDailySellerDraft(payload);
    const verified = await context.read();
    if (verified.organization.id !== scope.organizationId) throw new Error('RECOVERY_SCOPE_INVALID');
    sale = serverRow(verified, current, false);
    if (!sale || !sameValues(sale, row)) throw new Error('RECOVERY_NOT_CONFIRMED');

}
