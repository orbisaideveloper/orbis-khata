import { readTicketText, parseTicket, parseVerdict, type TicketInput, type TicketVerdict } from './ticket.ts'

type Options = { origins: string[]; verify: (token: string) => Promise<{ orbisIdentityId: string } | null>; lookup: (ticket: TicketInput) => Promise<TicketVerdict>; document?: (date: string, slot: string) => Promise<{ date: string; slot: string; sambadUrl: string | null }>; now?: () => number }

function ticketFailure(error: unknown) {
  return error instanceof Error && ['TICKET_BUSY', 'KHATA_RATE_LIMITED'].includes(error.message)
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
    let stage = 'session-verification'
    const requestId = crypto.randomUUID()
    try {
      const actor = await options.verify(authorization.slice(7))
      if (!actor) return reply(401, 'TICKET_LOGIN_REQUIRED')
      const now = (options.now ?? Date.now)()
      if (!admitTicket(attempts, actor.orbisIdentityId, now)) return reply(429, 'TICKET_BUSY')
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'TICKET_INPUT_INVALID')
      if (Number(request.headers.get('content-length')) > 1024) return reply(413, 'TICKET_INPUT_TOO_LARGE')
      let text: string
      try { text = await readTicketText(request.body, 1024) } catch { return reply(413, 'TICKET_INPUT_TOO_LARGE') }
      let parsed: ReturnType<typeof gatewayInput>
      try { parsed = gatewayInput(text, Boolean(options.document)) }
      catch { return reply(400, 'TICKET_INPUT_INVALID') }
      const { ticket, documentAction } = parsed
      stage = 'provider-lookup'
      if (documentAction && options.document) return new Response(JSON.stringify(await options.document(ticket.date, ticket.slot)), { headers })
      const result = parseVerdict(await options.lookup(ticket), ticket)
      return new Response(JSON.stringify(result), { headers })
    } catch (error) {
      const code = ticketDiagnostic(error)
      console.warn('LOTTERY_TICKET_FAILURE', { stage, code, requestId })
      headers.set('x-orbis-request-id', requestId)
      return ticketFailure(error) ? reply(429, 'TICKET_BUSY') : reply(503, 'TICKET_UNAVAILABLE')
    }
  }
}

function ticketDiagnostic(error: unknown) {
  const known = ['TICKET_UNAVAILABLE', 'DRAW_PENDING', 'DRAW_CACHE_UNAVAILABLE', 'INVALID_DRAW_JSON', 'TICKET_BUSY', 'TICKET_NOT_CONFIGURED', 'TICKET_PROVIDER_AUTH_REJECTED', 'TICKET_PROVIDER_UNAVAILABLE', 'TICKET_RESPONSE_MISMATCH', 'TICKET_RESPONSE_INVALID', 'TICKET_RESPONSE_TOO_LARGE', 'TICKET_BODY_TOO_LARGE', 'CENTRAL_UNAVAILABLE', 'CENTRAL_RESPONSE_INVALID', 'KHATA_RATE_LIMITED']
  if (error instanceof Error && known.includes(error.message)) return error.message
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return 'UPSTREAM_TIMEOUT'
  return 'UNEXPECTED_UPSTREAM_FAILURE'
}

function gatewayInput(text: string, documentsEnabled: boolean) {
  const input = JSON.parse(text)
  const documentAction = input?.action === 'document' && documentsEnabled
  const ticket = parseTicket(documentAction ? { date: input.date, slot: input.slot, series: '35B', number: '00000' } : input)
  return { ticket, documentAction }
}
