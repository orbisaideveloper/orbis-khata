/**
 * Encrypted wire/storage codec for a FUTURE PWA IndexedDB / Android SQLite queue.
 * Adds no live storage, key derivation, background sync, or accounting posting.
 * The caller MUST provide a securely managed NON-EXTRACTABLE AES-GCM CryptoKey.
 * Key creation/recovery and atomic durable outbox storage remain separate tasks.
 */
import { parseSyncEnvelope } from './protocol'
import type { QueueItem } from './outbox-state'

export type SealedQueueItem = Readonly<{
  encryptionVersion: 1
  actorId: string
  companyId: string
  operationId: string
  nonce: string
  ciphertext: string
}>

type CryptoProvider = Pick<Crypto, 'getRandomValues' | 'subtle'>
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const MAX_JSON = 150000
const MAX_CIPHER_BASE64 = 260000

// Copy into an owned ArrayBuffer; never assert ArrayBufferLike is safe.
function cryptoBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function validKey(key: CryptoKey): boolean {
  return key.algorithm.name === 'AES-GCM' && !key.extractable &&
    key.usages.includes('encrypt') && key.usages.includes('decrypt')
}
function toBase64(bytes: Uint8Array): string {
  let encoded = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    encoded += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return btoa(encoded)
}
function fromBase64(text: string, max: number): Uint8Array {
  if (typeof text !== 'string' || text.length > max ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(text)) {
    throw new Error('QUEUE_CIPHERTEXT_INVALID')
  }
  return Uint8Array.from(atob(text), char => char.charCodeAt(0))
}
function associatedData(actorId: string, companyId: string, operationId: string): Uint8Array {
  return encoder.encode(JSON.stringify(['orbis.khata.encrypted-outbox.v1', actorId, companyId, operationId]))
}
function validQueueItem(value: unknown): value is QueueItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const envelope = parseSyncEnvelope(item.envelope)
  return envelope !== null &&
    ['queued', 'synced', 'conflict', 'rejected'].includes(String(item.state)) &&
    typeof item.attempts === 'number' && Number.isSafeInteger(item.attempts) &&
    item.attempts >= 0 && item.attempts <= 1000000 &&
    (item.lastReason === null || (typeof item.lastReason === 'string' && item.lastReason.length <= 128)) &&
    (item.serverCursor === null || (typeof item.serverCursor === 'string' && item.serverCursor.length <= 128)) &&
    (item.state !== 'synced' || item.serverCursor !== null) &&
    (!['conflict', 'rejected'].includes(String(item.state)) || item.lastReason !== null) &&
    Object.keys(item).sort().join(',') === 'attempts,envelope,lastReason,serverCursor,state'
}

export async function sealQueueItem(item: QueueItem, key: CryptoKey, provider: CryptoProvider): Promise<SealedQueueItem> {
  if (!validKey(key) || !validQueueItem(item)) throw new Error('QUEUE_SEAL_INPUT_INVALID')
  const json = JSON.stringify(item)
  if (json.length > MAX_JSON) throw new Error('QUEUE_PAYLOAD_TOO_LARGE')
  const nonce = provider.getRandomValues(new Uint8Array(12))
  const { actorId, companyId, operationId } = item.envelope
  const encrypted = await provider.subtle.encrypt(
    { name: 'AES-GCM', iv: cryptoBuffer(nonce), additionalData: cryptoBuffer(associatedData(actorId, companyId, operationId)) },
    key, encoder.encode(json),
  )
  return { encryptionVersion: 1, actorId, companyId, operationId, nonce: toBase64(nonce), ciphertext: toBase64(new Uint8Array(encrypted)) }
}

export async function unsealQueueItem(
  value: SealedQueueItem, key: CryptoKey, provider: CryptoProvider,
  expectedActorId: string, expectedCompanyId: string,
): Promise<QueueItem> {
  if (!validKey(key) || !value || value.encryptionVersion !== 1 ||
      value.actorId !== expectedActorId || value.companyId !== expectedCompanyId ||
      typeof value.operationId !== 'string' || value.operationId.length > 128) {
    throw new Error('QUEUE_SCOPE_OR_KEY_INVALID')
  }
  const iv = fromBase64(value.nonce, 16)
  const cipher = fromBase64(value.ciphertext, MAX_CIPHER_BASE64)
  if (iv.length !== 12 || cipher.length < 17) throw new Error('QUEUE_CIPHERTEXT_INVALID')
  let plaintext: ArrayBuffer
  try {
    plaintext = await provider.subtle.decrypt(
      { name: 'AES-GCM', iv: cryptoBuffer(iv), additionalData: cryptoBuffer(associatedData(value.actorId, value.companyId, value.operationId)) },
      key, cryptoBuffer(cipher),
    )
  } catch { throw new Error('QUEUE_DECRYPTION_FAILED') }
  if (plaintext.byteLength > MAX_JSON * 4) throw new Error('QUEUE_PAYLOAD_TOO_LARGE')
  let item: unknown
  try { item = JSON.parse(decoder.decode(plaintext)) } catch { throw new Error('QUEUE_CONTENT_INVALID') }
  if (!validQueueItem(item) || item.envelope.actorId !== value.actorId ||
      item.envelope.companyId !== value.companyId || item.envelope.operationId !== value.operationId) {
    throw new Error('QUEUE_CONTENT_INVALID')
  }
  return item
}
