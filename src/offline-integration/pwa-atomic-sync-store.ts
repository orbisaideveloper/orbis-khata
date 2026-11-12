/**
 * Step 04-06 integrated PWA storage: encrypted, account/company-scoped outbox,
 * atomic receipt replacement and atomic ordered-feed/cursor transactions.
 * Not imported by live accounting; network and central authentication remain explicit ports.
 * The caller must supply an already-persisted, nonextractable AES-GCM account key.
 */
import { sealQueueItem, unsealQueueItem, type SealedQueueItem } from '../sync/encrypted-record'
import type { QueueItem } from '../sync/outbox-state'
import { parseContiguousFeed, type FeedEvent, type SyncStore } from '../offline-batch/sync-coordinator'

const OUTBOX = 'sealed-outbox'
const FEED = 'sealed-feed'
const CURSORS = 'cursors'
const BY_SCOPE = 'by-scope'
const BY_EVENT = 'by-event'
const MAX_FEED = 131072
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const validId = (x: unknown): x is string => typeof x === 'string' && /^[\w-]{1,128}$/u.test(x)
const scope = (actor: string, company: string) => {
  if (!validId(actor) || !validId(company)) throw Error('ATOMIC_SYNC_SCOPE_INVALID')
  return JSON.stringify([actor, company])
}
const rowId = (sc: string, id: string) => sc + ':' + id
const ownedBuffer = (value: Uint8Array): ArrayBuffer => {
  const result = new ArrayBuffer(value.byteLength)
  new Uint8Array(result).set(value)
  return result
}
const utf8ToB64 = (bytes: Uint8Array): string => {
  let raw = ''
  for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(raw)
}
const b64ToBytes = (text: string, limit: number): Uint8Array => {
  if (typeof text !== 'string' || text.length > limit || !/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/u.test(text)) {
    throw Error('ATOMIC_SYNC_CIPHERTEXT_INVALID')
  }
  return Uint8Array.from(atob(text), ch => ch.charCodeAt(0))
}

type QueueRow = { id: string; scope: string; sealed: SealedQueueItem }
type FeedRow = { id: string; scope: string; eventUnique: string; seq: number; eventId: string; nonce: string; ciphertext: string }
type CursorRow = { scope: string; value: number }
type Provider = Pick<Crypto, 'subtle' | 'getRandomValues'>

