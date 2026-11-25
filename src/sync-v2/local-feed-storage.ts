import type { SqlitePort } from '../local-db/sqlite-repository'
import type { NativeRecordCodec } from '../offline-integration/native-transactional-sync-store'
import type { LocalFeedCodec, LocalFeedStorage } from './local-feed'
import { forEachInOrder } from './ordered-work.ts'

const STORE = 'grouped-feed-v2'
type Row = { id: string; sealed: string }
const STALE = 'SYNC_LOCAL_STORAGE_CURSOR_CHANGED'

export function createLocalFeedCodec(envelope: NativeRecordCodec): LocalFeedCodec {
  return {
    async seal(json, context) {
      const bytes = await envelope.seal(json, context)
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCodePoint(...bytes.subarray(offset, offset + 8192))
      }
      return btoa(binary)
    },
    open(sealed, context) {
      return envelope.unseal(Uint8Array.from(atob(sealed), char => char.codePointAt(0)!), context)
    },
  }
}

/** Use the same verified, serialized SQLCipher connection as the local runtime. */
export async function openSqliteLocalFeedStorage(db: SqlitePort): Promise<LocalFeedStorage> {
  await db.run('CREATE TABLE IF NOT EXISTS sync_v2_feed_cells (id TEXT PRIMARY KEY NOT NULL, sealed TEXT NOT NULL)')
  async function read(id: string) {
    return (await db.get<Row>('SELECT sealed FROM sync_v2_feed_cells WHERE id=?', [id]))?.sealed ?? null
  }
  return {
    read,
    commit: (cursorId, previous, writes) => db.transaction(async () => {
      if (await read(cursorId) !== previous) throw new Error(STALE)
      await forEachInOrder(writes, async row => {
        const saved = await db.run(`INSERT INTO sync_v2_feed_cells(id,sealed) VALUES(?,?)
          ON CONFLICT(id) DO UPDATE SET sealed=excluded.sealed`, [row.id, row.sealed])
        if (saved.changes !== 1) throw new Error('SYNC_LOCAL_STORAGE_WRITE_FAILED')
      })
    }),
  }
}

/** Use a versioned companion name so older PWA tabs can still open their v1 stores. */
export async function openIndexedDbLocalFeedStorage(factory: IDBFactory, databaseName: string): Promise<LocalFeedStorage & { close(): void }> {
  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(databaseName)) throw new Error('SYNC_LOCAL_STORAGE_DATABASE_NAME')
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const opening = factory.open(databaseName + '.grouped-feed-v2', 1)
    let blocked = false
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE)) opening.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    opening.onblocked = () => { blocked = true; reject(new Error('SYNC_LOCAL_STORAGE_UPGRADE_BLOCKED')) }
    opening.onerror = () => reject(opening.error ?? new Error('SYNC_LOCAL_STORAGE_OPEN_FAILED'))
    opening.onsuccess = () => {
      if (blocked || !opening.result.objectStoreNames.contains(STORE)) {
        opening.result.close()
        reject(new Error('SYNC_LOCAL_STORAGE_SCHEMA_INVALID'))
      } else {
        resolve(opening.result)
      }
    }
  })
  db.onversionchange = () => db.close()
  return {
    close: () => db.close(),
    read: id => new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
      request.onsuccess = () => resolve((request.result as Row | undefined)?.sealed ?? null)
      request.onerror = () => reject(request.error ?? new Error('SYNC_LOCAL_STORAGE_READ_FAILED'))
    }),
    commit: (cursorId, previous, writes) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite', { durability: 'strict' })
      const store = tx.objectStore(STORE)
      let failed: Error | null = null
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(failed ?? tx.error ?? new Error('SYNC_LOCAL_STORAGE_WRITE_FAILED'))
      const current = store.get(cursorId)
      current.onsuccess = () => {
        if (((current.result as Row | undefined)?.sealed ?? null) !== previous) {
          failed = new Error(STALE)
          tx.abort()
          return
        }
        try {
          for (const row of writes) store.put(row)
        } catch {
          failed = new Error('SYNC_LOCAL_STORAGE_WRITE_FAILED')
          tx.abort()
        }
      }
    }),
  }
}
