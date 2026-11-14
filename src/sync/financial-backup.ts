import type { DeviceLocalSnapshot } from '../demo/store'

const format = 'orbis.khata.financial.backup.v1'
const maximumBytes = 32 * 1024 * 1024
const nonceBytes = 12
const tagBytes = 16
const encoder = new TextEncoder()
const header = encoder.encode(format + '\n')

async function importRecoveryKey(recoveryKey: Uint8Array<ArrayBuffer>) {
  if (recoveryKey.byteLength !== 32) throw new Error('FINANCIAL_BACKUP_KEY_INVALID')
  return crypto.subtle.importKey('raw', recoveryKey, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export function generateFinancialBackupKey(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32))
}

/** The binary archive contains the format header, nonce and authenticated ciphertext. */
export async function encryptFinancialBackup(actorId: string, snapshot: DeviceLocalSnapshot, recoveryKey: Uint8Array<ArrayBuffer>) {
  if (!actorId || snapshot.version !== 1) throw new Error('FINANCIAL_BACKUP_CONTENT_INVALID')
  const plain = encoder.encode(JSON.stringify({ actorId, snapshot }))
  if (plain.byteLength > maximumBytes) throw new Error('FINANCIAL_BACKUP_TOO_LARGE')
  const nonce = crypto.getRandomValues(new Uint8Array(nonceBytes))
  const key = await importRecoveryKey(recoveryKey)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: header }, key, plain))
  const archive = new Uint8Array(header.length + nonce.length + ciphertext.length)
  archive.set(header)
  archive.set(nonce, header.length)
  archive.set(ciphertext, header.length + nonce.length)
  return archive
}

/** Decrypts for inspection only. The caller must validate the schema before any restore. */
export async function inspectFinancialBackup(archive: Uint8Array<ArrayBuffer>, actorId: string, recoveryKey: Uint8Array<ArrayBuffer>): Promise<unknown> {
  const offset = header.length + nonceBytes
  if (archive.length <= offset + tagBytes || archive.length > offset + tagBytes + maximumBytes ||
      !header.every((byte, index) => archive[index] === byte)) throw new Error('FINANCIAL_BACKUP_ARCHIVE_INVALID')
  const key = await importRecoveryKey(recoveryKey)
  const plain = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: archive.slice(header.length, offset), additionalData: header,
  }, key, archive.slice(offset))
  const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain))
  if (!actorId || !body || typeof body !== 'object' || !('actorId' in body) || body.actorId !== actorId ||
      !('snapshot' in body)) throw new Error('FINANCIAL_BACKUP_CONTENT_INVALID')
  return body.snapshot
}
