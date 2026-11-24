import type { Json, Scope } from './command.ts'
import type { WithSyncTransaction } from './transaction.ts'

type Parameter = string | null
export type SyncQuery = (statement: string, parameters?: Parameter[]) => Promise<readonly Record<string, unknown>[]>
type Begin = <T>(work: (query: SyncQuery) => Promise<T>) => Promise<T>
type DeviceAuthority = (query: SyncQuery, actor: string, registration: string, scope: Scope) => Promise<void>

function requiredText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('SYNC_DATABASE_RESULT_INVALID')
  return value
}

/** The injected device authority must verify server-side binding and entitlement in this transaction. */
export function createPostgresVoucherTransaction(begin: Begin, authorizeDevice: DeviceAuthority): WithSyncTransaction {
  const run: WithSyncTransaction = work => begin(async query => {
    let authorized: { key: string[]; ledgerOwner: string } | undefined
    function context() {
      if (!authorized) throw new Error('SYNC_SCOPE_NOT_LOCKED')
      return authorized
    }
    return work({
      async lockAuthorizedScope(actor, registration, scope) {
        if (authorized || scope.kind !== 'company') throw new Error('SYNC_SCOPE_UNSUPPORTED')
        const [binding] = await query('select ledger_owner_id::text from orbis_khata.principals where orbis_identity_id=$1::uuid for share', [actor])
        if (!binding) throw new Error('IDENTITY_BINDING_REQUIRED')
        const ledgerOwner = requiredText(binding.ledger_owner_id)
        const ownership = 'select id from public.khata_companies where id=$1::uuid and owner_id=$2::uuid and deleted_at is null'
        const company = [scope.id, ledgerOwner]
        if (!(await query(ownership, company)).length) throw new Error('COMPANY_DENIED')
        await authorizeDevice(query, actor, registration, scope)
        // Match the legacy stock/lifecycle writers, then recheck after any wait.
        await query("select pg_advisory_xact_lock(hashtextextended('stock-company:'||$1::uuid::text,0))", [scope.id])
        if (!(await query(ownership + ' for no key update', company)).length) throw new Error('COMPANY_DENIED')
        const key = [actor, scope.kind, scope.id, scope.epoch]
        const locked = await query("select head from sync_v2.scope where actor_id=$1 and kind=$2 and scope_id=$3 and epoch=$4 and lifecycle='active'", key)
        if (!locked.length) throw new Error('SCOPE_DENIED')
        await authorizeDevice(query, actor, registration, scope)
        authorized = { key, ledgerOwner }
      },
      async findReceipt(operationId) {
        const [row] = await query('select digest,seq::text as sequence,result::text as result from sync_v2.receipt where actor_id=$1 and kind=$2 and scope_id=$3 and epoch=$4 and operation_id=$5', [...context().key, operationId])
        if (!row) return null
        return { digest: requiredText(row.digest), sequence: requiredText(row.sequence),
          result: JSON.parse(requiredText(row.result)) as Json }
      },
      async assertPreconditions(command) {
        if (command.commandType !== 'khata-post' || command.scope.kind !== 'company' ||
            command.schemaVersion !== 1 || command.dependsOn.length || command.baseRevision !== null ||
            Object.keys(command.children).length) throw new Error('SYNC_WRITER_UNSUPPORTED')
      },
      async post(command) {
        const { ledgerOwner } = context()
        const payload = command.payload as Record<string, Json>
        await query("select set_config('request.jwt.claims',$1,true),set_config('orbis.khata.gateway_verified','v1',true)",
          [JSON.stringify({ sub: ledgerOwner, role: 'authenticated' })])
        await query('set local role authenticated')
        // If any query fails, propagate directly so the outer transaction rolls back.
        const [row] = await query('select public.khata_post_v1($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$6,$7,$8,$9,$10::uuid)::text as posted',
          [command.entityId, command.scope.id, ...['party','kind','date','amount','method','reference','note']
            .map(field => requiredText(payload[field])), payload.reverses === null ? null : requiredText(payload.reverses)])
        const posted = requiredText(row?.posted)
        await query('reset role')
        return { result: { entityId: posted }, changes: [] }
      },
      async finish(operationId, digest, result) {
        const [actor, , company, epoch] = context().key
        const [row] = await query('select sync_v2.finish_voucher($1,$2,$3,$4,$5,$6::text::jsonb)::text as sequence',
          [actor, company, epoch, operationId, digest, JSON.stringify(result)])
        return { sequence: requiredText(row?.sequence), digest, result }
      },
    })
  })

  return async work => {
    // PostgreSQL guarantees both failures aborted the transaction. For any
    // ambiguous outcome (e.g. connection loss), the caller must replay the operation.
    for (let attempt = 1; ; attempt++) {
      try {
        return await run(work)
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
        if (attempt >= 3 || (code !== '40P01' && code !== '40001')) throw error
        await new Promise(resolve => setTimeout(resolve, attempt * 15 + Math.random() * 15))
      }
    }
  }
}
