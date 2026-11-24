const database = 'orbis-khata-lottery-payment-attempt-v1'
const store = 'attempts'
const operationId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(database, 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore(store)
    request.onerror = () => reject(new Error('LOTTERY_PAYMENT_STORAGE_UNAVAILABLE'))
    request.onblocked = () => { blocked = true; reject(new Error('LOTTERY_PAYMENT_STORAGE_UNAVAILABLE')) }
    request.onsuccess = () => {
      const db = request.result
      if (blocked || !db.objectStoreNames.contains(store)) {
        db.close()
        reject(new Error('LOTTERY_PAYMENT_STORAGE_UNAVAILABLE'))
        return
      }
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

async function update(
  factory: IDBFactory, key: string,
  change: (current: string | undefined, rows: IDBObjectStore) => string,
): Promise<string> {
  const db = await open(factory)
  try {
    return await new Promise<string>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite', { durability: 'strict' })
      const rows = tx.objectStore(store)
      let result: string
      const request = rows.get(key)
      request.onsuccess = () => {
        const current: unknown = request.result
        if (current !== undefined && (typeof current !== 'string' || !operationId.test(current))) {
          tx.abort()
          return
        }
        try { result = change(current as string | undefined, rows) }
        catch { tx.abort() }
      }
      tx.onabort = () => reject(new Error('LOTTERY_PAYMENT_STORAGE_UNAVAILABLE'))
      tx.oncomplete = () => resolve(result)
    })
  } finally {
    db.close()
  }
}

/** Stable across reload, store reopen and tabs. Only the request fingerprint and ID persist. */
export function beginPaymentAttempt(factory: IDBFactory, key: string, legacyId?: string): Promise<string> {
  return update(factory, key, (current, rows) => {
    if (current) return current
    const id = legacyId && operationId.test(legacyId) ? legacyId : crypto.randomUUID()
    rows.add(id, key)
    return id
  })
}

/** A late response for an old attempt cannot clear a newer attempt. */
export async function confirmPaymentAttempt(factory: IDBFactory, key: string, id: string): Promise<void> {
  await update(factory, key, (current, rows) => {
    if (current === id) rows.delete(key)
    return id
  })
}
