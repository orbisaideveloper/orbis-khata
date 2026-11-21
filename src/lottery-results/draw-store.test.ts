import { expect, it, vi } from 'vitest'
import { createDrawRpc } from './draw-store'
it('uses only fixed private RPC names with server credentials and bounded responses', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ state: 'wait' }))
  const rpc = createDrawRpc('https://fixture.supabase.co', 'server-secret', fetchImpl)
  expect(await rpc('lottery_draw_claim', { p_date: '2026-11-20' })).toEqual({ state: 'wait' })
  expect(fetchImpl.mock.calls[0][0]).toBe('https://fixture.supabase.co/rest/v1/rpc/lottery_draw_claim')
  await expect(rpc('arbitrary', {})).rejects.toThrow('TICKET_NOT_CONFIGURED')
  await expect(createDrawRpc('http://evil.test', 'key', fetchImpl)('lottery_draw_claim', {})).rejects.toThrow()
  await expect(createDrawRpc('https://fixture.supabase.co', '', fetchImpl)('lottery_draw_claim', {})).rejects.toThrow()
  await expect(createDrawRpc('https://fixture.supabase.co', 'key', async () => new Response('private', { status: 403 }))('lottery_draw_claim', {})).rejects.toThrow('DRAW_CACHE_UNAVAILABLE')
  await expect(createDrawRpc('https://fixture.supabase.co', 'key', async () => new Response('x'.repeat(65537)))('lottery_draw_claim', {})).rejects.toThrow('TICKET_BODY_TOO_LARGE')
})
