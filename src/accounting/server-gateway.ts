import { expenseCommand } from './expense-model.ts'
type Operation = 'companies' | 'create' | 'report' | 'post' | 'expense-report' | 'expense-post'
export type KhataPrincipal = { orbisIdentityId: string; displayId: string }
export type KhataOperation = { operation: Operation; input: Record<string, unknown> }
const identity = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function keys(value: Record<string, unknown>, allowed: readonly string[]) { return Object.keys(value).every(key => allowed.includes(key)) }
function id(value: unknown) { return typeof value === 'string' && uuid.test(value) }
function date(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function createInput(input: Record<string, unknown>) {
  if (!keys(input, ['table', 'row']) || !object(input.row)) return false
  const row = input.row
  const name = typeof row.name === 'string' && row.name.trim().length > 0 && row.name.trim().length <= 120
  if (!id(row.id) || !name) return false
  if (input.table === 'khata_companies') return keys(row, ['id', 'name'])
  return input.table === 'khata_parties' && keys(row, ['id', 'name', 'company_id', 'kind']) && id(row.company_id) &&
    ['customer', 'supplier', 'both'].includes(String(row.kind))
}
function reportInput(input: Record<string, unknown>) {
  return keys(input, ['company', 'from', 'to', 'party', 'offset']) && id(input.company) &&
    date(input.from) && date(input.to) && String(input.from) <= String(input.to) &&
    (input.party === null || id(input.party)) && typeof input.offset === 'number' && Number.isSafeInteger(input.offset) && input.offset >= 0
}
function postInput(input: Record<string, unknown>) {
  return keys(input, ['id', 'company', 'party', 'kind', 'date', 'amount', 'method', 'reference', 'note', 'reverses']) &&
    id(input.id) && id(input.company) && id(input.party) && date(input.date) &&
    ['sale', 'purchase', 'receipt', 'payment', 'reversal'].includes(String(input.kind)) &&
    typeof input.amount === 'string' && /^\d{1,12}$/u.test(input.amount) && BigInt(input.amount) > 0n &&
    ['cash', 'bank'].includes(String(input.method)) && typeof input.reference === 'string' && input.reference.length <= 80 &&
    typeof input.note === 'string' && input.note.length <= 500 && (input.reverses === null || id(input.reverses))
}
export function khataOperation(value: unknown): KhataOperation | null {
  if (!object(value) || !keys(value, ['version', 'operation', 'input']) || value.version !== 'orbis.khata.data.v1' || !object(value.input)) return null
  const input = value.input
  switch (value.operation) {
    case 'expense-post': return expenseCommand(input) ? { operation: value.operation, input } : null
    case 'expense-report': return keys(input, ['company','from','to','offset']) && id(input.company) && date(input.from) && date(input.to) && String(input.from)<=String(input.to) && Number.isSafeInteger(input.offset) && Number(input.offset)>=0 ? { operation: value.operation, input } : null
    case 'companies': return keys(input, []) ? { operation: value.operation, input } : null
    case 'create': return createInput(input) ? { operation: value.operation, input } : null
    case 'report': return reportInput(input) ? { operation: value.operation, input } : null
    case 'post': return postInput(input) ? { operation: value.operation, input } : null
    default: return null
  }
}
export function createCentralVerifier(options: { baseUrl: string; fetchImpl?: typeof fetch; verificationKey?: string }) {
  const endpoint = new URL(options.baseUrl)
  if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('CENTRAL_ENDPOINT_INVALID')
  return async (token: string): Promise<KhataPrincipal | null> => {
    const response = await (options.fetchImpl ?? fetch)(endpoint.origin + (options.verificationKey ? '/api/v1/service/customer/session' : '/api/v1/customer/session'), {
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { authorization: 'Bearer ' + token, accept: 'application/json', ...(options.verificationKey ? { 'x-orbis-verification-key': options.verificationKey } : {}) },
    })
    if (response.status === 401 || response.status === 403) return null
    if (!response.ok) throw new Error('CENTRAL_UNAVAILABLE')
    const text = await response.text()
    if (text.length > 65536) throw new Error('CENTRAL_RESPONSE_INVALID')
    const value: unknown = JSON.parse(text)
    if (!object(value) || value.version !== 'orbis.customer.v1' || !object(value.customer) ||
      typeof value.customer.orbisIdentityId !== 'string' || !identity.test(value.customer.orbisIdentityId) ||
      typeof value.customer.displayId !== 'string' || !/^ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/u.test(value.customer.displayId)) throw new Error('CENTRAL_RESPONSE_INVALID')
    return { orbisIdentityId: value.customer.orbisIdentityId, displayId: value.customer.displayId }
  }
}
export function createKhataGateway(options: {
  origins: readonly string[]; verify: (token: string) => Promise<KhataPrincipal | null>;
  execute: (principal: KhataPrincipal, operation: KhataOperation) => Promise<unknown>
}) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = new Headers({ 'cache-control': 'no-store', 'content-type': 'application/json', 'x-content-type-options': 'nosniff' })
    const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers })
    if (origin) {
      if (!options.origins.includes(origin)) return reply(403, { code: 'KHATA_ORIGIN_DENIED' })
      headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin')
    }
    if (request.method === 'OPTIONS') {
      headers.set('access-control-allow-methods', 'POST, OPTIONS'); headers.set('access-control-allow-headers', 'Authorization, Content-Type')
      return new Response(null, { status: 204, headers })
    }
    if (request.method !== 'POST') return reply(405, { code: 'KHATA_METHOD_DENIED' })
    const token = /^Bearer ([A-Za-z0-9._~-]{1,8192})$/u.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token) return reply(401, { code: 'KHATA_LOGIN_REQUIRED' })
    let stage = 'input'
    try {
      const text = await request.text()
      if (text.length > 16384) return reply(413, { code: 'KHATA_INPUT_TOO_LARGE' })
      let value: unknown
      try { value = JSON.parse(text) } catch { return reply(400, { code: 'KHATA_INPUT_INVALID' }) }
      const operation = khataOperation(value)
      if (!operation) return reply(400, { code: 'KHATA_INPUT_INVALID' })
      stage = 'central-session'
      const principal = await options.verify(token)
      if (!principal || !identity.test(principal.orbisIdentityId)) return reply(401, { code: 'KHATA_LOGIN_REQUIRED' })
      stage = 'product-database'
      const data = await options.execute(principal, operation)
      return reply(200, { data })
    } catch (error) {
      // No tokens, request payloads, credentials or database messages in diagnostics.
      console.warn('KHATA_GATEWAY_FAILURE', { stage, errorName: error instanceof Error ? error.name : 'UnknownError' })
      if (object(error) && typeof error.code === 'string' && /^(?:22|23|28|42|P0)[A-Z0-9]{3}$/u.test(error.code)) return reply(422, { code: error.code })
      return reply(503, { code: 'KHATA_DATA_UNAVAILABLE' })
    }
  }
}
