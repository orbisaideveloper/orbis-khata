import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { queueNew } from '../../src/sync/outbox-state'
import { sealQueueItem, unsealQueueItem } from '../../src/sync/encrypted-record'
const provider = webcrypto as unknown as Crypto
const cmd = {
  protocolVersion: 1, operationId: '11111111-1111-4111-8111-111111111111',
  actorId: 'user_1', companyId: 'company_1', commandType: 'voucher-post',
  baseVersion: null, createdAt: '2026-11-10T09:15:00.000Z',
  payload: { amountMinor: '100', reference: 'private ledger' },
} as const
const getKey = () => webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
describe('encrypted queue record codec (isolated only)', () => {
  it('encrypts and decrypts byte-exact accounting command and state', async () => {
    const key = await getKey()
    const item = queueNew(cmd)
    const sealed = await sealQueueItem(item, key as CryptoKey, provider)
    expect(JSON.stringify(sealed)).not.toContain('private ledger')
    expect(JSON.stringify(sealed)).not.toContain('amountMinor')
    expect(await unsealQueueItem(sealed, key as CryptoKey, provider, 'user_1', 'company_1')).toEqual(item)
  })
  it('uses a fresh random nonce to avoid identical ciphertexts', async () => {
    const key = await getKey(); const item = queueNew(cmd)
    const a = await sealQueueItem(item, key as CryptoKey, provider)
    const b = await sealQueueItem(item, key as CryptoKey, provider)
    expect(a.nonce).not.toBe(b.nonce); expect(a.ciphertext).not.toBe(b.ciphertext)
  })
  it('never opens another account or company', async () => {
    const key = await getKey()
    const sealed = await sealQueueItem(queueNew(cmd), key as CryptoKey, provider)
    await expect(unsealQueueItem(sealed, key as CryptoKey, provider, 'user_2', 'company_1')).rejects.toThrow('QUEUE_SCOPE_OR_KEY_INVALID')
    await expect(unsealQueueItem(sealed, key as CryptoKey, provider, 'user_1', 'company_2')).rejects.toThrow('QUEUE_SCOPE_OR_KEY_INVALID')
  })
  it('detects tampering with scope and ciphertext', async () => {
    const key = await getKey()
    const sealed = await sealQueueItem(queueNew(cmd), key as CryptoKey, provider)
    await expect(unsealQueueItem({ ...sealed, companyId: 'company_2' }, key as CryptoKey, provider, 'user_1', 'company_2')).rejects.toThrow('QUEUE_DECRYPTION_FAILED')
    const replacement = sealed.ciphertext.slice(0, 5) + (sealed.ciphertext[5] === 'A' ? 'B' : 'A') + sealed.ciphertext.slice(6)
    await expect(unsealQueueItem({ ...sealed, ciphertext: replacement }, key as CryptoKey, provider, 'user_1', 'company_1')).rejects.toThrow('QUEUE_DECRYPTION_FAILED')
  })
  it('cannot decrypt with another private AES-GCM key', async () => {
    const first = await getKey(); const second = await getKey()
    const sealed = await sealQueueItem(queueNew(cmd), first as CryptoKey, provider)
    await expect(unsealQueueItem(sealed, second as CryptoKey, provider, 'user_1', 'company_1')).rejects.toThrow('QUEUE_DECRYPTION_FAILED')
  })
  it('rejects extractable encryption keys', async () => {
    const weak = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    await expect(sealQueueItem(queueNew(cmd), weak as CryptoKey, provider)).rejects.toThrow('QUEUE_SEAL_INPUT_INVALID')
  })
})
