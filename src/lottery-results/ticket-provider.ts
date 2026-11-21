import { readTicketText, parseVerdict, type TicketInput, type TicketVerdict } from './ticket.ts'

type ProviderOptions = { token: () => string; fetchImpl?: typeof fetch; now?: () => number }

export function createTicketLookup(options: ProviderOptions) {
  const cache = new Map<string, { value: TicketVerdict; until: number }>()
  const pending = new Map<string, Promise<TicketVerdict>>()
  let nextRequest = 0
  const fetchDraw = async (ticket: TicketInput): Promise<TicketVerdict> => {
    const token = options.token()
    if (!token || token.length > 4096) throw new Error('TICKET_NOT_CONFIGURED')
    const now = (options.now ?? Date.now)()
    if (now < nextRequest) throw new Error('TICKET_BUSY')
    nextRequest = now + 1100
    const date = ticket.date.split('-').reverse().join('-')
    const query = new URLSearchParams({ lottery: 'dear', date, slot: ticket.slot, series: ticket.series, number: ticket.number, 'access-token': token })
    const response = await (options.fetchImpl ?? fetch)('https://api.sambad.com/v2/ticket/check?' + query, { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } })
    if (response.status === 429) throw new Error('TICKET_BUSY')
    if (!response.ok) throw new Error('TICKET_PROVIDER_UNAVAILABLE')
    if (Number(response.headers.get('content-length')) > 32768) throw new Error('TICKET_RESPONSE_TOO_LARGE')
    const text = await readTicketText(response.body, 32768)
    const body = JSON.parse(text)
    const value = body?.data
    if (body?.success !== true || value?.lottery !== 'dear' || value.date !== date || value.slot !== ticket.slot || value.ticket?.series !== ticket.series || value.ticket?.number !== ticket.number) throw new Error('TICKET_RESPONSE_MISMATCH')
    return parseVerdict({ ...ticket, status: value.status, prize: value.prize === null ? null : { tier: value.prize?.tier, amount: value.prize?.amount } }, ticket)
  }
  return async (ticket: TicketInput) => {
    const key = [ticket.date, ticket.slot, ticket.series, ticket.number].join(':')
    const now = (options.now ?? Date.now)()
    for (const [id, row] of cache) if (row.until <= now) cache.delete(id)
    const saved = cache.get(key)
    if (saved) return structuredClone(saved.value)
    const active = pending.get(key)
    if (active) return structuredClone(await active)
    const operation = fetchDraw(ticket)
    pending.set(key, operation)
    try {
      const value = await operation
      if (cache.size >= 256) cache.delete(cache.keys().next().value!)
      const ttl = value.status === 'win' || value.status === 'no_prize' ? 60000 : 5000
      cache.set(key, { value: structuredClone(value), until: now + ttl })
      return value
    } finally { pending.delete(key) }
  }
}
