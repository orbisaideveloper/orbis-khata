import { expect, it, vi } from 'vitest'
import { createDevicePairing } from './device-pairing'
import type { LocalFeedStorage } from './local-feed'

const ticket = '1'.repeat(64)
const credential = '2'.repeat(64)
const marker = JSON.stringify({ credential })
const registration = {
  actor: 'actor', registration: 'device', client: 'web', canWrite: true,
  scope: { kind: 'company', id: 'company', epoch: 'v1' },
  expiresAt: '2100-01-01T00:00:00Z',
}
const codec = {
  seal: vi.fn(async (json: string) => json),
  open: vi.fn(async (sealed: string) => sealed),
}

it('recovers the winning device proof after a concurrent local write', async () => {
  const storage: LocalFeedStorage = {
    read: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(marker),
    commit: vi.fn().mockRejectedValueOnce(new Error('SYNC_LOCAL_STORAGE_CURSOR_CHANGED')).mockResolvedValueOnce(undefined),
  }
  const request = vi.fn().mockResolvedValue(registration)
  await expect(createDevicePairing('actor', 'web', storage, codec, request)(ticket))
    .resolves.toEqual({ ...registration, credential })
  expect(request).toHaveBeenCalledExactlyOnceWith('lottery-sync', { action: 'pair-device', ticket, credential })
  expect(storage.commit).toHaveBeenLastCalledWith(expect.any(String), marker, [
    { id: expect.any(String), sealed: JSON.stringify({ credential, registration }) },
  ])
})

it('rejects invalid pairing inputs without sending the stored proof', async () => {
  const storage: LocalFeedStorage = {
    read: vi.fn().mockResolvedValue(JSON.stringify({ credential: 'invalid' })),
    commit: vi.fn(),
  }
  const request = vi.fn()
  expect(() => createDevicePairing('invalid actor', 'web', storage, codec, request)).toThrow('SYNC_PAIRING_ACTOR_INVALID')
  const pair = createDevicePairing('actor', 'web', storage, codec, request)
  await expect(pair('invalid')).rejects.toThrow('SYNC_PAIRING_TICKET_INVALID')
  await expect(pair(ticket)).rejects.toThrow('SYNC_DEVICE_PROOF_INVALID')
  expect(request).not.toHaveBeenCalled()
})

it('does not store a binding for another actor or an invalid expiry', async () => {
  const storage: LocalFeedStorage = { read: vi.fn().mockResolvedValue(marker), commit: vi.fn() }
  const request = vi.fn().mockResolvedValueOnce({ ...registration, actor: 'other' })
    .mockResolvedValueOnce({ ...registration, expiresAt: '2000-01-01T00:00:00Z' })
    .mockResolvedValueOnce({ ...registration, expiresAt: 'invalid-date' })
  const pair = createDevicePairing('actor', 'web', storage, codec, request)
  await expect(pair(ticket)).rejects.toThrow('SYNC_PAIRING_BINDING_INVALID')
  await expect(pair(ticket)).rejects.toThrow('SYNC_PAIRING_BINDING_INVALID')
  await expect(pair(ticket)).rejects.toThrow('SYNC_PAIRING_BINDING_INVALID')
  expect(storage.commit).not.toHaveBeenCalled()
})

it('does not send a proof when storage fails or a winning marker cannot be recovered', async () => {
  const storage: LocalFeedStorage = {
    read: vi.fn().mockResolvedValue(null),
    commit: vi.fn().mockRejectedValueOnce(new Error('STORAGE_FULL'))
      .mockRejectedValueOnce(new Error('SYNC_LOCAL_STORAGE_CURSOR_CHANGED')),
  }
  const request = vi.fn()
  const pair = createDevicePairing('actor', 'web', storage, codec, request)
  await expect(pair(ticket)).rejects.toThrow('STORAGE_FULL')
  await expect(pair(ticket)).rejects.toThrow('SYNC_PAIRING_STATE_MISSING')
  expect(request).not.toHaveBeenCalled()
})


it('never rebinds a previously sealed device proof to a different scope or registration', async () => {
  const sealed = JSON.stringify({ credential, registration })
  const storage: LocalFeedStorage = { read: vi.fn().mockResolvedValue(sealed), commit: vi.fn() }
  const request = vi.fn().mockResolvedValueOnce({ ...registration, scope: { ...registration.scope, id: 'other-company' } })
    .mockResolvedValueOnce({ ...registration, registration: 'another-device' })
    .mockResolvedValueOnce({ ...registration, scope: { ...registration.scope, epoch: 'v2' } })
  const pair = createDevicePairing('actor', 'web', storage, codec, request)
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(pair(ticket)).rejects.toThrow('SYNC_PAIRING_BINDING_INVALID')
  }
  expect(storage.commit).not.toHaveBeenCalled()
})

it('allows refreshed write permission and expiry with the same trusted binding', async () => {
  const sealed = JSON.stringify({ credential, registration })
  const storage: LocalFeedStorage = { read: vi.fn().mockResolvedValue(sealed), commit: vi.fn() }
  const changed = { ...registration, canWrite: false, expiresAt: '2099-12-31T00:00:00Z' }
  const request = vi.fn().mockResolvedValue(changed)
  await expect(createDevicePairing('actor', 'web', storage, codec, request)(ticket))
    .resolves.toEqual({ ...changed, credential })
  expect(storage.commit).not.toHaveBeenCalled()
})
