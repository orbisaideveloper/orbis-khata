import { afterEach, expect, it, vi } from 'vitest'
import { createDocumentGateway } from './document-gateway'
afterEach(() => vi.useRealTimers())
it('allows anonymous viewers only public selected-draw PDF metadata, never the private dataset', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-21T12:00:00Z'))
  const document = vi.fn(async () => ({ date: '2026-11-20', slot: '6pm', sambadUrl: 'https://sambad.com/draw.pdf', prizes: ['private'] }))
  const handler = createDocumentGateway({ origins: ['https://app.test'], document })
  const request = (body: object, origin='https://app.test') => new Request('https://data.test/document', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const response = await handler(request({ date: '2026-11-20', slot: '6pm' }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ date: '2026-11-20', slot: '6pm', sambadUrl: 'https://sambad.com/draw.pdf' })
  expect((await handler(request({ date: '2000-01-01', slot: '6pm' }))).status).toBe(400)
  expect((await handler(request({}, 'https://evil.test'))).status).toBe(403)
  document.mockRejectedValueOnce(new Error('TICKET_BUSY'))
  const busy = await handler(request({ date: '2026-11-20', slot: '6pm' }))
  expect(busy.status).toBe(429)
  expect(busy.headers.get('retry-after')).toBe('30')
})
