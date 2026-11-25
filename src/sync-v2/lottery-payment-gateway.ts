import { createCentralVerifier } from '../accounting/server-gateway.ts'
import { runLottery } from '../lottery/service.ts'
import { parseLotteryPaymentCommand, type PaymentCommand } from './lottery-payment-command.ts'
import { createLotteryPaymentIds } from './lottery-payment-ids.ts'
import type { Json } from './command.ts'
import type { SyncQuery } from './postgres-voucher.ts'
import { acceptCommand, type SyncTransaction, type WithSyncTransaction } from './transaction.ts'
import { proofDigest } from './trusted-voucher-gateway.ts'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SYNC_DATABASE_RESULT_INVALID')
  return value as Record<string, unknown>
}

type Begin = <T>(work: (query: SyncQuery) => Promise<T>) => Promise<T>

function lotteryPaymentTransaction(
  query: SyncQuery, command: PaymentCommand, credentialDigest: string,
): SyncTransaction<'lottery-organization'> {
  const { actorId, scope, deviceRegistrationId } = command
  const scopeKey = [actorId, scope.kind, scope.id, scope.epoch]
  let owner: string
  return {
    async lockAuthorizedScope() {
      const [binding] = await query('select ledger_owner_id::text from orbis_khata.principals where orbis_identity_id=$1::uuid for share', [actorId])
      if (typeof binding?.ledger_owner_id !== 'string') throw new Error('IDENTITY_BINDING_REQUIRED')
      owner = binding.ledger_owner_id
      const authority = [actorId, deviceRegistrationId, credentialDigest, scope.kind, scope.id, scope.epoch]
      const authorize = () => query('select sync_v2.assert_trusted_device($1::uuid,$2,$3,$4,$5,$6,true)', authority)
      await authorize()
      await query("select pg_advisory_xact_lock(hashtextextended('lottery-owner:'||$1::uuid::text,0))", [owner])
      const [active] = await query("select head from sync_v2.scope where actor_id=$1 and kind=$2 and scope_id=$3 and epoch=$4 and lifecycle='active' for update", scopeKey)
      const [org] = await query("select id from public.khata_lottery_records where owner_id=$1::uuid and model='foundationAccountingOrganization' and id=$2 and value->>'status'='ACTIVE'", [owner, scope.id])
      if (!active || !org) throw new Error('SYNC_LOTTERY_SCOPE_DENIED')
      await authorize()
    },
    async findReceipt(operationId) {
      const [row] = await query('select digest,seq::text as sequence,result from sync_v2.receipt where actor_id=$1 and kind=$2 and scope_id=$3 and epoch=$4 and operation_id=$5', [...scopeKey, operationId])
      if (!row) return null
      if (typeof row.digest !== 'string' || typeof row.sequence !== 'string') throw new Error('SYNC_DATABASE_RESULT_INVALID')
      return { digest: row.digest, sequence: row.sequence, result: row.result as Json }
    },
    async assertPreconditions(command) {
      const [prior] = await query('select operation_id from public.khata_lottery_operations where owner_id=$1::uuid and operation_id=$2::uuid', [owner, command.operationId])
      if (prior) throw new Error('SYNC_LOTTERY_LEGACY_LINEAGE_REQUIRED')
    },
    async post(command) {
      const request = { method: 'recordPayment', operationId: command.operationId, payload: object(command.payload) }
      await query("select set_config('request.jwt.claims',$1,true),set_config('orbis.khata.gateway_verified','v1',true)",
        [JSON.stringify({ sub: owner, role: 'authenticated' })])
      await query('set local role authenticated')
      const call = async (input: unknown) => {
        const [row] = await query('select public.khata_lottery_store_v2($1::text::jsonb) as value', [JSON.stringify(input)])
        return row?.value
      }
      const loaded = object(await call({ action: 'load', request, operationId: request.operationId }))
      if (loaded.replay) throw new Error('SYNC_LOTTERY_LEGACY_LINEAGE_REQUIRED')
      const calculated = await runLottery(loaded.state, request, actorId, () => new Date(), await createLotteryPaymentIds(command))
      const result = await call({ action: 'commit', request, operationId: request.operationId,
        version: loaded.version, changes: calculated.changes, result: calculated.result })
      await query('reset role')
      return { result: result as Json, changes: [] }
    },
    async finish(operationId, digest, result) {
      const [row] = await query(`insert into sync_v2.receipt(actor_id,kind,scope_id,epoch,operation_id,digest,seq,result)
        select actor_id,kind,scope_id,epoch,operation_id::text,$7,last_sequence,$8::text::jsonb
        from sync_v2.lottery_operation_feed where actor_id=$1 and kind=$2 and scope_id=$3 and epoch=$4
          and owner_id=$5::uuid and operation_id=$6::uuid returning seq::text as sequence`,
      [...scopeKey, owner, operationId, digest, JSON.stringify(result)])
      if (typeof row?.sequence !== 'string') throw new Error('SYNC_LOTTERY_FEED_LINEAGE_MISSING')
      return { digest, sequence: row.sequence, result }
    },
  }
}

/** Called only after the enclosing gateway has verified the Central session. */
export function createLotteryPaymentWriter(begin: Begin) {
  return async (actor: string, credential: string, value: unknown) => {
    const command = parseLotteryPaymentCommand(structuredClone(value), actor)
    const credentialDigest = await proofDigest(credential)
    const transaction: WithSyncTransaction<'lottery-organization'> = work =>
      begin(query => work(lotteryPaymentTransaction(query, command, credentialDigest)))
    return acceptCommand(actor, command, transaction)
  }
}

export function createTrustedLotteryPaymentGateway(central: Parameters<typeof createCentralVerifier>[0], begin: Begin) {
  const verify = createCentralVerifier(central)
  const write = createLotteryPaymentWriter(begin)
  return async (token: string, credential: string, value: unknown) => {
    const command = structuredClone(value)
    const principal = await verify(token)
    if (!principal) throw new Error('SYNC_SESSION_DENIED')
    return write(principal.orbisIdentityId, credential, command)
  }
}
