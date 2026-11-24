import { createCentralVerifier } from '../accounting/server-gateway.ts'
import type { Scope } from './command.ts'
import { createPostgresVoucherTransaction } from './postgres-voucher.ts'
import { createVoucherSyncGateway } from './voucher-gateway.ts'

export async function proofDigest(deviceCredential: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/u.test(deviceCredential)) throw new Error('SYNC_DEVICE_PROOF_INVALID')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceCredential))
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('')
}

/** Compose the Central session verifier and possession-bound DB authority.
 * The endpoint must obtain the device credential separately from the command.
 */
export function createTrustedVoucherGateway(
  central: Parameters<typeof createVoucherSyncGateway>[0],
  begin: Parameters<typeof createPostgresVoucherTransaction>[0],
) {
  return async (token: string, deviceCredential: string, input: unknown) => {
    const digest = await proofDigest(deviceCredential)
    const transaction = createPostgresVoucherTransaction(begin, async (query, actor, registration, scope) => {
      await query('select sync_v2.assert_trusted_device($1::uuid,$2,$3,$4,$5,$6,true)',
        [actor, registration, digest, scope.kind, scope.id, scope.epoch])
    })
    return createVoucherSyncGateway(central, transaction)(token, input)
  }
}

/** The HTTP gateway supplies the verified actor. */
export function createDeviceFeedReader(begin: Parameters<typeof createPostgresVoucherTransaction>[0]) {
  return async (actor: string, deviceCredential: string, registration: string, scope: Scope, cursor: string, limit: number) => {
    const { kind, id, epoch } = scope
    const digest = await proofDigest(deviceCredential)
    return begin(async query => {
      const [row] = await query('select sync_v2.read_trusted_feed($1::uuid,$2,$3,$4,$5,$6,$7::bigint,$8::integer) as page',
        [actor, registration, digest, kind, id, epoch, cursor, String(limit)])
      if (!row) throw new Error('SYNC_DATABASE_RESULT_INVALID')
      return row.page
    })
  }
}

/** Private feed composition for use outside the HTTP gateway. */
export function createTrustedFeedGateway(
  central: Parameters<typeof createCentralVerifier>[0],
  begin: Parameters<typeof createPostgresVoucherTransaction>[0],
) {
  const verify = createCentralVerifier(central)
  const read = createDeviceFeedReader(begin)
  return async (token: string, deviceCredential: string, registration: string, scope: Scope, cursor: string, limit: number) => {
    const principal = await verify(token)
    if (!principal) throw new Error('SYNC_SESSION_DENIED')
    return read(principal.orbisIdentityId, deviceCredential, registration, scope, cursor, limit)
  }
}
