import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { queueNew } from '../../src/sync/outbox-state'
import {
  generatePortableRecoveryCode, encryptPortableQueueBackup,
  decryptPortableQueueBackup,
} from '../../src/sync/portable-backup'
const provider = webcrypto as unknown as Crypto
const command = {
  protocolVersion: 1, operationId: '11111111-1111-4111-8111-111111111111',
  actorId: 'test_owner', companyId: 'company_1', commandType: 'voucher-post',
  baseVersion: null, createdAt: '2026-11-10T09:15:00.000Z',
  payload: { amountMinor: '100', note: 'sensitive-financial-test-string' },
} as const
const item = () => queueNew(command)
describe('portable encrypted outbox-only backup (not financial ledger)', () => {
  it('restores queue data with independently saved 256-bit recovery code', async () => {
    const code = generatePortableRecoveryCode(provider)
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    const saved = await encryptPortableQueueBackup('test_owner', [item()], code, provider)
    expect(saved.format).toBe('orbis.khata.outbox.backup.v1')
    expect(await decryptPortableQueueBackup(saved, 'test_owner', code, provider)).toEqual([item()])
  })
  it('does not expose plaintext in the exported archive', async () => {
    const code = generatePortableRecoveryCode(provider)
    const saved = await encryptPortableQueueBackup('test_owner', [item()], code, provider)
    expect(JSON.stringify(saved)).not.toContain('sensitive-financial-test-string')
    expect(JSON.stringify(saved)).not.toContain('company_1')
  })
  it('rejects wrong recovery code and modified ciphertext', async () => {
    const code = generatePortableRecoveryCode(provider)
    const saved = await encryptPortableQueueBackup('test_owner', [item()], code, provider)
    await expect(decryptPortableQueueBackup(saved, 'test_owner', generatePortableRecoveryCode(provider), provider)).rejects.toThrow('PORTABLE_BACKUP_DECRYPT_FAILED')
    const changed = saved.ciphertext.slice(0, 6) + (saved.ciphertext[6] === 'A' ? 'B' : 'A') + saved.ciphertext.slice(7)
    await expect(decryptPortableQueueBackup({ ...saved, ciphertext: changed }, 'test_owner', code, provider)).rejects.toThrow()
  })
  it('rejects cross-account restoration and malformed envelopes', async () => {
    const code = generatePortableRecoveryCode(provider)
    const saved = await encryptPortableQueueBackup('test_owner', [item()], code, provider)
    await expect(decryptPortableQueueBackup(saved, 'other_owner', code, provider)).rejects.toThrow('PORTABLE_BACKUP_CONTENT_INVALID')
    await expect(encryptPortableQueueBackup('test_owner', [queueNew({ ...command, actorId: 'other_owner' })], code, provider)).rejects.toThrow('PORTABLE_BACKUP_INPUT_INVALID')
    await expect(decryptPortableQueueBackup({ ...saved, format: 'evil' }, 'test_owner', code, provider)).rejects.toThrow('PORTABLE_BACKUP_ARCHIVE_INVALID')
  })
  it('rejects duplicate operation identities and malformed recovery codes', async () => {
    const code = generatePortableRecoveryCode(provider)
    await expect(encryptPortableQueueBackup('test_owner', [item(), item()], code, provider)).rejects.toThrow('PORTABLE_BACKUP_INPUT_INVALID')
    await expect(encryptPortableQueueBackup('test_owner', [item()], 'password123', provider)).rejects.toThrow('PORTABLE_BACKUP_RECOVERY_CODE_INVALID')
    expect(generatePortableRecoveryCode(provider)).not.toEqual(code)
  })
  it('does not silently store or restore anything when the payload is invalid', async () => {
    const code = generatePortableRecoveryCode(provider)
    const malformed = { ...item(), state: 'synced', serverCursor: null }
    await expect(encryptPortableQueueBackup('test_owner', [malformed], code, provider)).rejects.toThrow('PORTABLE_BACKUP_INPUT_INVALID')
    await expect(decryptPortableQueueBackup({ format: 'orbis.khata.outbox.backup.v1', nonce: 'AA', ciphertext: 'AA' }, 'test_owner', code, provider)).rejects.toThrow('PORTABLE_BACKUP_ARCHIVE_INVALID')
  })
})
