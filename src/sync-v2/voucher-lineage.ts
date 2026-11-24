import { commandDigest, type Command } from './command.ts'
import type { createLocalFeed } from './local-feed.ts'

type VoucherReceipt = { digest: string; sequence: string; result: { entityId: string } }

/** Verifies the committed projection even when the historic feed has no operation ID. */
export async function confirmVoucherProjection(
  command: Command,
  receipt: VoucherReceipt,
  ledger: Pick<ReturnType<typeof createLocalFeed>, 'appliedEvent'>,
): Promise<boolean> {
  if (command.scope.kind !== 'company' || command.commandType !== 'khata-post' ||
      receipt.result?.entityId !== command.entityId || receipt.digest !== await commandDigest(command)) {
    throw new Error('SYNC_VOUCHER_RECEIPT_MISMATCH')
  }
  const event = await ledger.appliedEvent(receipt.sequence)
  if (!event || event.seq !== receipt.sequence ||
      (event.operationId !== null && event.operationId !== command.operationId) ||
      !Array.isArray(event.change)) return false

  // Older writes keep a null operationId, but the receipt points to their immutable
  // scoped voucher event. Compare the company, voucher identity and stored money.
  const payload = command.payload as { kind: string; date: string; amount: string; party: string; reverses: string | null } | null
  return event.change.some(change => {
    if (change === null || typeof change !== 'object' || !('entityType' in change) ||
        change.entityType !== 'voucher' || !('entityId' in change) || change.entityId !== command.entityId ||
        !('projectionJson' in change) || typeof change.projectionJson !== 'string') return false
    const row = JSON.parse(change.projectionJson) as { id?: string; company_id?: string; party_id?: string;
      kind?: string; amount_minor?: number | string; effective_date?: string; reverses_id?: string | null } | null
    return row !== null && row.id === command.entityId && row.company_id === command.scope.id &&
      row.party_id === payload?.party && row.kind === payload?.kind && payload !== null && /^\d{1,12}$/u.test(payload.amount) &&
      String(row.amount_minor) === String(BigInt(payload.amount)) && row.effective_date === payload.date &&
      row.reverses_id === payload.reverses
  })
}
