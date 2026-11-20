import { expect, it, vi, beforeEach } from 'vitest'
import { syncWebLottery } from './lottery-sync'

const fake = vi.hoisted(() => ({ read: vi.fn(), state: vi.fn(), save: vi.fn(), rows: vi.fn(), outbox: vi.fn() }))
vi.mock('../accounting/api', () => ({ readOnlineLotteryExport: fake.read }))
vi.mock('./runtime', () => ({ readNativeLotterySyncState: fake.state, syncNativeLottery: fake.save }))
vi.mock('../../vendor/foundation-lottery/src/admin/models/lotteryAccountingLocalStore', () => ({
  getLotteryAccountingLocalStore: () => ({ listSellerRows: fake.rows, listPendingOutbox: fake.outbox }),
}))
beforeEach(() => {
  vi.resetAllMocks()
  fake.read.mockResolvedValue({ state: { foundationAccountingOrganization: [{ id: 'org' }] } })
  fake.state.mockResolvedValue({ organizations: [], linked: false })
  fake.rows.mockResolvedValue([])
  fake.outbox.mockResolvedValue([])
  fake.save.mockResolvedValue({ changed: true })
})

it('coalesces concurrent pulls and reads only the matching owner partition', async () => {
  await Promise.all([syncWebLottery('owner'), syncWebLottery('owner')])
  expect(fake.save).toHaveBeenCalledOnce()
  expect(fake.rows).toHaveBeenCalledExactlyOnceWith({ ownerKind: 'PUBLIC_USER', ownerId: 'owner', organizationId: 'org' })
})

it('blocks both local device drafts and pending outbox before the financial import', async () => {
  fake.rows.mockResolvedValueOnce([{ syncState: 'LOCAL_SAVED' }])
  await expect(syncWebLottery('owner')).rejects.toThrow('LOTTERY_SYNC_PENDING_ROWS')
  fake.outbox.mockResolvedValueOnce([{ id: 'pending' }])
  await expect(syncWebLottery('owner')).rejects.toThrow('LOTTERY_SYNC_PENDING_ROWS')
  expect(fake.save).not.toHaveBeenCalled()
})

it('starts independent company reads together but never imports before every partition is checked', async () => {
  fake.state.mockResolvedValue({ organizations: ['local-only'], linked: true })
  let release: (rows: unknown[]) => void = () => undefined
  fake.rows.mockImplementation((scope: { organizationId: string }) => scope.organizationId === 'local-only'
    ? new Promise(resolve => { release = resolve })
    : Promise.resolve([]))
  const sync = syncWebLottery('owner')
  await vi.waitFor(() => expect(fake.rows).toHaveBeenCalledTimes(2))
  expect(fake.rows.mock.calls.map(([scope]) => scope)).toEqual([
    { ownerKind: 'PUBLIC_USER', ownerId: 'owner', organizationId: 'local-only' },
    { ownerKind: 'PUBLIC_USER', ownerId: 'owner', organizationId: 'org' },
  ])
  expect(fake.save).not.toHaveBeenCalled()
  release([])
  await sync
  expect(fake.save).toHaveBeenCalledOnce()
})

it('fails closed when a second company has an unsynced write or storage read fails', async () => {
  fake.state.mockResolvedValue({ organizations: ['local-only'], linked: true })
  fake.outbox.mockImplementation((scope: { organizationId: string }) => Promise.resolve(scope.organizationId === 'org' ? [{ id: 'pending' }] : []))
  await expect(syncWebLottery('owner')).rejects.toThrow('LOTTERY_SYNC_PENDING_ROWS')
  fake.outbox.mockResolvedValue([])
  fake.rows.mockRejectedValueOnce(new Error('storage unavailable'))
  await expect(syncWebLottery('owner')).rejects.toThrow('storage unavailable')
  expect(fake.save).not.toHaveBeenCalled()
})
