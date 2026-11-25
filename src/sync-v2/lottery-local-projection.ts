import { assembleRecoveryTransfer, type RecoveryFragment } from './recovery-assembly.ts'
import type { Json } from './command.ts'
import type { ProjectionChange } from './local-feed.ts'

/** A Lottery row uses the same model, identity, and ordinal in the snapshot and feed. */
export function lotteryLocalRow(organization: string, input: Json): ProjectionChange {
  if (input === null || typeof input !== 'object' || !('model' in input) ||
      typeof input.model !== 'string' || !('id' in input) || typeof input.id !== 'string' ||
      !('ordinal' in input) || typeof input.ordinal !== 'string' || !/^[1-9]\d{0,18}$/u.test(input.ordinal) ||
      !('projectionJson' in input) || (input.projectionJson !== null && typeof input.projectionJson !== 'string')) {
    throw new Error('SYNC_LOCAL_LOTTERY_ROW_INVALID')
  }
  const { model, id, ordinal, projectionJson } = input
  const isOrganization = model === 'foundationAccountingOrganization'
  const row = projectionJson === null ? null : JSON.parse(projectionJson) as { id?: unknown; organizationId?: unknown } | null
  if (isOrganization ? id !== organization : projectionJson !== null && row?.organizationId !== organization) {
    throw new Error('SYNC_LOCAL_LOTTERY_ROW_SCOPE')
  }
  if (projectionJson !== null && row?.id !== id) throw new Error('SYNC_LOCAL_LOTTERY_ROW_ID')
  // Retain exact JSON text and decimal ordinal. Controlled consumers decode the model.
  return { collection: model, id, value: projectionJson === null ? null : { ordinal, projectionJson } }
}

type LotterySnapshotCursor = { after: string; head: string | null }
type SnapshotPage = {
  projection: string; scopeId: string; epoch: string; highWater: string;
  after: string; next: string; done: boolean; rows: readonly Json[];
}

function readSnapshotPage(raw: unknown, organization: string, epoch: string, cursor: LotterySnapshotCursor) {
  const page = raw as Partial<SnapshotPage> | null
  const sequence = /^(0|[1-9]\d{0,18})$/u
  if (page?.projection !== 'lottery-organization-v1' || page.scopeId !== organization ||
      page.epoch !== epoch || page.after !== cursor.after || typeof page.highWater !== 'string' ||
      !sequence.test(page.highWater) || (cursor.head !== null && page.highWater !== cursor.head) ||
      typeof page.next !== 'string' || !sequence.test(page.next) || typeof page.done !== 'boolean' ||
      !Array.isArray(page.rows) || page.rows.length > 200) throw new Error('SYNC_LOTTERY_SNAPSHOT_INVALID')
  return { highWater: page.highWater, next: page.next, done: page.done, rows: page.rows as readonly Json[] }
}

/** Install only a complete snapshot. A stale or interrupted page leaves existing data in place. */
export async function bootstrapLotteryProjection(
  organization: string,
  epoch: string,
  readPage: (cursor: LotterySnapshotCursor) => Promise<unknown>,
  install: (cursor: { epoch: string; sequence: string }, records: readonly ProjectionChange[]) => Promise<void>,
) {
  let after = '0'
  let head: string | null = null
  const records: ProjectionChange[] = []
  // An initial snapshot represents current rows, not a change history.
  // Repeated model/ID entries could replay an old value or hide a duplicate row.
  const seen = new Set<string>()
  let bytes = 0
  const encoder = new TextEncoder()
  async function* pages() {
    for (let index = 0; index < 16000; index++) yield readPage({ after, head })
  }
  for await (const raw of pages()) {
    const page = readSnapshotPage(raw, organization, epoch, { after, head })
    head = page.highWater
    let ordinal = BigInt(after)
    for (const input of page.rows) {
      const record = lotteryLocalRow(organization, input)
      const identity = JSON.stringify([record.collection, record.id])
      if (seen.has(identity)) throw new Error('SYNC_LOTTERY_SNAPSHOT_INVALID')
      seen.add(identity)
      const row = record.value as { ordinal?: string } | null
      if (!row?.ordinal || BigInt(row.ordinal) <= ordinal) throw new Error('SYNC_LOTTERY_SNAPSHOT_INVALID')
      ordinal = BigInt(row.ordinal)
      records.push(record)
      bytes += encoder.encode(JSON.stringify(record)).byteLength
      if (records.length > 16000 || bytes > 16_777_216) throw new Error('SYNC_LOTTERY_SNAPSHOT_LIMIT')
    }
    if (String(ordinal) !== page.next || (!page.done && page.next === after)) throw new Error('SYNC_LOTTERY_SNAPSHOT_INVALID')
    if (page.done) return install({ epoch, sequence: head }, records)
    after = page.next
  }
  throw new Error('SYNC_LOTTERY_SNAPSHOT_LIMIT')
}


type SnapshotPart = { scopeId: string; epoch: string; highWater: string; after: string; next: string; done: boolean; fragment: RecoveryFragment }

/** Fall back to one verified row when the regular snapshot cannot fit a bounded page. */
export function createLotterySnapshotReader(
  request: <T>(operation: string, input: unknown) => Promise<T>,
  binding: { organization: string; epoch: string; registration: string; credential: string },
) {
  const { organization, epoch, registration, credential } = binding
  const authorizedScope = { organization, epoch, registration, credential }
  return async ({ after, head }: LotterySnapshotCursor): Promise<unknown> => {
    try {
      return await request('lottery-sync', { action: 'snapshot', ...authorizedScope, after, head, limit: 100 })
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error) ||
          error.code !== 'SYNC_LOTTERY_SNAPSHOT_PAGE_TOO_LARGE') throw error
    }
    const part = (offset: number, expectedHead: string | null) => request<SnapshotPart>('lottery-sync',
      { action: 'snapshot-part', ...authorizedScope, after, head: expectedHead, offset })
    const first = await part(0, head)
    if (first.scopeId !== organization || first.epoch !== epoch || first.after !== after ||
        (head !== null && first.highWater !== head) || typeof first.done !== 'boolean') {
      throw new Error('SYNC_LOTTERY_SNAPSHOT_INVALID')
    }
    const rows = await assembleRecoveryTransfer({ version: 1, purpose: 'snapshot', scopeKind: 'lottery-organization',
      scopeId: organization, epoch, from: null, next: first.highWater, items: 1,
      transfer: first.fragment.transfer, bytes: first.fragment.size },
    { purpose: 'snapshot', scopeKind: 'lottery-organization', scopeId: organization, epoch, from: null },
    async (_item, offset) => {
      const next = offset === 0 ? first : await part(offset, first.highWater)
      if (next.scopeId !== organization || next.epoch !== epoch || next.after !== after ||
          next.highWater !== first.highWater || next.next !== first.next || next.done !== first.done) {
        throw new Error('SYNC_LOTTERY_SNAPSHOT_INVALID')
      }
      return next.fragment
    })
    return { projection: 'lottery-organization-v1', scopeId: organization, epoch,
      highWater: first.highWater, after, next: first.next, done: first.done, rows }
  }
}
