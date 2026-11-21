import { expect, it, vi } from 'vitest'
import { createDrawWorker } from './draw-worker'
it('denies public calls before touching the queue, and does not expose stored numbers', async () => {
  const rpc = vi.fn(), load = vi.fn()
  const worker = createDrawWorker(rpc, load)
  expect((await worker(new Request('https://example.test', { method: 'POST' }))).status).toBe(401)
  expect(rpc).not.toHaveBeenCalled()
  rpc.mockResolvedValueOnce(true).mockResolvedValueOnce([])
  const response = await worker(new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer ' + 'a'.repeat(64) } }))
  expect(response.status).toBe(200)
  expect(await response.text()).toContain('NO_PENDING_DRAW')
  expect(load).not.toHaveBeenCalled()
})
it('checks one authenticated bounded queue item and reports pending without claiming success', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-21T12:00:00Z'))
  try {
    const request = () => new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer ' + 'a'.repeat(64) } })
    const rpc = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce([{ date: '2026-11-20', slot: '6pm' }])
    const load = vi.fn(async () => { throw new Error('DRAW_PENDING') })
    expect((await createDrawWorker(rpc, load)(request())).status).toBe(202)
    expect(load).toHaveBeenCalledWith('2026-11-20', '6pm', true)
    const invalidQueue = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce([{}, {}])
    expect((await createDrawWorker(invalidQueue, load)(request())).status).toBe(503)
    expect((await createDrawWorker(async () => false, load)(request())).status).toBe(403)
  } finally { vi.useRealTimers() }
})
