import { persistGroupedPage, type GroupedPage } from './grouped-feed.ts'
import { assembleRecoveryTransfer, type RecoveryTransfer, type RecoveryFragment } from './recovery-assembly.ts'
import type { Json, Scope } from './command.ts'

type Cursor = { epoch: string; sequence: string }
type InstalledCursor = Cursor & { image: string }
type Event = GroupedPage['groups'][number]['events'][number]
export type ScopedPage = GroupedPage & { scopeKind: string; scopeId: string }
type Cell = { id: string; sealed: string }

export interface LocalFeedStorage {
  read(id: string): Promise<string | null>
  /** Compare the exact authenticated cursor cell before committing every write. */
  commit(cursorId: string, previous: string | null, writes: readonly Cell[]): Promise<void>
}

export interface LocalFeedCodec {
  seal(json: string, context: string): Promise<string>
  open(sealed: string, context: string): Promise<string>
}

export type ProjectionChange = Readonly<{ collection: string; id: string; value: Json }>

const identifier = /^[A-Za-z0-9_-]{1,128}$/u

/** Store factory receives an already-authorized scope; local storage never grants access. */
export function createLocalFeed(
  actor: string, scope: Scope, storage: LocalFeedStorage, codec: LocalFeedCodec,
  project: (event: Event) => readonly ProjectionChange[],
) {
  if (![actor, scope.kind, scope.id, scope.epoch].every(value => identifier.test(value))) {
    throw new Error('SYNC_LOCAL_SCOPE_INVALID')
  }
  const partition = ['sync-v2', actor, scope.kind, scope.id, scope.epoch].join(':')
  const cursorId = partition + ':cursor'
  const { kind, id: scopeId, epoch } = scope
  // Hash the complete cell address to fit the existing Android hardware codec's AAD limit.
  async function context(id: string) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))
    return 'sync-v2:' + Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  const chunkLength = 48_000
  const chunkTag = 'chunks-v1:'
  const encoder = new TextEncoder()
  async function stage(writes: Map<string, string>, id: string, value: unknown) {
    const json = JSON.stringify(value)
    if (!json || encoder.encode(json).byteLength > 2_097_152) throw new Error('SYNC_LOCAL_RECORD_SIZE')
    const aad = await context(id)
    if (json.length <= chunkLength) {
      writes.set(id, await codec.seal(json, aad))
      return
    }
    const generation = crypto.randomUUID()
    let count = 0
    for (let start = 0; start < json.length;) {
      let end = Math.min(json.length, start + chunkLength)
      if (end < json.length && /[\uD800-\uDBFF]/u.test(json[end - 1])) end--
      const part = id + ':' + generation + ':' + count++
      writes.set(part, await codec.seal(json.slice(start, end), await context(part)))
      start = end
    }
    writes.set(id, chunkTag + await codec.seal(JSON.stringify({ generation, count }), aad))
  }
  async function read<T>(id: string, sealed: string): Promise<T> {
    const aad = await context(id)
    if (!sealed.startsWith(chunkTag)) return JSON.parse(await codec.open(sealed, aad)) as T
    const manifest = JSON.parse(await codec.open(sealed.slice(chunkTag.length), aad)) as { generation: string; count: number }
    if (!/^[0-9a-f-]{36}$/u.test(manifest.generation) ||
        !Number.isSafeInteger(manifest.count) || manifest.count < 2 || manifest.count > 45) {
      throw new Error('SYNC_LOCAL_CHUNK_MANIFEST')
    }
    const parts: string[] = []
    for (let index = 0; index < manifest.count; index++) {
      const part = id + ':' + manifest.generation + ':' + index
      const value = await storage.read(part)
      if (value === null) throw new Error('SYNC_LOCAL_CHUNK_MISSING')
      parts.push(await codec.open(value, await context(part)))
    }
    return JSON.parse(parts.join('')) as T
  }
  function projectionId(image: string, collection: string, id: string) {
    if (!identifier.test(collection) || typeof id !== 'string' || id.length < 1 || id.length > 256) {
      throw new Error('SYNC_LOCAL_PROJECTION_ID_INVALID')
    }
    return partition + ':projection:' + image + ':' + collection + ':' + encodeURIComponent(id)
  }
  async function apply(page: ScopedPage, recovered = false): Promise<void> {
    const candidate = structuredClone(page)
    if (candidate.scopeKind !== kind || candidate.scopeId !== scopeId) throw new Error('SYNC_LOCAL_WRONG_SCOPE')
    const previous = await storage.read(cursorId)
    if (previous === null) throw new Error('SYNC_LOCAL_SNAPSHOT_REQUIRED')
    const cursor = await read<InstalledCursor>(cursorId, previous)
    if (cursor.epoch !== epoch) throw new Error('SYNC_LOCAL_EPOCH_MISMATCH')
    await persistGroupedPage(candidate, cursor, {
      async transaction(prepare) {
        const writes = new Map<string, string>()
        await prepare({
          readCursor: async () => cursor,
          recordInbox: event => stage(writes, partition + ':inbox:' + cursor.image + ':' + event.seq, event),
          async project(event) {
            const changes = project(event)
            if (!changes.length) throw new Error('SYNC_LOCAL_PROJECTION_UNSUPPORTED')
            for (const row of changes) await stage(writes, projectionId(cursor.image, row.collection, row.id), row.value)
          },
          writeCursor: next => stage(writes, cursorId, { ...next, image: cursor.image }),
        })
        // Crypto precedes the atomic commit so IndexedDB cannot auto-commit during WebCrypto.
        await storage.commit(cursorId, previous, [...writes].map(([id, sealed]) => ({ id, sealed })))
      },
    }, recovered)
  }
  async function appliedEvent(sequence: string): Promise<Event | null> {
    if (!/^[1-9]\d{0,18}$/u.test(sequence)) throw new Error('SYNC_LOCAL_SEQUENCE_INVALID')
    const row = await storage.read(cursorId)
    if (row === null) return null
    const cursor = await read<InstalledCursor>(cursorId, row)
    if (BigInt(cursor.sequence) < BigInt(sequence)) return null
    const eventId = partition + ':inbox:' + cursor.image + ':' + sequence
    const event = await storage.read(eventId)
    return event === null ? null : read<Event>(eventId, event)
  }
  return {
    async cursor(): Promise<Cursor | null> {
      const row = await storage.read(cursorId)
      if (row === null) return null
      const { epoch, sequence } = await read<InstalledCursor>(cursorId, row)
      return { epoch, sequence }
    },
    appliedEvent,
    async appliedOperation(sequence: string) {
      return (await appliedEvent(sequence))?.operationId ?? null
    },
    // Scope bootstrap is separate. A null cursor cannot be treated as a complete empty snapshot.
    async installSnapshot(cursor: Cursor, snapshot: readonly ProjectionChange[], expected?: Cursor): Promise<void> {
      if (cursor.epoch !== epoch || !/^(0|[1-9][0-9]{0,18})$/u.test(cursor.sequence)) {
        throw new Error('SYNC_LOCAL_SNAPSHOT_CURSOR_INVALID')
      }
      if (snapshot.length > 16000) throw new Error('SYNC_LOCAL_SNAPSHOT_SIZE')
      const rows = structuredClone(snapshot)
      const next: InstalledCursor = { epoch, sequence: cursor.sequence, image: crypto.randomUUID() }
      const previous = expected ? await storage.read(cursorId) : null
      if (expected) {
        const current = previous === null ? null : await read<InstalledCursor>(cursorId, previous)
        if (current?.epoch !== expected.epoch || current.sequence !== expected.sequence ||
            BigInt(next.sequence) < BigInt(current.sequence)) throw new Error('SYNC_LOCAL_SNAPSHOT_STALE')
      }
      const writes = new Map<string, string>()
      await stage(writes, cursorId, next)
      for (const row of rows) {
        const id = projectionId(next.image, row.collection, row.id)
        if (writes.has(id)) throw new Error('SYNC_LOCAL_SNAPSHOT_DUPLICATE')
        await stage(writes, id, row.value)
      }
      await storage.commit(cursorId, previous, [...writes].map(([id, sealed]) => ({ id, sealed })))
    },
    async projection(collection: string, entity: string): Promise<Json | undefined> {
      const marker = await storage.read(cursorId)
      if (marker === null) return undefined
      const { image } = await read<InstalledCursor>(cursorId, marker)
      const id = projectionId(image, collection, entity)
      const row = await storage.read(id)
      return row === null ? undefined : read<Json>(id, row)
    },
    apply: (page: ScopedPage) => apply(page),
    async recoverGroup(manifest: RecoveryTransfer, fragment: (item: number, offset: number) => Promise<RecoveryFragment>) {
      const metadata = { ...manifest }
      const marker = await storage.read(cursorId)
      if (marker === null) throw new Error('SYNC_LOCAL_SNAPSHOT_REQUIRED')
      const from = (await read<InstalledCursor>(cursorId, marker)).sequence
      const assembled = await assembleRecoveryTransfer(metadata, { purpose: 'group', scopeKind: kind, scopeId, epoch, from }, fragment)
      const events = assembled.map(row => {
        if (!row || typeof row !== 'object' || !('seq' in row) || typeof row.seq !== 'string' ||
            !('operationId' in row) || (row.operationId !== null && typeof row.operationId !== 'string') ||
            !('change' in row)) throw new Error('SYNC_LOCAL_RECOVERY_EVENT_INVALID')
        return { seq: row.seq, operationId: row.operationId, change: row.change }
      })
      await apply({ scopeKind: kind, scopeId, epoch, from, next: metadata.next,
        groups: [{ first: events[0].seq, last: metadata.next, events }] }, true)
    },
  }
}
