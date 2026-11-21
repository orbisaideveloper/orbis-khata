import { expect, it, vi } from 'vitest'
import { createTicketVerifier } from './ticket-verifier'

it('uses the existing service verification key instead of the unavailable public endpoint', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 403 }))
  const key = 'synthetic-service-verification-key-32chars'
  const verify = createTicketVerifier('https://admin.example', key, fetchImpl)
  await expect(verify('synthetic-session')).resolves.toBeNull()
  expect(fetchImpl.mock.calls[0][0]).toBe('https://admin.example/api/v1/service/customer/session')
  expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ 'x-orbis-verification-key': key, authorization: 'Bearer synthetic-session' })
})
it('retains explicit no-key trial compatibility but rejects malformed configured keys', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 401 }))
  await createTicketVerifier('https://admin.example', '', fetchImpl)('fixture')
  expect(fetchImpl.mock.calls[0][0]).toBe('https://admin.example/api/v1/customer/session')
  expect(() => createTicketVerifier('https://admin.example', 'short', fetchImpl)).toThrow('TICKET_VERIFICATION_KEY_INVALID')
})
