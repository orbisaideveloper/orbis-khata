/** Browser-only IndexedDB adapter for future encrypted local outbox.
 * Stores only non-financial scope IDs and AES-GCM sealed ciphertext.
 * Does not alter old browser sessionStorage or contact the cloud.
 */
import type { SealedQueuePort, StoredQueueRow } from './durable-outbox'
const STORE = 'encrypted-outbox'
const SCOPE = 'by-scope'
const VERSION = 1
const DEFAULT_DB = 'orbis-khata-offline-outbox-v1'

export function createIndexedDbQueuePort(
  factory: IDBFactory = indexedDB, databaseName: string = DEFAULT_DB,
): SealedQueuePort {
  if (!/^[a-zA-Z0-9._-]{1,128}$/u.test(databaseName)) throw new Error('OUTBOX_DB_NAME_INVALID')
  let opening: Promise<IDBDatabase> | undefined
  function open(): Promise<IDBDatabase> {
    if (opening) return opening
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' }).createIndex(SCOPE, 'scope', { unique: false })
        }
      }
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.close()
          reject(new Error('OUTBOX_SCHEMA_INVALID'))
          return
        }
        db.onversionchange = () => { db.close(); opening = undefined }
        resolve(db)
      }
      request.onerror = () => reject(request.error ?? new Error('OUTBOX_OPEN_FAILED'))
      request.onblocked = () => reject(new Error('OUTBOX_UPGRADE_BLOCKED'))
    })
    return opening
  }
  function read<T>(makeRequest: (db: IDBDatabase) => IDBRequest<T>): Promise<T> {
    return open().then(db => new Promise<T>((resolve, reject) => {
      let req: IDBRequest<T>
      try { req = makeRequest(db) } catch (error) { reject(error); return }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('OUTBOX_READ_FAILED'))
    }))
  }
  return {
    async add(row: StoredQueueRow): Promise<boolean> {
      const db = await open()
      return new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        let duplicate = false
        const request = tx.objectStore(STORE).add(row)
        request.onerror = event => {
          if (request.error?.name === 'ConstraintError') {
            duplicate = true
            event.preventDefault() // Keep transaction alive, do not replace existing ciphertext.
          }
        }
        tx.oncomplete = () => resolve(!duplicate)
        tx.onabort = () => reject(tx.error ?? new Error('OUTBOX_WRITE_ABORTED'))
        tx.onerror = () => { /* onabort provides authoritative transaction failure */ }
      })
    },
    get(id: string): Promise<StoredQueueRow | null> {
      return read<StoredQueueRow | undefined>(db => db.transaction(STORE, 'readonly')
        .objectStore(STORE).get(id)).then(value => value ?? null)
    },
    list(scope: string): Promise<readonly StoredQueueRow[]> {
      return read<StoredQueueRow[]>(db => db.transaction(STORE, 'readonly')
        .objectStore(STORE).index(SCOPE).getAll(scope))
    },
  }
}
