import { GatewayRejection } from '../../../src/accounting/gateway-admission.ts'
import { createLotteryPaymentWriter } from '../../../src/sync-v2/lottery-payment-gateway.ts'
import { createDeviceFeedReader, proofDigest } from '../../../src/sync-v2/trusted-voucher-gateway.ts'
import type { KhataPrincipal } from '../../../src/accounting/server-gateway.ts'

const denied = new Set(['SYNC_PAIRING_DENIED', 'SYNC_ACTOR_MISMATCH', 'IDENTITY_BINDING_REQUIRED', 'SYNC_TRUSTED_DEVICE_DENIED',
  'SYNC_DEVICE_SCOPE_DENIED', 'SYNC_ENTITLEMENT_DENIED', 'SYNC_LOTTERY_SCOPE_DENIED', 'SYNC_MODULE_FEED_DENIED', 'SYNC_LOTTERY_SNAPSHOT_DENIED', 'SYNC_RECOVERY_TRANSFER_DENIED'])
const invalid = new Set(['SYNC_COMMAND_INVALID', 'SYNC_WRITER_UNSUPPORTED', 'SYNC_VERSION_UNSUPPORTED', 'SYNC_V2_NON_CANONICAL_VALUE', 'SYNC_LOTTERY_SNAPSHOT_CURSOR_OR_LIMIT', 'SYNC_RECOVERY_FRAGMENT_CURSOR'])
const conflicts = new Set(['SYNC_OPERATION_DIGEST_MISMATCH', 'SYNC_LOTTERY_LEGACY_LINEAGE_REQUIRED',
  'SYNC_FEED_CURSOR_EXPIRED', 'SYNC_FEED_SPLIT_CURSOR', 'SYNC_FEED_CURSOR_AHEAD', 'SYNC_FEED_GROUP_TOO_LARGE',
  'SYNC_FEED_PAGE_TOO_LARGE', 'SYNC_FEED_EPOCH_UNAVAILABLE', 'SYNC_LOTTERY_SNAPSHOT_STALE', 'SYNC_LOTTERY_SNAPSHOT_PAGE_TOO_LARGE', 'SYNC_RECOVERY_GROUP_ABSENT', 'SYNC_RECOVERY_TRANSFER_BUDGET'])

export function createLotterySyncHandler(begin: Parameters<typeof createLotteryPaymentWriter>[0]) {
  const write = createLotteryPaymentWriter(begin)
  const read = createDeviceFeedReader(begin)
  // Inputs arrive through the verified and bounded accounting HTTP gateway.
  return async (principal: KhataPrincipal, input: Record<string, unknown>) => {
    const actor = principal.orbisIdentityId
    try {
      if (input.action === 'pair-device') {
        const [ticket, proof] = await Promise.all([proofDigest(String(input.ticket)), proofDigest(String(input.credential))])
        return await begin(async query => {
          const [row] = await query('select sync_v2.redeem_device_pairing($1::uuid,$2,$3) as registration', [actor, ticket, proof])
          if (!row) throw new Error('SYNC_DATABASE_RESULT_INVALID')
          return row.registration
        })
      }
      if (input.action === 'payment') return await write(actor, String(input.credential), input.command)
      if (input.action === 'recover-group') {
        const digest = await proofDigest(String(input.credential))
        return await begin(async query => {
          const [row] = await query(
            'select sync_v2.read_trusted_lottery_group($1::uuid,$2,$3,$4,$5,$6::bigint,$7::integer,$8::integer) as page',
            [actor, String(input.registration), digest, String(input.organization), String(input.epoch),
              String(input.cursor), input.item === undefined ? null : String(input.item),
              input.offset === undefined ? null : String(input.offset)])
          if (!row) throw new Error('SYNC_DATABASE_RESULT_INVALID')
          return row.page
        })
      }
      if (input.action === 'snapshot-part') {
        const digest = await proofDigest(String(input.credential))
        return await begin(async query => {
          const [row] = await query(
            'select sync_v2.read_trusted_lottery_snapshot_part($1::uuid,$2,$3,$4,$5,$6::bigint,$7::bigint,$8::integer) as page',
            [actor, String(input.registration), digest, String(input.organization), String(input.epoch),
              input.head === null ? null : String(input.head), String(input.after), String(input.offset)])
          if (!row) throw new Error('SYNC_DATABASE_RESULT_INVALID')
          return row.page
        })
      }
      if (input.action === 'snapshot') {
        const digest = await proofDigest(String(input.credential))
        return await begin(async query => {
          const [row] = await query(
            'select sync_v2.read_trusted_lottery_snapshot($1::uuid,$2,$3,$4,$5,$6::bigint,$7::bigint,$8::integer,262144) as page',
            [actor, String(input.registration), digest, String(input.organization), String(input.epoch),
              input.head === null ? null : String(input.head), String(input.after), String(input.limit)])
          if (!row) throw new Error('SYNC_DATABASE_RESULT_INVALID')
          return row.page
        })
      }
      return await read(actor, String(input.credential), String(input.registration),
        { kind: 'lottery-organization', id: String(input.organization), epoch: String(input.epoch) },
        String(input.cursor), Number(input.limit))
    } catch (error) {
      const reason = error instanceof Error ? error.message : ''
      if (denied.has(reason)) throw new GatewayRejection(403, 'SYNC_SCOPE_DENIED')
      if (invalid.has(reason)) throw new GatewayRejection(400, 'SYNC_COMMAND_INVALID')
      if (conflicts.has(reason)) throw new GatewayRejection(409, reason)
      throw error
    }
  }
}
