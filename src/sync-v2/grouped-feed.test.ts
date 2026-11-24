import { expect, it, vi } from 'vitest'
import { applyGroupedPage, persistGroupedPage, type GroupedFeedStore, type GroupedPage } from './grouped-feed'

const page: GroupedPage = { epoch: 'current', from: '0', next: '2', groups: [{
  first: '1', last: '2', events: [
    { seq: '1', operationId: null, change: { entity: 'voucher' } },
    { seq: '2', operationId: 'invoice', change: { entity: 'invoice' } },
  ],
}] }

it('rejects interrupted groups, stale epochs and replay at an advanced cursor before committing', async () => {
  const commit = vi.fn()
  const partial = { ...page, groups: [{ ...page.groups[0], events: page.groups[0].events.slice(0, 1) }] }
  await expect(applyGroupedPage(partial, 'current', '0', commit)).rejects.toThrow('GROUP_INVALID')
  await expect(applyGroupedPage(page, 'old', '0', commit)).rejects.toThrow('SCOPE_OR_CURSOR')
  await expect(applyGroupedPage(page, 'current', '2', commit)).rejects.toThrow('SCOPE_OR_CURSOR')
  expect(commit).not.toHaveBeenCalled()
})

it('hands the entire page to one transaction and propagates a failed commit for retry', async () => {
  const commit = vi.fn().mockRejectedValueOnce(new Error('DISK_FULL')).mockResolvedValueOnce(undefined)
  await expect(applyGroupedPage(page, 'current', '0', commit)).rejects.toThrow('DISK_FULL')
  await applyGroupedPage(page, 'current', '0', commit)
  expect(commit.mock.calls).toEqual([[page], [page]])
})

it('rolls back inbox, projection and cursor together, then rejects a duplicate after restart', async () => {
  const initial = { epoch: 'current', sequence: '0' }
  let durable = { cursor: initial, inbox: [] as string[], projection: [] as string[] }
  let fail = true
  const store: GroupedFeedStore = {
    transaction: async apply => {
      const draft = structuredClone(durable)
      await apply({
        readCursor: async () => draft.cursor,
        recordInbox: async event => { draft.inbox.push(event.seq) },
        project: async event => {
          if (fail && event.seq === '2') throw new Error('WRITE_INTERRUPTED')
          draft.projection.push(event.seq)
        },
        writeCursor: async cursor => { draft.cursor = cursor },
      })
      durable = draft
    },
  }
  await expect(persistGroupedPage(page, initial, store)).rejects.toThrow('WRITE_INTERRUPTED')
  expect(durable).toEqual({ cursor: initial, inbox: [], projection: [] })
  fail = false
  await persistGroupedPage(page, initial, store)
  await expect(persistGroupedPage(page, initial, store)).rejects.toThrow('STORAGE_CURSOR_CHANGED')
  expect(durable).toEqual({
    cursor: { epoch: 'current', sequence: '2' },
    inbox: ['1', '2'],
    projection: ['1', '2'],
  })
})
