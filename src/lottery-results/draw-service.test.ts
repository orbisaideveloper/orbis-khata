import { expect, it, vi } from 'vitest'
import { createDrawService } from './draw-service'
import { drawFixture } from './draw.fixture'
import { normalizeDraw } from './draw-json'
const date = '2026-11-20', slot = '8pm'
it('reuses ready private JSON for any ticket without touching the provider', async () => {
  const fetchImpl = vi.fn<typeof fetch>()
  const rpc = vi.fn(async () => ({ state: 'ready', payload: normalizeDraw(drawFixture(), date, slot), pdf: 'https://sambad.com/draw.pdf' }))
  const load = createDrawService({ rpc, token: () => 'private', fetchImpl })
  expect((await load(date, slot)).draw.date).toBe(date)
  expect(fetchImpl).not.toHaveBeenCalled()
})
it('only the admitted lease fetches one full result, verifies PDF and commits private data', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ state: 'claim', lease: 'lease' }).mockResolvedValueOnce(true)
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: true, data: drawFixture() })).mockResolvedValueOnce(new Response('%PDF-fixture'))
  const result = await createDrawService({ rpc, fetchImpl, token: () => 'server-only-token' })(date, slot, true)
  expect(result.pdf).toBe('https://sambad.com/draw.pdf')
  expect(fetchImpl.mock.calls[0][0]).toContain('/v2/dear/result?')
  expect(fetchImpl.mock.calls[0][0]).not.toContain('/ticket/check')
  expect(JSON.stringify(rpc.mock.calls)).not.toContain('server-only-token')
  expect(rpc.mock.calls[1][1].p_payload.prizes).toHaveLength(6)
})
it('rejects concurrent waits and wrong/incomplete JSON without no-prize or leaked URLs', async () => {
  const fetchImpl = vi.fn<typeof fetch>()
  await expect(createDrawService({ rpc: async () => ({ state: 'wait' }), fetchImpl, token: () => '' })(date, slot)).rejects.toThrow('TICKET_BUSY')
  expect(fetchImpl).not.toHaveBeenCalled()
  const wrong = drawFixture(); wrong.slot = '6pm'
  for (const response of [Response.json({ success: true, data: wrong }), new Response('', { status: 429, headers: { 'retry-after': '60' } }), Response.json({ success: true, data: { ...drawFixture(), status: 'pending' } })]) {
    const rpc = vi.fn().mockResolvedValueOnce({ state: 'claim', lease: 'lease' }).mockResolvedValueOnce(true)
    const load = createDrawService({ rpc, fetchImpl: async () => response, token: () => 'private' })
    await expect(load(date, slot)).rejects.toThrow()
    expect(rpc.mock.calls[1][1].p_payload).toBeNull()
    expect(rpc.mock.calls[1][1].p_pdf).toBeNull()
  }
})
it('keeps valid JSON usable if the PDF is unavailable; a stale completion is never served', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ state: 'claim', lease: 'lease' }).mockResolvedValueOnce(true)
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: true, data: drawFixture() })).mockResolvedValueOnce(new Response('not a PDF'))
  expect((await createDrawService({ rpc, fetchImpl, token: () => 'private' })(date, slot)).draw.prizes).toHaveLength(6)
  expect(rpc.mock.calls[1][1].p_reason).toBe('PDF_PENDING')
  const stale = vi.fn().mockResolvedValueOnce({ state: 'claim', lease: 'lease' }).mockResolvedValueOnce(false)
  await expect(createDrawService({ rpc: stale, fetchImpl: async () => Response.json({ success: true, data: { ...drawFixture(), files: {} } }), token: () => 'private' })(date, slot)).rejects.toThrow('TICKET_BUSY')
})

it('reads a fragmented PDF signature and rejects a truncated stream', async () => {
  for (const chunks of [['%', 'P', 'D', 'F', '-'], ['%', 'P']]) {
    const rpc = vi.fn().mockResolvedValueOnce({ state: 'claim', lease: 'lease' }).mockResolvedValueOnce(true)
    const stream = new ReadableStream({ start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    } })
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: true, data: drawFixture() })).mockResolvedValueOnce(new Response(stream))
    const result = await createDrawService({ rpc, fetchImpl, token: () => 'private' })(date, slot, true)
    expect(result.pdf).toBe(chunks.length === 5 ? 'https://sambad.com/draw.pdf' : null)
    expect(result.draw.prizes).toHaveLength(6)
  }
})
