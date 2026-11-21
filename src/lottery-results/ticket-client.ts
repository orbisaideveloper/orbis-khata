import { authClient } from '../auth/client'
import { parseTicket, parseVerdict } from './ticket'
import type { TicketInput } from './ticket'
import { parseDocuments, rememberDocument } from './document-feed'

export async function checkTicket(input: TicketInput, signal: AbortSignal) {
  const ticket = parseTicket(input)
  return parseVerdict(await requestLottery(ticket, signal), ticket)
}

export async function recoverDocument(date: string, slot: string, signal: AbortSignal) {
  const draw = parseTicket({ date, slot, series: '35B', number: '00000' })
  const response = await requestLottery({ action: 'document', date: draw.date, slot: draw.slot }, signal, true) as { date?: string; slot?: string; sambadUrl?: string | null }
  if (response.date !== date || response.slot !== slot) throw new Error('TICKET_RESPONSE_MISMATCH')
  if (response.sambadUrl === null) return null
  const document = parseDocuments({ schema: 1, documents: [response] })[0]
  if (!document) throw new Error('TICKET_RESPONSE_MISMATCH')
  return rememberDocument(document)
}

async function requestLottery(input: object, signal: AbortSignal, publicDocument = false): Promise<unknown> {
  const base = import.meta.env.VITE_KHATA_DATA_URL as string | undefined
  if (!base) throw new Error('TICKET_NOT_CONFIGURED')
  const endpoint = new URL(base)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('TICKET_NOT_CONFIGURED')
  const ticketEndpoint = new URL('orbis-lottery-ticket', endpoint)
  const token = publicDocument ? '' : await authClient?.central.accessToken()
  if (!publicDocument && !token) throw new Error('TICKET_LOGIN_REQUIRED')
  const response = await fetch(ticketEndpoint.href + (publicDocument ? '/document' : ''), { method: 'POST', signal, redirect: 'error', credentials: 'omit', cache: 'no-store', headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' }, body: JSON.stringify(input) })
  if (response.status === 429) throw new Error('TICKET_BUSY')
  if (response.status === 401) throw new Error('TICKET_LOGIN_REQUIRED')
  if (!response.ok) throw new Error('TICKET_UNAVAILABLE')
  const text = await response.text()
  if (text.length > 4096) throw new Error('TICKET_RESPONSE_INVALID')
  return JSON.parse(text)
}
