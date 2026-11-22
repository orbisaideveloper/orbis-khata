import { afterEach, expect, it, vi } from 'vitest'
declare global { var Deno: { env: { get: (name: string) => string | undefined }; serve: (handler: (request: Request) => Promise<Response>) => void } }
const provider = vi.hoisted(() => vi.fn())
vi.mock('./live-provider.ts', () => ({ fetchLiveVideo: provider }))
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); provider.mockReset() })
it('serves shared cache without YouTube discovery and rejects unrelated origins', async () => {
 let handler!: (request: Request) => Promise<Response>
 vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'SUPABASE_URL' ? 'https://db.test' : 'synthetic' }, serve: (fn: typeof handler) => { handler = fn } })
 const payload = { videoId: 'abcdefghijk' }
 const fetcher = vi.fn().mockResolvedValue(Response.json({ state: 'wait', payload }))
 vi.stubGlobal('fetch', fetcher)
 await import('../../supabase/functions/orbis-lottery-live/index')
 expect((await handler(new Request('https://edge.test', { headers: { origin: 'https://evil.test' } }))).status).toBe(403)
 const response = await handler(new Request('https://edge.test'))
 expect((await response.json()).video).toEqual(payload)
 expect(response.headers.get('cache-control')).toContain('max-age=15')
 expect(provider).not.toHaveBeenCalled()
 expect(String(fetcher.mock.calls[0][0])).toContain('lottery_live_draw_claim')
})
it('finishes a failed verification without discarding the cached video', async () => {
 let handler!: (request: Request) => Promise<Response>
 vi.stubGlobal('Deno', { env: { get: () => 'synthetic' }, serve: (fn: typeof handler) => { handler = fn } })
 const payload = { videoId: 'abcdefghijk' }
 const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ state: 'claim', lease: 'lease', payload })).mockResolvedValueOnce(Response.json(payload))
 vi.stubGlobal('fetch', fetcher)
 provider.mockRejectedValue(new Error('LIVE_PROVIDER_LIMIT'))
 await import('../../supabase/functions/orbis-lottery-live/index')
 const response = await handler(new Request('https://edge.test'))
 expect((await response.json()).video).toEqual(payload)
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ p_lease: 'lease', p_failed: true, p_payload: null })
 expect(provider.mock.calls[0][4]).toBe('abcdefghijk')
})
