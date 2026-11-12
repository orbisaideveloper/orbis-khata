/**
 * Browser PWA key vault, separate from native SQLCipher. Persists a nonextractable
 * AES-GCM CryptoKey as a structured clone in IndexedDB, not a JS storage string.
 * Deleting browser storage can destroy key access: encrypted user backup is later.
 * No live accounting writes or cloud I/O are enabled by this module.
 */
const STORE = 'keys'
const VERSION = 1
const DEFAULT_DB = 'orbis-khata-offline-key-v1'
function validPwaKey(key: CryptoKey): boolean {
  return Boolean(key) && key.type === 'secret' && key.algorithm?.name === 'AES-GCM' &&
    key.extractable === false && key.usages.includes('encrypt') && key.usages.includes('decrypt')
}
export function createPwaCryptoVault(factory: IDBFactory, cryptoProvider: Pick<Crypto, 'subtle'>, dbName: string = DEFAULT_DB) {
  if (!/^[a-zA-Z0-9._-]{1,128}$/u.test(dbName)) throw new Error('PWA_VAULT_NAME_INVALID')
  let opening: Promise<IDBDatabase> | undefined
  const open = (): Promise<IDBDatabase> => {
    if (opening) return opening
    opening = new Promise((resolve, reject) => {
      const req = factory.open(dbName, VERSION)
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE) }
      req.onerror = () => reject(req.error ?? new Error('PWA_VAULT_OPEN_FAILED'))
      req.onblocked = () => reject(new Error('PWA_VAULT_UPGRADE_BLOCKED'))
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) { db.close(); reject(new Error('PWA_VAULT_SCHEMA_INVALID')); return }
        db.onversionchange = () => { db.close(); opening = undefined }
        resolve(db)
      }
    })
    return opening
  }
  const read = async (scope: string): Promise<CryptoKey | undefined> => {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(scope)
      req.onsuccess = () => resolve(req.result as CryptoKey | undefined)
      req.onerror = () => reject(req.error ?? new Error('PWA_VAULT_READ_FAILED'))
    })
  }
  return {
    async keyForAccount(actorId: string): Promise<CryptoKey> {
      if (!/^[\w-]{1,128}$/u.test(actorId)) throw new Error('PWA_ACCOUNT_INVALID')
      const keyId = `actor:${actorId}`
      const old = await read(keyId)
      if (old !== undefined) {
        if (!validPwaKey(old)) throw new Error('PWA_VAULT_KEY_INVALID')
        return old
      }
      const newKey = await cryptoProvider.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      if (!validPwaKey(newKey)) throw new Error('PWA_VAULT_KEY_INVALID')
      const db = await open()
      const didWrite = await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        let duplicate = false
        const req = tx.objectStore(STORE).add(newKey, keyId)
        req.onerror = e => { if (req.error?.name === 'ConstraintError') { duplicate = true; e.preventDefault() } }
        tx.oncomplete = () => resolve(!duplicate)
        tx.onabort = () => reject(tx.error ?? new Error('PWA_VAULT_SAVE_FAILED'))
      })
      const finalKey = didWrite ? newKey : await read(keyId)
      if (!finalKey || !validPwaKey(finalKey)) throw new Error('PWA_VAULT_KEY_INVALID')
      return finalKey
    },
  }
}
