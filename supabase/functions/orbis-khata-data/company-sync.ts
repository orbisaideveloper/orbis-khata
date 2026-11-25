import { GatewayRejection } from '../../../src/accounting/gateway-admission.ts'
import { createCompanyGroupReader } from '../../../src/sync-v2/trusted-company-group-gateway.ts'
import { createDeviceFeedReader } from '../../../src/sync-v2/trusted-voucher-gateway.ts'
import type { KhataPrincipal } from '../../../src/accounting/server-gateway.ts'

type Begin = Parameters<typeof createCompanyGroupReader>[0]
const denied = new Set(['SYNC_TRUSTED_DEVICE_DENIED','SYNC_DEVICE_SCOPE_DENIED',
  'SYNC_ENTITLEMENT_DENIED','SYNC_MODULE_FEED_DENIED','SYNC_COMPANY_RECOVERY_DENIED'])
const conflicts = new Set(['SYNC_FEED_CURSOR_EXPIRED','SYNC_FEED_SPLIT_CURSOR',
  'SYNC_FEED_CURSOR_AHEAD','SYNC_FEED_GROUP_TOO_LARGE','SYNC_FEED_PAGE_TOO_LARGE',
  'SYNC_FEED_EPOCH_UNAVAILABLE','SYNC_RECOVERY_GROUP_ABSENT','SYNC_RECOVERY_TRANSFER_BUDGET'])

/** Read-only gateway. The existing Central-authenticated, rate-limited HTTP
 * layer calls this only if KHATA_COMPANY_SYNC_V2=enabled. Nothing writes money,
 * provisions device credentials, or enrolls a company through this route.
 */
export function createCompanySyncHandler(begin: Begin) {
  const feed = createDeviceFeedReader(begin)
  const recover = createCompanyGroupReader(begin)
  return async (principal: KhataPrincipal, input: Record<string, unknown>) => {
    const scope = {kind:'company' as const,id:String(input.company),epoch:String(input.epoch)}
    try {
      if (input.action==='recover-group') return await recover(principal.orbisIdentityId,
        String(input.credential),String(input.registration),scope,String(input.cursor),
        input.item === undefined ? null : Number(input.item),
        input.offset === undefined ? null : Number(input.offset))
      if (input.action==='feed') return await feed(principal.orbisIdentityId,
        String(input.credential),String(input.registration),scope,String(input.cursor),Number(input.limit))
      throw new GatewayRejection(400,'SYNC_COMMAND_INVALID')
    } catch (error) {
      const reason=error instanceof Error?error.message:''
      if (denied.has(reason)) throw new GatewayRejection(403,'SYNC_SCOPE_DENIED')
      if (conflicts.has(reason)) throw new GatewayRejection(409,reason)
      if (reason==='SYNC_RECOVERY_FRAGMENT_CURSOR' || reason==='SYNC_DEVICE_PROOF_INVALID')
        throw new GatewayRejection(400,'SYNC_COMMAND_INVALID')
      throw error
    }
  }
}