export function createPwaAtomicSyncStore(args: {
  factory: IDBFactory
  provider: Provider
  key: CryptoKey
  databaseName: string
}): SyncStore & {
  append(item: QueueItem): Promise<'created' | 'already-present'>
  readFeed(actorId: string, companyId: string): Promise<readonly FeedEvent[]>
} {
  if (!/^[a-zA-Z0-9._-]{1,128}$/u.test(args.databaseName)) throw Error('ATOMIC_SYNC_DB_NAME_INVALID')
  if (args.key.extractable || args.key.algorithm.name !== 'AES-GCM' || args.key.type !== 'secret' ||
      !args.key.usages.includes('encrypt') || !args.key.usages.includes('decrypt')) {
    throw Error('ATOMIC_SYNC_KEY_INVALID')
  }
  let opening: Promise<IDBDatabase> | undefined
  const open = (): Promise<IDBDatabase> => {
    if (opening) return opening
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const req = args.factory.open(args.databaseName, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'id' }).createIndex(BY_SCOPE, 'scope')
        if (!db.objectStoreNames.contains(FEED)) {
          const store = db.createObjectStore(FEED, { keyPath: 'id' })
          store.createIndex(BY_SCOPE, 'scope')
          store.createIndex(BY_EVENT, 'eventUnique', { unique: true })
        }
        if (!db.objectStoreNames.contains(CURSORS)) db.createObjectStore(CURSORS, { keyPath: 'scope' })
      }
      req.onerror = () => reject(req.error ?? Error('ATOMIC_SYNC_OPEN_FAILED'))
      req.onblocked = () => reject(Error('ATOMIC_SYNC_OPEN_BLOCKED'))
      req.onsuccess = () => {
        const db = req.result
        if (![OUTBOX, FEED, CURSORS].every(s => db.objectStoreNames.contains(s))) {
          db.close(); reject(Error('ATOMIC_SYNC_SCHEMA_MISMATCH')); return
        }
        db.onversionchange = () => { db.close(); opening = undefined }
        resolve(db)
      }
    }).catch(error => { opening = undefined; throw error })
    return opening
  }
  const read = async <T>(name: string, request: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(name, 'readonly')
      const req = request(tx.objectStore(name))
      let value: T
      req.onsuccess = () => { value = req.result }
      tx.oncomplete = () => resolve(value)
      tx.onabort = () => reject(tx.error ?? Error('ATOMIC_SYNC_READ_ABORTED'))
      tx.onerror = () => { /* onabort is authoritative */ }
    })
  }
  const decode = async (row: QueueRow, actor: string, company: string): Promise<QueueItem> => {
    const sc = scope(actor, company)
    if (row.scope !== sc || row.id !== rowId(sc, row.sealed.operationId)) throw Error('ATOMIC_SYNC_ROW_SCOPE_MISMATCH')
    return unsealQueueItem(row.sealed, args.key, args.provider, actor, company)
  }
  const sealEvent = async (actor: string, company: string, event: FeedEvent): Promise<FeedRow> => {
    const sc = scope(actor, company)
    const serialized = JSON.stringify(event)
    if (serialized.length > MAX_FEED) throw Error('ATOMIC_SYNC_EVENT_TOO_LARGE')
    const nonce = args.provider.getRandomValues(new Uint8Array(12))
    const aad = encoder.encode(JSON.stringify(['orbis.khata.feed.v1', actor, company, event.serverSeq, event.eventId]))
    const ct = await args.provider.subtle.encrypt({ name: 'AES-GCM', iv: ownedBuffer(nonce), additionalData: ownedBuffer(aad), tagLength: 128 },
      args.key, ownedBuffer(encoder.encode(serialized)))
    return { id: rowId(sc, String(event.serverSeq)), scope: sc, eventUnique: JSON.stringify([sc, event.eventId]),
      seq: event.serverSeq, eventId: event.eventId,
      nonce: utf8ToB64(nonce), ciphertext: utf8ToB64(new Uint8Array(ct)) }
  }
  const decodeEvent = async (actor: string, company: string, row: FeedRow): Promise<FeedEvent> => {
    const sc = scope(actor, company)
    if (row.scope !== sc || row.id !== rowId(sc, String(row.seq))) throw Error('ATOMIC_SYNC_FEED_SCOPE_MISMATCH')
    const nonce = b64ToBytes(row.nonce, 24)
    const ct = b64ToBytes(row.ciphertext, 200000)
    const aad = encoder.encode(JSON.stringify(['orbis.khata.feed.v1', actor, company, row.seq, row.eventId]))
    const plain = await args.provider.subtle.decrypt({ name: 'AES-GCM', iv: ownedBuffer(nonce), additionalData: ownedBuffer(aad), tagLength: 128 }, args.key, ownedBuffer(ct))
    const event = JSON.parse(decoder.decode(plain)) as FeedEvent
    if (event.companyId !== company || event.serverSeq !== row.seq || event.eventId !== row.eventId) throw Error('ATOMIC_SYNC_FEED_TAMPERED')
    return event
  }
  return {
    async append(item) {
      if (item.state !== 'queued' || item.attempts !== 0 || item.serverCursor !== null) throw Error('ATOMIC_SYNC_APPEND_INVALID')
      const { actorId, companyId, operationId } = item.envelope
      const sc = scope(actorId, companyId)
      const value: QueueRow = { id: rowId(sc, operationId), scope: sc,
        sealed: await sealQueueItem(item, args.key, args.provider) }
      const db = await open()
      const inserted = await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(OUTBOX, 'readwrite')
        const store = tx.objectStore(OUTBOX)
        let duplicate = false
        const req = store.get(value.id)
        req.onsuccess = () => { if (req.result) duplicate = true; else store.add(value) }
        tx.oncomplete = () => resolve(!duplicate)
        tx.onabort = () => reject(tx.error ?? Error('ATOMIC_SYNC_APPEND_ABORTED'))
        tx.onerror = () => { /* onabort */ }
      })
      if (inserted) return 'created'
      const old = await read<QueueRow>(OUTBOX, s => s.get(value.id))
      if (!old) throw Error('ATOMIC_SYNC_DUPLICATE_UNCERTAIN')
      const recovered = await decode(old, actorId, companyId)
      if (JSON.stringify(recovered.envelope) !== JSON.stringify(item.envelope)) throw Error('IDEMPOTENCY_CONFLICT')
      return 'already-present'
    },
    async pending(actorId, companyId) {
      const sc = scope(actorId, companyId)
      const rows = await read<QueueRow[]>(OUTBOX, s => s.index(BY_SCOPE).getAll(sc))
      const result = await Promise.all(rows.map(r => decode(r, actorId, companyId)))
      return result.filter(r => r.state === 'queued').sort((a, b) => a.envelope.createdAt.localeCompare(b.envelope.createdAt) ||
        a.envelope.operationId.localeCompare(b.envelope.operationId))
    },
    async persistAttempt(actorId, companyId, next) {
      const sc = scope(actorId, companyId)
      if (next.envelope.actorId !== actorId || next.envelope.companyId !== companyId) throw Error('ATOMIC_SYNC_RECEIPT_SCOPE')
      const id = rowId(sc, next.envelope.operationId)
      const current = await read<QueueRow | undefined>(OUTBOX, s => s.get(id))
      if (!current) throw Error('ATOMIC_SYNC_RECEIPT_ROW_MISSING')
      const before = await decode(current, actorId, companyId)
      if (before.state !== 'queued' || next.attempts !== before.attempts + 1 ||
          JSON.stringify(before.envelope) !== JSON.stringify(next.envelope)) throw Error('ATOMIC_SYNC_RECEIPT_TRANSITION_INVALID')
      const replacement: QueueRow = { id, scope: sc, sealed: await sealQueueItem(next, args.key, args.provider) }
      const db = await open()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(OUTBOX, 'readwrite')
        const store = tx.objectStore(OUTBOX)
        const req = store.get(id)
        req.onsuccess = () => {
          const row = req.result as QueueRow | undefined
          if (!row || row.sealed.nonce !== current.sealed.nonce || row.sealed.ciphertext !== current.sealed.ciphertext) {
            tx.abort(); return
          }
          store.put(replacement)
        }
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error ?? Error('ATOMIC_SYNC_CONCURRENT_RECEIPT_ABORT'))
        tx.onerror = () => { /* onabort */ }
      })
    },
    async cursor(actorId, companyId) {
      const sc = scope(actorId, companyId)
      const row = await read<CursorRow | undefined>(CURSORS, s => s.get(sc))
      if (!row) return 0
      if (!Number.isSafeInteger(row.value) || row.value < 0) throw Error('ATOMIC_SYNC_CURSOR_CORRUPT')
      return row.value
    },
    async commitFeedPage(actorId, companyId, page) {
      const sc = scope(actorId, companyId)
      const checked = parseContiguousFeed(page, companyId, page.fromCursor)
      const rows = await Promise.all(checked.events.map(e => sealEvent(actorId, companyId, e)))
      const db = await open()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([FEED, CURSORS], 'readwrite')
        const cursorStore = tx.objectStore(CURSORS)
        const req = cursorStore.get(sc)
        req.onsuccess = () => {
          const prior = (req.result as CursorRow | undefined)?.value ?? 0
          if (prior !== checked.fromCursor) { tx.abort(); return }
          for (const row of rows) tx.objectStore(FEED).add(row)
          cursorStore.put({ scope: sc, value: checked.nextCursor })
        }
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error ?? Error('ATOMIC_SYNC_FEED_TRANSACTION_ABORT'))
        tx.onerror = () => { /* onabort */ }
      })
    },
    async readFeed(actorId, companyId) {
      const sc = scope(actorId, companyId)
      const rows = await read<FeedRow[]>(FEED, s => s.index(BY_SCOPE).getAll(sc))
      rows.sort((a, b) => a.seq - b.seq)
      const result = await Promise.all(rows.map(r => decodeEvent(actorId, companyId, r)))
      for (let i = 0; i < result.length; i++) {
        if (result[i].serverSeq !== i + 1) throw Error('ATOMIC_SYNC_FEED_GAP')
      }
      return result
    },
  }
}
