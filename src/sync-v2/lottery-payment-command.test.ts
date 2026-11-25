import { expect, it } from 'vitest'
import { parseLotteryPaymentCommand } from './lottery-payment-command'

const payment = {
  organizationId: 'org', partyId: 'party', occurredAt: '2026-11-24',
  direction: 'PAYMENT', totalAmountPaise: '100', methodSplit: { CASH: '100' },
}
const command = {
  protocolVersion: 2, schemaVersion: 1, actorId: 'actor', deviceRegistrationId: 'device',
  commandType: 'lottery-payment',
  scope: { kind: 'lottery-organization', id: 'org', epoch: 'v1' },
  entityId: '11111111-1111-4111-8111-111111111111',
  operationId: '22222222-2222-4222-8222-222222222222',
  children: {}, dependsOn: [], baseRevision: null, clientSequence: '1',
  createdAt: '2026-11-24T09:30:00Z', payload: payment,
}

it('preserves exact decimal money and optional payment fields', () => {
  const payload = {
    ...payment, methodSplit: { BANK: '100' }, bankChannel: 'UPI',
    reference: 'reference', periodId: 'period-v1',
  }
  expect(parseLotteryPaymentCommand({ ...command, payload }, 'actor')).toEqual({ ...command, payload })
})

it.each([
  [{ schemaVersion: 2 }, 'SYNC_VERSION_UNSUPPORTED'],
  [{ actorId: 'other' }, 'SYNC_ACTOR_MISMATCH'],
  [{ commandType: 'lottery-expense' }, 'SYNC_WRITER_UNSUPPORTED'],
  [{ scope: { ...command.scope, kind: 'company' } }, 'SYNC_WRITER_UNSUPPORTED'],
  [{ baseRevision: '1' }, 'SYNC_WRITER_UNSUPPORTED'],
  [{ dependsOn: 'unexpected' }, 'SYNC_WRITER_UNSUPPORTED'],
  [{ children: { receipt: 'record' } }, 'SYNC_WRITER_UNSUPPORTED'],
  [{ scope: { ...command.scope, name: 'unexpected' } }, 'SYNC_COMMAND_INVALID'],
  [{ payload: [] }, 'SYNC_COMMAND_INVALID'],
  [{ createdAt: '2026-13-24T09:30:00Z' }, 'SYNC_COMMAND_INVALID'],
])('rejects an unsupported or malformed command envelope %#', (change, error) => {
  expect(() => parseLotteryPaymentCommand({ ...command, ...change }, 'actor')).toThrow(error)
})

it.each([
  { organizationId: 'other' }, { direction: 'UNSUPPORTED' },
  { occurredAt: '2026-02-31' }, { occurredAt: '2026-13-01' },
  { totalAmountPaise: 100 }, { methodSplit: { CASH: '-1' } },
  { reference: 42 }, { reference: 'x'.repeat(129) },
  { bankChannel: 42 }, { bankChannel: 'x'.repeat(129) },
  { periodId: 'invalid id' }, { unexpected: true },
])('rejects payment data outside the wire contract %#', change => {
  const payload = { ...payment, ...change }
  expect(() => parseLotteryPaymentCommand({ ...command, payload }, 'actor')).toThrow('SYNC_COMMAND_INVALID')
})
