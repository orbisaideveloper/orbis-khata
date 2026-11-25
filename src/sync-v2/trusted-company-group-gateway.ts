import { createCentralVerifier } from '../accounting/server-gateway.ts'
import type { Scope } from './command.ts'
import type { SyncQuery } from './postgres-voucher.ts'
import { proofDigest } from './trusted-voucher-gateway.ts'

type Begin = <T>(work: (query: SyncQuery) => Promise<T>) => Promise<T>

/** Private large-group reader. The server obtains the credential from a trusted
 * client request; the database independently verifies its SHA256 digest and
 * enrolled scope after Central authentication. This is NOT secretless proof of
 * device possession and therefore cannot be considered final device attestation.
 * A consumer must verify all SHA256 fragments and stage an entire transaction
 * before moving its durable local cursor.
 */
export function createCompanyGroupReader(begin: Begin) {
  return async (
    actor: string, credential: string, registration: string,
    scope: Scope, after: string, item: number | null, offset: number | null,
  ): Promise<Record<string, unknown>> => {
    if (scope.kind !== 'company') throw new Error('SYNC_SCOPE_UNSUPPORTED')
    if (!/^(0|[1-9]\d{0,18})$/u.test(after) || BigInt(after)>9223372036854775807n ||
        !registration || registration.length > 128 ||
        (item===null)!==(offset===null) ||
        (item!==null && (!Number.isInteger(item) || item<1 || item>16000 ||
          !Number.isInteger(offset) || offset===null || offset<0 || offset>=2097152))) {
      throw new Error('SYNC_RECOVERY_FRAGMENT_CURSOR')
    }
    const digest = await proofDigest(credential)
    return begin(async query => {
      const [row] = await query(
        'select sync_v2.read_trusted_company_group($1::uuid,$2,$3,$4,$5,$6::bigint,$7::integer,$8::integer) as result',
        [actor,registration,digest,scope.id,scope.epoch,after,item===null?null:String(item),offset===null?null:String(offset)],
      )
      if (row?.result === null || !row?.result || typeof row.result !== 'object' || Array.isArray(row.result)) {
        throw new Error('SYNC_DATABASE_RESULT_INVALID')
      }
      return row.result as Record<string, unknown>
    })
  }
}

/** Authenticate the Central principal BEFORE opening any database transaction. */
export function createTrustedCompanyGroupGateway(
  central: Parameters<typeof createCentralVerifier>[0], begin: Begin,
) {
  const verify = createCentralVerifier(central)
  const read = createCompanyGroupReader(begin)
  return async (
    token: string, credential: string, registration: string,scope: Scope,
    after: string, item: number | null, offset: number | null,
  ) => {
    const principal = await verify(token)
    if (!principal) throw new Error('SYNC_SESSION_DENIED')
    return read(principal.orbisIdentityId,credential,registration,scope,after,item,offset)
  }
}
