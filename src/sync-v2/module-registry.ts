import type { Command } from './command.ts'
import { acceptCommand, type WithSyncTransaction } from './transaction.ts'

export type ModuleAdapter<Kind extends string> = Readonly<{
  scopeKind: Kind
  commandType: string
  schemaVersion: number
  /** Validate the envelope, deterministic payload, IDs, and supported lineage. */
  validate: (raw: unknown) => Command<Kind>
  /** Bind device, entitlement and scope against server state before reading receipts. */
  transaction: WithSyncTransaction<Kind>
}>

/** Static server composition. Client input can select only an installed adapter. */
export function createModuleRegistry<Kind extends string>(adapters: readonly ModuleAdapter<Kind>[]) {
  const modules = new Map<string, ModuleAdapter<Kind>>()
  const key = (scope: string, command: string, version: number) => JSON.stringify([scope, command, version])
  for (const adapter of adapters) {
    if (!adapter.scopeKind || !adapter.commandType || !Number.isSafeInteger(adapter.schemaVersion) ||
        adapter.schemaVersion < 1) throw new Error('SYNC_MODULE_REGISTRATION_INVALID')
    const route = key(adapter.scopeKind, adapter.commandType, adapter.schemaVersion)
    if (modules.has(route)) throw new Error('SYNC_MODULE_DUPLICATE')
    modules.set(route, adapter)
  }
  return async (verifiedActor: string, raw: unknown) => {
    // Copy before validation so routing, validation, hashing and posting share
    // an immutable view of the same wire data.
    const input = structuredClone(raw) as Partial<Command<string>> | null
    if (input?.protocolVersion !== 2 || typeof input.scope?.kind !== 'string' ||
        typeof input.commandType !== 'string' || !Number.isSafeInteger(input.schemaVersion)) {
      throw new Error('SYNC_MODULE_ENVELOPE_INVALID')
    }
    const version = input.schemaVersion as number
    const adapter = modules.get(key(input.scope.kind, input.commandType, version))
    if (!adapter) throw new Error('SYNC_MODULE_UNSUPPORTED')
    const command = adapter.validate(input)
    if (command.protocolVersion !== 2 || command.scope.kind !== adapter.scopeKind ||
        command.commandType !== adapter.commandType || command.schemaVersion !== adapter.schemaVersion) {
      throw new Error('SYNC_MODULE_ROUTE_MISMATCH')
    }
    return acceptCommand(verifiedActor, command, adapter.transaction)
  }
}
