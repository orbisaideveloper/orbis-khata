/** Platform distinction is explicit; Android must never use unencrypted Web SQLite. */
import { createIndexedDbQueuePort } from '../sync/indexeddb-port'
import { createDurableEncryptedOutbox } from '../sync/durable-outbox'
import { createPwaCryptoVault } from './pwa-crypto-vault'
export function chooseKhataOfflineStorage(platform: string): 'native-sqlcipher' | 'pwa-encrypted-indexeddb' {
  if (platform === 'android') return 'native-sqlcipher'
  if (platform === 'web') return 'pwa-encrypted-indexeddb'
  throw new Error('LOCAL_STORAGE_PLATFORM_UNSUPPORTED')
}
export async function createBrowserPwaOfflineOutbox(actorId: string, opts: {
  platform: string
  factory: IDBFactory
  cryptoProvider: Pick<Crypto, 'subtle' | 'getRandomValues'>
  vaultName: string
  queueName: string
}) {
  if (chooseKhataOfflineStorage(opts.platform) !== 'pwa-encrypted-indexeddb') throw new Error('PWA_BACKEND_ONLY')
  const vault = createPwaCryptoVault(opts.factory, opts.cryptoProvider, opts.vaultName)
  const key = await vault.keyForAccount(actorId)
  return createDurableEncryptedOutbox(createIndexedDbQueuePort(opts.factory, opts.queueName), key, opts.cryptoProvider)
}
