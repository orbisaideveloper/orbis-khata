/**
 * Backend-independent accounting sync contract (draft v1).
 * No persistence, networking or live-posting behavior is enabled by this module.
 * Implement the durable store, client auth and server receipts in later guarded steps.
 */
export const SYNC_PROTOCOL_VERSION = 1 as const

type SyncDisposition = 'accepted' | 'already-applied' | 'conflict' | 'rejected'

/** Values are opaque identifiers; authorization MUST be checked on the server. */
export type SyncEnvelope = Readonly<{
  protocolVersion: typeof SYNC_PROTOCOL_VERSION
  operationId: string
  actorId: string
  companyId: string
  commandType: string
  baseVersion: string | null
  createdAt: string
  payload: Readonly<Record<string, unknown>>
}>

export type SyncReceipt = Readonly<{
  protocolVersion: typeof SYNC_PROTOCOL_VERSION
  operationId: string
  companyId: string
  disposition: SyncDisposition
  serverCursor: string | null
  reason: string | null
}>

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)

const opaqueId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[\w-]+$/u.test(value)

const version = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && value.length <= 128 && /^[\w.:-]+$/u.test(value))

export function parseSyncEnvelope(value: unknown): SyncEnvelope | null {
  if (!object(value)) return null
  const expected = ['actorId', 'baseVersion', 'commandType', 'companyId', 'createdAt', 'operationId', 'payload', 'protocolVersion']
  if (Object.keys(value).sort().join(',') !== expected.join(',')) return null
  if (value.protocolVersion !== SYNC_PROTOCOL_VERSION || !uuid(value.operationId)) return null
  if (!opaqueId(value.actorId) || !opaqueId(value.companyId)) return null
  if (typeof value.commandType !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.commandType)) return null
  if (!version(value.baseVersion) || !object(value.payload)) return null
  if (typeof value.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value.createdAt)) return null
  if (Number.isNaN(Date.parse(value.createdAt))) return null
  try {
    const serialized = JSON.stringify(value.payload)
    if (!serialized || serialized.length > 131072) return null
  } catch { return null }
  return value as SyncEnvelope
}

export function parseSyncReceipt(value: unknown): SyncReceipt | null {
  if (!object(value) || value.protocolVersion !== SYNC_PROTOCOL_VERSION || !uuid(value.operationId) || !opaqueId(value.companyId)) return null
  if (!['accepted', 'already-applied', 'conflict', 'rejected'].includes(String(value.disposition))) return null
  if (!version(value.serverCursor) || !version(value.reason)) return null
  const disposition = value.disposition as SyncDisposition
  if ((disposition === 'accepted' || disposition === 'already-applied') && value.serverCursor === null) return null
  if ((disposition === 'conflict' || disposition === 'rejected') && value.reason === null) return null
  return {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    operationId: value.operationId,
    companyId: value.companyId,
    disposition,
    serverCursor: value.serverCursor as string | null,
    reason: value.reason as string | null,
  }
}

/** Never treat an unrelated company's or operation's acknowledgement as success. */
export function confirmedReceipt(operation: SyncEnvelope, response: unknown): boolean {
  const receipt = parseSyncReceipt(response)
  return receipt !== null &&
    receipt.operationId === operation.operationId &&
    receipt.companyId === operation.companyId &&
    (receipt.disposition === 'accepted' || receipt.disposition === 'already-applied')
}
