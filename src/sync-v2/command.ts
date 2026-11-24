/** Frozen v2 command identity. Domain adapters must validate payloads before posting. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }
export type BuiltInScopeKind = 'company' | 'lottery-organization' | 'account-catalog'
export type Scope<Kind extends string = BuiltInScopeKind> = Readonly<{ kind: Kind; id: string; epoch: string }>
export type Command<Kind extends string = BuiltInScopeKind> = Readonly<{
  protocolVersion: 2
  operationId: string
  actorId: string
  deviceRegistrationId: string
  scope: Scope<Kind>
  commandType: string
  schemaVersion: number
  entityId: string
  children: Readonly<Record<string, string>>
  dependsOn: readonly string[]
  baseRevision: string | null
  clientSequence: string
  createdAt: string
  payload: Json
}>

/** IDs and decimal monetary values travel as strings. Reject lossy numeric input. */
function canonical(value: Json): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + Array.from(value, canonical).join(',') + ']'
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, Json>
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}'
  }
  throw new Error('SYNC_V2_NON_CANONICAL_VALUE')
}

export async function commandDigest(command: Command<string>): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(command))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export type QueueRecord = Readonly<{
  command: Command
  state: 'queued' | 'server-acked' | 'reconciled' | 'needs-review' | 'rejected'
}>

/** A missing, rejected or unresolved prerequisite holds only its dependants. */
export function readyCommands(records: readonly QueueRecord[], actorId: string, scope: Scope): Command[] {
  const scoped = records.filter(({ command }) => command.actorId === actorId
    && command.scope.kind === scope.kind && command.scope.id === scope.id && command.scope.epoch === scope.epoch)
  const byId = new Map(scoped.map(record => [record.command.operationId, record]))
  if (byId.size !== scoped.length) throw new Error('SYNC_V2_DUPLICATE_OPERATION')
  return scoped.filter(({ command, state }) => state === 'queued' && command.dependsOn.every(id => {
    const dependency = byId.get(id)?.state
    return dependency === 'server-acked' || dependency === 'reconciled'
  })).map(({ command }) => command)
}
