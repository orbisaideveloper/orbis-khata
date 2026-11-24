import type { Command, Json } from './command.ts'

export type PaymentCommand = Command<'lottery-organization'>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const ID = /^[\w-]{1,128}$/u
const DATE = /^\d{4}-\d{2}-\d{2}$/u
const MONEY = /^(0|[1-9]\d{0,17})$/u

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SYNC_COMMAND_INVALID')
  return value as Record<string, unknown>
}

function field(value: unknown, format: RegExp): string {
  if (typeof value !== 'string' || !format.test(value)) throw new Error('SYNC_COMMAND_INVALID')
  return value
}

function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('SYNC_COMMAND_INVALID')
}

export function parseLotteryPaymentCommand(input: unknown, actor: string): PaymentCommand {
  const command = object(input)
  if (command.protocolVersion !== 2 || command.schemaVersion !== 1) throw new Error('SYNC_VERSION_UNSUPPORTED')
  if (command.actorId !== actor) throw new Error('SYNC_ACTOR_MISMATCH')
  keys(command, ['protocolVersion','schemaVersion','actorId','deviceRegistrationId','scope','commandType','operationId',
    'entityId','children','dependsOn','baseRevision','clientSequence','createdAt','payload'])
  const scope = object(command.scope)
  keys(scope, ['id', 'kind', 'epoch'])
  if (command.commandType !== 'lottery-payment' || scope.kind !== 'lottery-organization' ||
      command.baseRevision !== null || !Array.isArray(command.dependsOn) || command.dependsOn.length ||
      Object.keys(object(command.children)).length) throw new Error('SYNC_WRITER_UNSUPPORTED')
  const organizationId = field(scope.id, ID)
  const payload = object(command.payload)
  keys(payload, ['organizationId','partyId','occurredAt','direction','totalAmountPaise','methodSplit','bankChannel','reference','periodId'])
  if (payload.organizationId !== organizationId || !['RECEIPT','PAYMENT'].includes(String(payload.direction))) {
    throw new Error('SYNC_COMMAND_INVALID')
  }
  field(payload.partyId, ID)
  const occurredAt = field(payload.occurredAt, DATE)
  const date = new Date(occurredAt + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== occurredAt) {
    throw new Error('SYNC_COMMAND_INVALID')
  }
  field(payload.totalAmountPaise, MONEY)
  if (payload.reference !== undefined && (typeof payload.reference !== 'string' || payload.reference.length > 128)) throw new Error('SYNC_COMMAND_INVALID')
  if (payload.bankChannel !== undefined && (typeof payload.bankChannel !== 'string' || payload.bankChannel.length > 128)) throw new Error('SYNC_COMMAND_INVALID')
  if (payload.periodId !== undefined && payload.periodId !== null) field(payload.periodId, ID)
  const split = object(payload.methodSplit)
  // Domain service owns valid channels and exact split reconciliation.
  for (const amount of Object.values(split)) field(amount, MONEY)
  const createdAt = field(command.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u)
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('SYNC_COMMAND_INVALID')
  return { protocolVersion: 2, schemaVersion: 1, actorId: actor, commandType: 'lottery-payment',
    deviceRegistrationId: field(command.deviceRegistrationId, ID), scope: { kind: 'lottery-organization', id: organizationId, epoch: field(scope.epoch, ID) },
    entityId: field(command.entityId, UUID), operationId: field(command.operationId, UUID),
    children: {}, dependsOn: [], baseRevision: null, clientSequence: field(command.clientSequence, /^[1-9]\d{0,18}$/u),
    createdAt, payload: payload as Json }
}
