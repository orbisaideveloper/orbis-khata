import { readTicketText, parseTicket, parseVerdict, type TicketInput, type TicketVerdict } from './ticket.ts'

type Options = { origins: string[]; verify: (token: string) => Promise<{ orbisIdentityId: string } | null>; lookup: (ticket: TicketInput) => Promise<TicketVerdict>; now?: () => number }

function ticketFailure(error: unknown) {
  return error instanceof Error && error.message === 'TICKET_BUSY'
}

function admitTicket(attempts: Map<string, number>, identity: string, now: number) {
  for (const [key, expires] of attempts) if (expires <= now) attempts.delete(key)
  if ((attempts.get(identity) ?? 0) > now || attempts.size >= 2000) return false
  attempts.set(identity, now + 3000)
  return true
}

export function createTicketGateway(options: Options) {
  const attempts = new Map<string, number>()
  return async (request: Request) => {
    const origin = request.headers.get('origin') ?? ''
    const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin' })
    const reply = (status: number, code: string) => {
      if (status === 429) headers.set('retry-after', '3')
      return new Response(JSON.stringify({ code }), { status, headers })
    }
    if (!options.origins.includes(origin)) return reply(403, 'TICKET_ORIGIN_DENIED')
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-methods', 'POST, OPTIONS')
    headers.set('access-control-allow-headers', 'authorization, content-type')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, 'TICKET_METHOD_DENIED')
    const authorization = request.headers.get('authorization') ?? ''
    if (!/^Bearer [^\s]{1,8192}$/.test(authorization)) return reply(401, 'TICKET_LOGIN_REQUIRED')
    try {
      const actor = await options.verify(authorization.slice(7))
      if (!actor) return reply(401, 'TICKET_LOGIN_REQUIRED')
      const now = (options.now ?? Date.now)()
      if (!admitTicket(attempts, actor.orbisIdentityId, now)) return reply(429, 'TICKET_BUSY')
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'TICKET_INPUT_INVALID')
      if (Number(request.headers.get('content-length')) > 1024) return reply(413, 'TICKET_INPUT_TOO_LARGE')
      let text: string
      try { text = await readTicketText(request.body, 1024) } catch { return reply(413, 'TICKET_INPUT_TOO_LARGE') }
      let ticket: TicketInput
      try { ticket = parseTicket(JSON.parse(text)) } catch { return reply(400, 'TICKET_INPUT_INVALID') }
      const result = parseVerdict(await options.lookup(ticket), ticket)
      return new Response(JSON.stringify(result), { headers })
    } catch (error) { return ticketFailure(error) ? reply(429, 'TICKET_BUSY') : reply(503, 'TICKET_UNAVAILABLE') }
  }
}
