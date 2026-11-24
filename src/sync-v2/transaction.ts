import { commandDigest, type BuiltInScopeKind, type Command, type Json, type Scope } from './command.ts'

type Receipt = Readonly<{ digest: string; sequence: string; result: Json }>

/** Implementations must keep all calls on one transaction/connection. */
interface SyncTransaction<Kind extends string = BuiltInScopeKind> {
  lockAuthorizedScope(actorId: string, registrationId: string, scope: Scope<Kind>): Promise<void>
  findReceipt(operationId: string): Promise<Receipt | null>
  assertPreconditions(command: Command<Kind>): Promise<void>
  post(command: Command<Kind>): Promise<{ result: Json; changes: readonly Json[] }>
  finish(operationId: string, digest: string, result: Json, changes: readonly Json[]): Promise<Receipt>
}

export type WithSyncTransaction<Kind extends string = BuiltInScopeKind> = <T>(work: (transaction: SyncTransaction<Kind>) => Promise<T>) => Promise<T>

/** Only a validated command and server-authenticated identity may enter this boundary. */
export async function acceptCommand<Kind extends string>(
  verifiedActorId: string, command: Command<Kind>, withTransaction: WithSyncTransaction<Kind>,
): Promise<Receipt> {
  if (verifiedActorId !== command.actorId) throw new Error('SYNC_ACTOR_MISMATCH')
  // Own the input across asynchronous calls so the hash and posting use the same data.
  const input = structuredClone(command)
  const digest = await commandDigest(input)
  return withTransaction(async transaction => {
    await transaction.lockAuthorizedScope(verifiedActorId, input.deviceRegistrationId, input.scope)
    const existing = await transaction.findReceipt(input.operationId)
    if (existing) {
      if (existing.digest !== digest) throw new Error('SYNC_OPERATION_DIGEST_MISMATCH')
      return existing
    }
    await transaction.assertPreconditions(input)
    const { result, changes } = await transaction.post(input)
    return transaction.finish(input.operationId, digest, result, changes)
  })
}
