/**
 * Step 06 Batch B — REAL existing accounting Command schema -> offline draft.
 * Pure and isolated. Does NOT replace current direct POST or post financial data.
 * The exact operationId must be generated ONCE and durably reused on retries.
 */
import { pendingCommand } from '../accounting/pending-command'
import { queueNew, type QueueItem } from '../sync/outbox-state'
import { assertOfflineAuthority, type VerifiedOfflineGrant } from './offline-authority'
import { SYNC_PROTOCOL_VERSION } from '../sync/protocol'

const uuid = (x: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(x)
export function createIsolatedAccountingDraft(args: {
  rawCommand: unknown
  actorId: string
  companyId: string
  operationId: string
  baseVersion: string | null
  createdAt: string
  verifiedGrant: VerifiedOfflineGrant | null
  nowMs: number
}): QueueItem {
  assertOfflineAuthority(args.verifiedGrant, args.actorId, args.companyId, args.nowMs, 'queue')
  if (!uuid(args.operationId)) throw new Error('ACCOUNTING_OPERATION_ID_INVALID')
  const command = pendingCommand(args.rawCommand)
  if (!command) throw new Error('ACCOUNTING_COMMAND_INVALID')
  if (command.company !== args.companyId) throw new Error('ACCOUNTING_COMPANY_MISMATCH')
  if (command.kind === 'reversal' && !command.reverses) throw new Error('ACCOUNTING_REVERSAL_TARGET_REQUIRED')
  if (command.kind !== 'reversal' && command.reverses !== null) throw new Error('ACCOUNTING_REVERSAL_ONLY')
  // Existing accounting API expects amount in minor units, not a decimal rupee value.
  const amount = BigInt(command.amount)
  if (amount <= 0n || amount > 999999999999n) throw new Error('ACCOUNTING_AMOUNT_INVALID')
  // The legacy API remains the sole live writer until a versioned, server-verified
  // sync endpoint accepts these envelopes. Never silently send this to /post.
  return queueNew({
    protocolVersion: SYNC_PROTOCOL_VERSION,
    actorId: args.actorId, companyId: args.companyId, operationId: args.operationId,
    commandType: 'accounting-post-draft', baseVersion: args.baseVersion,
    createdAt: args.createdAt, payload: { ...command },
  })
}
