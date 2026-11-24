import { createCentralVerifier, khataOperation } from '../accounting/server-gateway.ts'
import type { Command, Json } from './command.ts'
import { acceptCommand, type WithSyncTransaction } from './transaction.ts'

function record(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
  throw new Error('SYNC_COMMAND_INVALID')
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w-]{1,128}$/u.test(value)) throw new Error('SYNC_COMMAND_INVALID')
  return value
}

function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field))
}

/** Server entry for the supported voucher slice. All other writers remain disabled. */
export function createVoucherSyncGateway(
  central: Parameters<typeof createCentralVerifier>[0],
  transaction: WithSyncTransaction,
) {
  const verify = createCentralVerifier(central)
  return async (token: string, value: unknown) => {
    const principal = await verify(token)
    if (!principal) throw new Error('SYNC_SESSION_DENIED')
    const input = record(value)
    if (input.protocolVersion !== 2 || input.schemaVersion !== 1) throw new Error('SYNC_VERSION_UNSUPPORTED')
    if (input.actorId !== principal.orbisIdentityId) throw new Error('SYNC_ACTOR_MISMATCH')
    if (!exactKeys(input, ['protocolVersion', 'schemaVersion', 'actorId', 'commandType', 'scope',
      'operationId', 'entityId', 'deviceRegistrationId', 'baseRevision', 'dependsOn', 'children',
      'createdAt', 'clientSequence', 'payload'])) throw new Error('SYNC_COMMAND_INVALID')
    const scope = record(input.scope)
    if (!exactKeys(scope, ['kind', 'id', 'epoch'])) throw new Error('SYNC_COMMAND_INVALID')
    if (scope.kind !== 'company' || input.commandType !== 'khata-post') throw new Error('SYNC_SCOPE_UNSUPPORTED')
    const payload = record(input.payload)
    const domain = khataOperation({ version: 'orbis.khata.data.v1', operation: 'post', input: payload })
    if (!domain || payload.company !== scope.id || payload.id !== input.entityId ||
        input.baseRevision !== null || !Array.isArray(input.dependsOn) || input.dependsOn.length !== 0 ||
        Object.keys(record(input.children)).length !== 0) throw new Error('SYNC_COMMAND_INVALID')
    if (typeof input.createdAt !== 'string' || !Number.isFinite(Date.parse(input.createdAt)) ||
        typeof input.clientSequence !== 'string' || !/^[1-9]\d{0,18}$/u.test(input.clientSequence)) {
      throw new Error('SYNC_COMMAND_INVALID')
    }
    const command: Command = {
      protocolVersion: 2, schemaVersion: 1, actorId: principal.orbisIdentityId,
      commandType: 'khata-post', scope: { kind: 'company', id: identifier(scope.id), epoch: identifier(scope.epoch) },
      operationId: identifier(input.operationId), entityId: identifier(input.entityId),
      deviceRegistrationId: identifier(input.deviceRegistrationId),
      baseRevision: null, dependsOn: [], children: {}, createdAt: input.createdAt,
      clientSequence: input.clientSequence, payload: domain.input as Json,
    }
    return acceptCommand(principal.orbisIdentityId, command, transaction)
  }
}
