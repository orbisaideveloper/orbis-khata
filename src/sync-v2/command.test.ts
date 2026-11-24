import { describe, expect, it } from 'vitest'
import { commandDigest, readyCommands, type Command } from './command'

const command: Command = {
  protocolVersion: 2, operationId: 'operation', actorId: 'owner', deviceRegistrationId: 'device',
  scope: { kind: 'company', id: 'company', epoch: 'epoch' },
  commandType: 'invoice', schemaVersion: 1, entityId: 'bill', children: { receipt: 'payment' },
  dependsOn: [], baseRevision: null, clientSequence: '1', createdAt: '2026-11-24T00:00:00Z',
  payload: { quantity: 1, amount: '100' },
}

describe('v2 command identity', () => {
  it('keeps the digest stable across key order but binds operation and child identity', async () => {
    const digest = await commandDigest(command)
    await expect(commandDigest({ ...command, payload: { amount: '100', quantity: 1 } })).resolves.toBe(digest)
    await expect(commandDigest({ ...command, operationId: 'other' })).resolves.not.toBe(digest)
    await expect(commandDigest({ ...command, children: { receipt: 'another-payment' } })).resolves.not.toBe(digest)
    await expect(commandDigest({ ...command, payload: { amount: 0.1 } })).rejects.toThrow('NON_CANONICAL')
  })

  it('holds dependent work while leaving independent work eligible', () => {
    const dependent = { ...command, operationId: 'dependent', dependsOn: [command.operationId] }
    const independent = { ...command, operationId: 'independent' }
    expect(readyCommands([
      { command, state: 'needs-review' }, { command: dependent, state: 'queued' },
      { command: independent, state: 'queued' },
    ], command.actorId, command.scope)).toEqual([independent])
  })

  it('never treats another actor or scope epoch as an acknowledged dependency', () => {
    const dependent = { ...command, operationId: 'dependent', dependsOn: [command.operationId] }
    const stale = { ...command, scope: { ...command.scope, epoch: 'stale' } }
    expect(readyCommands([
      { command: stale, state: 'server-acked' }, { command: dependent, state: 'queued' },
    ], command.actorId, command.scope)).toEqual([])
  })
})
