/**
 * Future offline PWA encrypted queue facade. Not connected to accounting UI.
 * The caller must provide a securely managed non-extractable AES-GCM CryptoKey;
 * neither this module nor IndexedDB makes the encryption key recoverable.
 * Do not treat local persistence as server acknowledgement or financial backup.
 */
import { sealQueueItem, unsealQueueItem, type SealedQueueItem } from './encrypted-record'
import type { QueueItem } from './outbox-state'

export type StoredQueueRow = Readonly<{
  id: string
  scope: string
  sealed: SealedQueueItem
}>
export type SealedQueuePort = Readonly<{
  add(row: StoredQueueRow): Promise<boolean>
  get(id: string): Promise<StoredQueueRow | null>
  list(scope: string): Promise<readonly StoredQueueRow[]>
}>
type Provider = Pick<Crypto, 'subtle' | 'getRandomValues'>
const opaque = (value: string): boolean => /^[\w-]{1,128}$/u.test(value)
const scopeKey = (actorId: string, companyId: string) => JSON.stringify([actorId, companyId])
const itemKey = (actorId: string, companyId: string, operationId: string) => JSON.stringify([actorId, companyId, operationId])

/** No deletion/compaction yet: never discard uncertain financial commands. */
export function createDurableEncryptedOutbox(port: SealedQueuePort, key: CryptoKey, cryptoProvider: Provider) {
  function checkScope(actorId: string, companyId: string) {
    if (!opaque(actorId) || !opaque(companyId)) throw new Error('OUTBOX_INVALID_SCOPE')
  }
  async function openRow(row: StoredQueueRow, actorId: string, companyId: string): Promise<QueueItem> {
    if (row.scope !== scopeKey(actorId, companyId) ||
        row.id !== itemKey(row.sealed.actorId, row.sealed.companyId, row.sealed.operationId)) {
      throw new Error('OUTBOX_ROW_SCOPE_MISMATCH')
    }
    return unsealQueueItem(row.sealed, key, cryptoProvider, actorId, companyId)
  }
  return {
    async append(item: QueueItem): Promise<'created' | 'already-present'> {
      const { actorId, companyId, operationId } = item.envelope
      checkScope(actorId, companyId)
      const row: StoredQueueRow = {
        id: itemKey(actorId, companyId, operationId),
        scope: scopeKey(actorId, companyId),
        sealed: await sealQueueItem(item, key, cryptoProvider),
      }
      if (await port.add(row)) return 'created'
      const stored = await port.get(row.id)
      if (!stored) throw new Error('OUTBOX_CONCURRENT_WRITE_UNCERTAIN')
      const old = await openRow(stored, actorId, companyId)
      if (JSON.stringify(old.envelope) !== JSON.stringify(item.envelope)) throw new Error('IDEMPOTENCY_CONFLICT')
      return 'already-present'
    },
    async load(actorId: string, companyId: string, operationId: string): Promise<QueueItem | null> {
      checkScope(actorId, companyId)
      const stored = await port.get(itemKey(actorId, companyId, operationId))
      return stored ? openRow(stored, actorId, companyId) : null
    },
    async list(actorId: string, companyId: string): Promise<readonly QueueItem[]> {
      checkScope(actorId, companyId)
      const rows = await port.list(scopeKey(actorId, companyId))
      const items = await Promise.all(rows.map(row => openRow(row, actorId, companyId)))
      return items.sort((a, b) => a.envelope.createdAt.localeCompare(b.envelope.createdAt) ||
        a.envelope.operationId.localeCompare(b.envelope.operationId))
    },
  }
}
