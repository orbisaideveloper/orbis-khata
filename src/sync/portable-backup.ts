/**
 * Portable recovery codec for a FUTURE offline financial-command OUTBOX only.
 * No live accounting, database restore, UI, uploads, or key management is wired here.
 *
 * A randomly generated 256-bit recovery code is required; never substitute a
 * user password. The code must be saved independently from the encrypted file.
 * This does NOT back up the authoritative financial ledger or Android Keystore.
 */
import { validQueueItem, type QueueItem } from './outbox-state'

export type PortableQueueBackup = Readonly<{
  format: 'orbis.khata.outbox.backup.v1'
  nonce: string
  ciphertext: string
}>

type CryptoProvider = Pick<Crypto, 'subtle' | 'getRandomValues'>
const FORMAT = 'orbis.khata.outbox.backup.v1' as const
const MAX_PLAINTEXT_BYTES = 2 * 1024 * 1024
const MAX_CIPHERTEXT_CHARS = 2_900_000
const MAX_ITEMS = 5000
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const safeId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/u.test(v)

function encode(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(text).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}
function decode(text: unknown, maxChars: number): Uint8Array {
  if (typeof text !== 'string' || !text || text.length > maxChars ||
      !/^[A-Za-z0-9_-]+$/u.test(text) || text.length % 4 === 1) {
    throw new Error('PORTABLE_BACKUP_BASE64_INVALID')
  }
  let bytes: Uint8Array
  try {
    const raw = atob(text.replace(/-/gu, '+').replace(/_/gu, '/') + '='.repeat((4 - text.length % 4) % 4))
    bytes = Uint8Array.from(raw, c => c.charCodeAt(0))
  } catch { throw new Error('PORTABLE_BACKUP_BASE64_INVALID') }
  if (encode(bytes) !== text) throw new Error('PORTABLE_BACKUP_BASE64_INVALID')
  return bytes
}
/** WebCrypto BufferSource must own an ArrayBuffer (never SharedArrayBuffer). */
function stableBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}
function recoverKey(code: string, provider: CryptoProvider): Promise<CryptoKey> {
  let bytes: Uint8Array
  try {
    bytes = decode(code, 43)
  } catch {
    // Recovery-code validation must expose one stable error for invalid input.
    throw new Error('PORTABLE_BACKUP_RECOVERY_CODE_INVALID')
  }
  if (bytes.length !== 32) throw new Error('PORTABLE_BACKUP_RECOVERY_CODE_INVALID')
  return provider.subtle.importKey('raw', stableBuffer(bytes), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
function validateBody(value: unknown, expectedOwner: string): value is { version: 1; actorId: string; items: QueueItem[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  if (obj.version !== 1 || obj.actorId !== expectedOwner ||
      !Array.isArray(obj.items) || obj.items.length > MAX_ITEMS ||
      Object.keys(obj).sort().join(',') !== 'actorId,items,version') return false
  const ids = new Set<string>()
  for (const item of obj.items) {
    if (!validQueueItem(item) || item.envelope.actorId !== expectedOwner) return false
    const k = JSON.stringify([item.envelope.companyId, item.envelope.operationId])
    if (ids.has(k)) return false
    ids.add(k)
  }
  return true
}
/** One-time random recovery secret; caller must separately record it securely. */
export function generatePortableRecoveryCode(provider: CryptoProvider): string {
  return encode(provider.getRandomValues(new Uint8Array(32)))
}
/** Encrypts ONLY the future outbox snapshot. No plaintext is written to disk here. */
export async function encryptPortableQueueBackup(
  actorId: string, items: readonly QueueItem[], recoveryCode: string, provider: CryptoProvider,
): Promise<PortableQueueBackup> {
  if (!safeId(actorId) || !validateBody({ version: 1, actorId, items: [...items] }, actorId)) {
    throw new Error('PORTABLE_BACKUP_INPUT_INVALID')
  }
  const plain = encoder.encode(JSON.stringify({ version: 1, actorId, items }))
  if (plain.byteLength > MAX_PLAINTEXT_BYTES) throw new Error('PORTABLE_BACKUP_TOO_LARGE')
  const key = await recoverKey(recoveryCode, provider)
  const nonce = provider.getRandomValues(new Uint8Array(12))
  const encrypted = await provider.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(FORMAT) }, key, plain,
  )
  return { format: FORMAT, nonce: encode(nonce), ciphertext: encode(new Uint8Array(encrypted)) }
}
/** Returns validated queue data only. Never auto-import or overwrite a live store. */
export async function decryptPortableQueueBackup(
  archive: unknown, expectedActorId: string, recoveryCode: string, provider: CryptoProvider,
): Promise<readonly QueueItem[]> {
  if (!safeId(expectedActorId) || !archive || typeof archive !== 'object' || Array.isArray(archive)) {
    throw new Error('PORTABLE_BACKUP_ARCHIVE_INVALID')
  }
  const data = archive as Record<string, unknown>
  if (data.format !== FORMAT || Object.keys(data).sort().join(',') !== 'ciphertext,format,nonce') {
    throw new Error('PORTABLE_BACKUP_ARCHIVE_INVALID')
  }
  const iv = decode(data.nonce, 16)
  const ct = decode(data.ciphertext, MAX_CIPHERTEXT_CHARS)
  if (iv.length !== 12 || ct.length < 17 || ct.length > MAX_PLAINTEXT_BYTES + 16) {
    throw new Error('PORTABLE_BACKUP_ARCHIVE_INVALID')
  }
  const key = await recoverKey(recoveryCode, provider)
  let plaintext: ArrayBuffer
  try {
    plaintext = await provider.subtle.decrypt(
      { name: 'AES-GCM', iv: stableBuffer(iv), additionalData: encoder.encode(FORMAT) }, key, stableBuffer(ct),
    )
  } catch { throw new Error('PORTABLE_BACKUP_DECRYPT_FAILED') }
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new Error('PORTABLE_BACKUP_TOO_LARGE')
  let parsed: unknown
  try { parsed = JSON.parse(decoder.decode(plaintext)) }
  catch { throw new Error('PORTABLE_BACKUP_CONTENT_INVALID') }
  if (!validateBody(parsed, expectedActorId)) throw new Error('PORTABLE_BACKUP_CONTENT_INVALID')
  return parsed.items
}
