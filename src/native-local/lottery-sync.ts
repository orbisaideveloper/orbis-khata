import { readOnlineLotteryExport } from '../accounting/api'
import { getLotteryAccountingLocalStore } from '../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore'

const pending = new Map<string, Promise<{ changed: boolean }>>()

/** Seller working rows live outside the encrypted projection until they are committed. */
async function checkWorkingRows(actor: string, organizations: string[]) {
  const store = getLotteryAccountingLocalStore()
  if (!store) throw new Error('LOTTERY_SYNC_WORKING_STORAGE_UNAVAILABLE')
  await Promise.all(organizations.map(async organization => {
    const scope = { ownerKind: 'PUBLIC_USER' as const, ownerId: actor, organizationId: organization }
    const [rows, outbox] = await Promise.all([store.listSellerRows(scope), store.listPendingOutbox(scope)])
    if (outbox.length || rows.some(row => row.syncState !== 'SYNCED')) {
      throw new Error('LOTTERY_SYNC_PENDING_ROWS')
    }
  }))
}

export function syncWebLottery(actor: string) {
  const existing = pending.get(actor)
  if (existing) return existing
  const task = (async () => {
    const payload = await readOnlineLotteryExport(actor)
    if (!payload || typeof payload !== 'object' || !('state' in payload) || !payload.state || typeof payload.state !== 'object') {
      throw new Error('LOTTERY_EXPORT_INVALID')
    }
    const runtime = await import('./runtime')
    const local = await runtime.readNativeLotterySyncState(actor)
    const state = payload.state as Record<string, unknown>
    const rows = state.foundationAccountingOrganization
    if (rows !== undefined && !Array.isArray(rows)) throw new Error('LOTTERY_EXPORT_INVALID')
    const remote = (rows ?? []).map((row: { id?: unknown }) => {
      if (!row || typeof row.id !== 'string') throw new Error('LOTTERY_EXPORT_INVALID')
      return row.id
    })
    await checkWorkingRows(actor, [...new Set([...local.organizations, ...remote])])
    const result = await runtime.syncNativeLottery(actor, payload)
    if (result.changed) window.dispatchEvent(new Event('khata-lottery-synced'))
    return result
  })().finally(() => pending.delete(actor))
  pending.set(actor, task)
  return task
}
