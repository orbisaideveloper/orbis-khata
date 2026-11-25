import { expect, it, vi } from 'vitest'
import type { Command } from './command'
import { createModuleRegistry, type ModuleAdapter } from './module-registry'
import type { WithSyncTransaction } from './transaction'

const command: Command<'company'> = {
  protocolVersion: 2,
  operationId: 'op',
  actorId: 'actor',
  deviceRegistrationId: 'device',
  scope: { kind: 'company', id: 'company', epoch: 'v1' },
  commandType: 'khata-post',
  schemaVersion: 1,
  entityId: 'voucher',
  children: {},
  dependsOn: [],
  baseRevision: null,
  clientSequence: '1',
  createdAt: '2026-11-24T00:00:00Z',
  payload: { amount: '100' },
}

function moduleFixture() {
  const lockAuthorizedScope = vi.fn(async () => {})
  const post = vi.fn(async (_command: Command<'company'>) => ({ result: 'posted', changes: [] }))
  const transaction: WithSyncTransaction<'company'> = work => work({
    lockAuthorizedScope,
    findReceipt: async () => null,
    assertPreconditions: async () => {},
    post,
    finish: async (_id, digest, result) => ({ digest, sequence: '1', result }),
  })
  const adapter: ModuleAdapter<'company'> = {
    scopeKind: 'company',
    commandType: command.commandType,
    schemaVersion: 1,
    validate: vi.fn(raw => raw as Command<'company'>),
    transaction,
  }
  return { adapter, lockAuthorizedScope, post }
}

it('routes a copy of the validated command to its authorized transaction', async () => {
  const { adapter, lockAuthorizedScope, post } = moduleFixture()
  const mutable = structuredClone(command)
  const pending = createModuleRegistry([adapter])('actor', mutable)
  Object.assign(mutable.payload as object, { amount: '200' })

  await expect(pending).resolves.toMatchObject({ sequence: '1', result: 'posted' })
  expect(lockAuthorizedScope).toHaveBeenCalledWith('actor', 'device', command.scope)
  expect(post).toHaveBeenCalledWith(command)
})

it('rejects incomplete and duplicate adapter registrations', () => {
  const { adapter } = moduleFixture()
  for (const invalid of [{ commandType: '' }, { schemaVersion: 0 }, { schemaVersion: 1.5 }]) {
    expect(() => createModuleRegistry([{ ...adapter, ...invalid }])).toThrow('SYNC_MODULE_REGISTRATION_INVALID')
  }
  expect(() => createModuleRegistry([adapter, adapter])).toThrow('SYNC_MODULE_DUPLICATE')
})

it('rejects invalid envelopes, unsupported routes, and validators that switch the route', async () => {
  const { adapter, post, lockAuthorizedScope } = moduleFixture()
  const run = createModuleRegistry([adapter])
  for (const invalid of [null, { ...command, scope: null }, { ...command, schemaVersion: '1' }]) {
    await expect(run('actor', invalid)).rejects.toThrow('SYNC_MODULE_ENVELOPE_INVALID')
  }
  await expect(run('actor', { ...command, schemaVersion: 2 })).rejects.toThrow('SYNC_MODULE_UNSUPPORTED')
  await expect(run('another-actor', command)).rejects.toThrow('SYNC_ACTOR_MISMATCH')
  const changesRoute = { ...adapter, validate: () => ({ ...command, commandType: 'other-command' }) }
  await expect(createModuleRegistry([changesRoute])('actor', command)).rejects.toThrow('SYNC_MODULE_ROUTE_MISMATCH')
  expect(lockAuthorizedScope).not.toHaveBeenCalled()
  expect(post).not.toHaveBeenCalled()
})
