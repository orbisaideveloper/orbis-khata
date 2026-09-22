import { beforeEach, expect, it, vi } from 'vitest'
import { companies, createRecord, post, rejected, report } from './api'
const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), insert: vi.fn(), single: vi.fn(), rpc: vi.fn() }))
vi.mock('../auth/client', () => ({ authClient: db }))
beforeEach(() => {
  vi.resetAllMocks()
  for (const fn of [db.from, db.select, db.eq, db.order, db.insert]) fn.mockReturnValue(db)
})
it('loads all owner companies across API pages', async () => {
  db.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: String(i) })), error: null }).mockResolvedValueOnce({ data: [{ id: 'last', name: 'last' }], error: null })
  expect(await companies('u')).toHaveLength(501)
  expect(db.eq).toHaveBeenCalledWith('owner_id', 'u'); expect(db.range).toHaveBeenLastCalledWith(500, 999)
})
it('resolves a repeated creation by exact id and payload, not by name', async () => {
  const row = { id: 'c', owner_id: 'u', name: 'Shop' }
  db.single.mockResolvedValueOnce({ error: { code: '23505' } }).mockResolvedValueOnce({ data: row, error: null })
  expect(await createRecord('khata_companies', row)).toEqual({ id: 'c', name: 'Shop' })
  expect(db.eq).toHaveBeenCalledWith('id', 'c')
})
it('does not accept a conflicting create payload', async () => {
  db.single.mockResolvedValueOnce({ error: { code: '23505' } }).mockResolvedValueOnce({ data: { id: 'c', name: 'Other' }, error: null })
  await expect(createRecord('khata_companies', { id: 'c', name: 'Shop' })).rejects.toMatchObject({ code: '23505' })
})
it('sends amounts as exact strings and identity to the transaction RPC', async () => {
  db.rpc.mockResolvedValue({ error: null })
  await post({ id: 'v', company: 'c', party: 'p', kind: 'sale', date: '2026-09-21', amount: '999999999999', method: 'cash', reference: 'Bill 1', note: '', reverses: null })
  expect(db.rpc).toHaveBeenCalledWith('khata_post_v1', expect.objectContaining({ p_amount: '999999999999', p_company: 'c', p_party: 'p', p_id: 'v' }))
})
it('uses server aggregate rather than summing a limited client page', async () => {
  db.rpc.mockResolvedValue({ data: { count: 1001 }, error: null })
  expect(await report('c', '2026-09-01', '2026-09-21', 'p', 1000)).toEqual({ count: 1001 })
  expect(db.rpc).toHaveBeenCalledWith('khata_report_v1', { p_company: 'c', p_from: '2026-09-01', p_to: '2026-09-21', p_party: 'p', p_offset: 1000 })
})
it('distinguishes a definite SQL rejection from an uncertain connection failure', () => {
  expect(rejected({ code: '23505' })).toBe(true)
  expect(rejected({ code: 'P0001' })).toBe(true)
  expect(rejected({ code: '08006' })).toBe(false)
  expect(rejected(new Error('offline'))).toBe(false)
})
