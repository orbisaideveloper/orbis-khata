import { readOnlineLotteryExport } from '../accounting/api';
import { createLotteryStore, decodeLottery, validateLotteryTransferState } from './domain-store';
import { createLotteryAccountingService, serialize } from '../../vendor/foundation-lottery/runtime/lottery-accounting-service.js';
import { accountingBusinessDate } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingBusinessDate';
import { rupeesToPaise } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingMoney';
import type { AccountingOutboxRecord, AccountingLocalScope, AccountingSellerWorkingRecord, AccountingSellerWorkingRow, LotteryAccountingLocalStore } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore';
import type { LotteryAccountingClient } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingClient';
import type { LotteryWorkspace } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes';

type RecoveryMode = 'retry' | 'discard';
type Context = { scope: AccountingLocalScope; store: LotteryAccountingLocalStore; api: LotteryAccountingClient;
  read: () => Promise<LotteryWorkspace>; active: () => boolean; beforeResolve?: () => void };

/** Uses the existing read-only export; recurring-expense materialization is disabled. */
export async function readSellerRecoveryWorkspace(actor: string, organizationId: string): Promise<LotteryWorkspace> {
  const payload = await readOnlineLotteryExport(actor) as { actor?: string; version?: number; state?: unknown } | null;
  if (payload?.actor !== actor || payload.version !== 1) throw new Error('RECOVERY_SCOPE_INVALID');
  validateLotteryTransferState(payload.state);
  const store = createLotteryStore(decodeLottery(payload.state));
  const service = createLotteryAccountingService({ prisma: store.client });
  return serialize(await service.getWorkspace({ organizationId }, { materializeRecurringExpenses: false })) as LotteryWorkspace;
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

function serverRow(workspace: LotteryWorkspace, record: AccountingSellerWorkingRecord, requireIdentity = true) {
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
export async function recoverSellerEntry(context: Context, displayed: AccountingSellerWorkingRecord, mode: RecoveryMode) {
  const { scope, store, active } = context;
  if (scope.ownerKind !== 'PUBLIC_USER' || !store.resolveSellerRecovery || !store.getSellerSyncOperation) throw new Error('RECOVERY_UNAVAILABLE');
  const current = (await store.listSellerRows(scope)).find(record => record.key === displayed.key);
  if (!current || JSON.stringify(inputRow(current.row)) !== JSON.stringify(inputRow(displayed.row))) throw new Error('RECOVERY_LOCAL_CHANGED');
  if (current.partyId !== current.row.partyId) throw new Error('RECOVERY_SCOPE_INVALID');
  if (current.syncState === 'SYNCING' || current.syncState === 'LOCAL_SAVED') throw new Error('RECOVERY_BUSY');
  const operation = await store.getSellerSyncOperation(scope, current.occurredAt, current.partyId);
  const workspace = await context.read();
  if (!active() || workspace.organization.id !== scope.organizationId || workspace.organization.userLedgerStorage !== 'CLOUD') throw new Error('RECOVERY_SCOPE_INVALID');
  const sale = serverRow(workspace, current, mode !== 'discard');
  if (mode === 'retry' && (!sale || !sameValues(sale, current.row))) {
    validateRetry(current, operation, sale);
    await retryDraft(context, current, operation, sale);
  }
  if (!active()) throw new Error('RECOVERY_SCOPE_INVALID');
  context.beforeResolve?.();
  await store.resolveSellerRecovery(scope, current, operation, mode === 'discard' ? 'discarded' : 'confirmed');
  return mode === 'discard' ? 'discarded' : 'confirmed';
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
      ...(row.replacesVoidId ? { replacesVoidId: row.replacesVoidId } : {}) };
    if (!active()) throw new Error('RECOVERY_SCOPE_INVALID');
    if (sale) await api.updateDailySellerDraft(sale.id, payload);
    else await api.saveDailySellerDraft(payload);
    const verified = await context.read();
    if (verified.organization.id !== scope.organizationId) throw new Error('RECOVERY_SCOPE_INVALID');
    sale = serverRow(verified, current);
    if (!sale || !sameValues(sale, row)) throw new Error('RECOVERY_NOT_CONFIRMED');

}
