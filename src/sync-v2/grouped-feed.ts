import type { Json } from './command.ts'
import { forEachInOrder } from './ordered-work.ts'

type Event = Readonly<{ seq: string; operationId: string | null; change: Json }>
type Group = Readonly<{ first: string; last: string; events: readonly Event[] }>
export type GroupedPage = Readonly<{ epoch: string; from: string; next: string; groups: readonly Group[] }>
type Cursor = Readonly<{ epoch: string; sequence: string }>
type FeedTransaction = Readonly<{
  readCursor: () => Promise<Cursor>
  recordInbox: (event: Event) => Promise<void>
  project: (event: Event) => Promise<void>
  writeCursor: (cursor: Cursor) => Promise<void>
}>
export type GroupedFeedStore = Readonly<{
  /** Serialize and commit or roll back all operations for one authorized scope. */
  transaction: (apply: (tx: FeedTransaction) => Promise<void>) => Promise<void>
}>

function sequence(value: string): bigint {
  if (!/^(0|[1-9]\d{0,18})$/u.test(value)) throw new Error('SYNC_FEED_SEQUENCE_INVALID')
  return BigInt(value)
}

function countValidatedEvents(page: GroupedPage, limit: number): number {
  let expected = sequence(page.from)
  let count = 0
  for (const group of page.groups) {
    if (!group.events.length || sequence(group.first) !== expected + 1n) throw new Error('SYNC_FEED_GROUP_INVALID')
    for (const event of group.events) {
      expected += 1n
      count += 1
      if (sequence(event.seq) !== expected || count > limit) throw new Error('SYNC_FEED_GROUP_INVALID')
    }
    if (sequence(group.last) !== expected) throw new Error('SYNC_FEED_GROUP_INVALID')
  }
  if (sequence(page.next) !== expected) throw new Error('SYNC_FEED_CURSOR_MISMATCH')
  return count
}

/** The adapter must compare the stored cursor and persist projection and cursor together. */
export async function applyGroupedPage(
  page: GroupedPage, epoch: string, cursor: string,
  commit: (page: GroupedPage) => Promise<void>,
  recovered = false,
): Promise<void> {
  const pageCopy = structuredClone(page)
  if (recovered && pageCopy.groups.length !== 1) throw new Error('SYNC_FEED_GROUP_INVALID')
  if (pageCopy.epoch !== epoch || pageCopy.from !== cursor) throw new Error('SYNC_FEED_SCOPE_OR_CURSOR')
  if (countValidatedEvents(pageCopy, recovered ? 16000 : 500)) await commit(pageCopy)
}

/** The caller binds the store to the same authorized scope as the verified page. */
export function persistGroupedPage(page: GroupedPage, expected: Cursor, store: GroupedFeedStore, recovered = false): Promise<void> {
  return applyGroupedPage(page, expected.epoch, expected.sequence, validated => store.transaction(async tx => {
    const current = await tx.readCursor()
    if (current.epoch !== validated.epoch || current.sequence !== validated.from) {
      throw new Error('SYNC_FEED_STORAGE_CURSOR_CHANGED')
    }
    await forEachInOrder(validated.groups.flatMap(group => group.events), async event => {
      await tx.recordInbox(event)
      await tx.project(event)
    })
    await tx.writeCursor({ epoch: validated.epoch, sequence: validated.next })
  }), recovered)
}
