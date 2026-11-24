import { expect, it, vi } from 'vitest'
import { createVoucherSyncGateway } from './voucher-gateway'

const owner = '11111111-1111-7111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const company = '33333333-3333-4333-8333-333333333333'
const command = {
  protocolVersion: 2, schemaVersion: 1, actorId: owner, commandType: 'khata-post',
  scope: { kind: 'company', id: company, epoch: 'epoch' },
  operationId: 'operation', entityId: id, deviceRegistrationId: 'phone',
  children: {}, dependsOn: [], baseRevision: null, clientSequence: '1', createdAt: '2026-11-24T00:00:00Z',
  payload: { id, company, party: id, kind: 'receipt', date: '2026-11-24', amount: '100',
    method: 'cash', reference: '', note: '', reverses: null },
}

it('rejects unauthenticated, forged, out-of-scope and incompatible commands before opening a transaction', async () => {
  const transaction = vi.fn()
  const handle = createVoucherSyncGateway({
    baseUrl: 'https://admin.example.test',
    fetchImpl: async (_, init) => new Headers(init?.headers).get('authorization') === 'Bearer active'
      ? Response.json({ version: 'orbis.customer.v1', customer: { orbisIdentityId: owner, displayId: 'ORB-U-23456789' } })
      : new Response(null, { status: 401 }),
  }, transaction)
  await expect(handle('expired', command)).rejects.toThrow('SESSION_DENIED')
  await expect(handle('active', { ...command, actorId: id })).rejects.toThrow('ACTOR_MISMATCH')
  await expect(handle('active', { ...command, protocolVersion: 1 })).rejects.toThrow('VERSION_UNSUPPORTED')
  await expect(handle('active', { ...command, scope: { ...command.scope, kind: 'lottery-organization' } })).rejects.toThrow('SCOPE_UNSUPPORTED')
  await expect(handle('active', { ...command, payload: { ...command.payload, company: id } })).rejects.toThrow('COMMAND_INVALID')
  await expect(handle('active', { ...command, plan: 'premium' })).rejects.toThrow('COMMAND_INVALID')
  expect(transaction).not.toHaveBeenCalled()
})

it('passes the verified identity and registration to the transaction before posting', async () => {
  const lockAuthorizedScope = vi.fn().mockRejectedValue(new Error('DEVICE_DENIED'))
  const post = vi.fn()
  const handle = createVoucherSyncGateway({
    baseUrl: 'https://admin.example.test',
    fetchImpl: async () => Response.json({
      version: 'orbis.customer.v1', customer: { orbisIdentityId: owner, displayId: 'ORB-U-23456789' },
    }),
  }, work => work({ lockAuthorizedScope, post, findReceipt: vi.fn(), finish: vi.fn(), assertPreconditions: vi.fn() }))
  await expect(handle('active', command)).rejects.toThrow('DEVICE_DENIED')
  expect(lockAuthorizedScope).toHaveBeenCalledWith(owner, 'phone', command.scope)
  expect(post).not.toHaveBeenCalled()
})
