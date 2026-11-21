import { authClient } from '../auth/client'
import { parseTicket, parseVerdict } from './ticket'
import type { TicketInput } from './ticket'

export async function checkTicket(input: TicketInput, signal: AbortSignal) {
  const ticket = parseTicket(input)
  const base = import.meta.env.VITE_KHATA_DATA_URL as string | undefined
  if (!base) throw new Error('TICKET_NOT_CONFIGURED')
  const endpoint = new URL(base)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('TICKET_NOT_CONFIGURED')
  const ticketEndpoint = new URL('orbis-lottery-ticket', endpoint)
  const token = await authClient?.central.accessToken()
  if (!token) throw new Error('TICKET_LOGIN_REQUIRED')
  const response = await fetch(ticketEndpoint.href, { method: 'POST', signal, redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(ticket) })
  if (response.status === 429) throw new Error('TICKET_BUSY')
  if (response.status === 401) throw new Error('TICKET_LOGIN_REQUIRED')
  if (!response.ok) throw new Error('TICKET_UNAVAILABLE')
  const text = await response.text()
  if (text.length > 4096) throw new Error('TICKET_RESPONSE_INVALID')
  return parseVerdict(JSON.parse(text), ticket)
}
