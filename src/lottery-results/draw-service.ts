import { normalizeDraw, storedDraw, type DrawJson } from './draw-json.ts'
import { readTicketText } from './ticket.ts'
import type { DrawRpc } from './draw-store.ts'

type Options = { rpc: DrawRpc; token: () => string; fetchImpl?: typeof fetch }
type Claim = { state: string; lease?: string; payload?: unknown; pdf?: string | null }
type Collected = { draw: DrawJson | null; pdf: string | null; reason: string | null; wait: number }
class ProviderFailure extends Error {
  readonly wait: number
  constructor(code: string, wait = 30) { super(code); this.wait = wait }
}
export function createDrawService(options: Options) {
  return async (date: string, slot: string, requirePdf = false): Promise<{ draw: DrawJson; pdf: string | null }> => {
    const claim = await options.rpc('lottery_draw_claim', { p_date: date, p_slot: slot, p_pdf: requirePdf }) as Claim
    if (claim.state === 'ready') return { draw: storedDraw(claim.payload, date, slot), pdf: claim.pdf ?? null }
    if (claim.state !== 'claim' || !claim.lease) throw new Error('TICKET_BUSY')
    const result = await collectDraw(options, date, slot)
    const committed = await options.rpc('lottery_draw_finish', { p_date: date, p_slot: slot, p_lease: claim.lease, p_payload: result.draw, p_pdf: result.pdf, p_reason: result.reason, p_wait: result.wait })
    let state = result.draw ? 'JSON_READY' : 'PENDING'
    if (!committed) state = 'LEASE_LOST'
    console.info('LOTTERY_DRAW_COLLECTION', { date, slot, state, pdfReady: Boolean(result.pdf), reason: result.reason })
    if (!committed) throw new Error('TICKET_BUSY')
    if (result.draw) return { draw: result.draw, pdf: result.pdf }
    if (claim.payload) return { draw: storedDraw(claim.payload, date, slot), pdf: claim.pdf ?? null }
    throw new Error(result.reason === 'PENDING' ? 'DRAW_PENDING' : 'TICKET_UNAVAILABLE')
  }
}
async function collectDraw(options: Options, date: string, slot: string): Promise<Collected> {
  try {
    const value = await fetchProvider(options, date, slot)
    const draw = normalizeDraw(value, date, slot)
    const pdf = await collectPdf(value.files?.pdf, options.fetchImpl ?? fetch)
    return { draw, pdf, reason: pdf ? null : 'PDF_PENDING', wait: 30 }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    const reason = ['PENDING', 'PROVIDER_AUTH', 'PROVIDER_LIMIT', 'INVALID_DRAW_JSON'].includes(code) ? code : 'UPSTREAM_UNAVAILABLE'
    return { draw: null, pdf: null, reason, wait: error instanceof ProviderFailure ? error.wait : 30 }
  }
}
async function fetchProvider(options: Options, date: string, slot: string) {
  const token = options.token()
  if (!token.trim() || token.length > 4096) throw new ProviderFailure('PROVIDER_AUTH', 300)
  const query = new URLSearchParams({ date: date.split('-').reverse().join('-'), slot, 'access-token': token })
  const response = await (options.fetchImpl ?? fetch)('https://api.sambad.com/v2/dear/result?' + query, { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } })
  if (response.status === 429) throw new ProviderFailure('PROVIDER_LIMIT', Math.max(30, Math.min(2678400, Number(response.headers.get('retry-after')) || 300)))
  if (response.status === 401 || response.status === 403) throw new ProviderFailure('PROVIDER_AUTH', 300)
  if (!response.ok) throw new ProviderFailure('UPSTREAM_UNAVAILABLE')
  const body = JSON.parse(await readTicketText(response.body, 65536))
  if (body.success !== true) throw new ProviderFailure('INVALID_DRAW_JSON')
  return body.data
}
async function collectPdf(value: unknown, fetchImpl: typeof fetch): Promise<string | null> {
  if (!validPdf(value)) return null
  try { await verifyPdf(value, fetchImpl); return value } catch { return null }
}
function validPdf(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'sambad.com' || url.hostname.endsWith('.sambad.com')) && !url.username && !url.password && !url.port && !url.search && !url.hash && /\.pdf$/i.test(url.pathname) } catch { return false }
}
async function verifyPdf(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { accept: 'application/pdf' } })
  const reader = response.body?.getReader()
  try {
    if (!response.ok || !reader || Number(response.headers.get('content-length')) > 12000000) throw new Error('PDF_PENDING')
    const signature = await readPdfSignature(reader)
    if (signature !== '%PDF-') throw new Error('PDF_PENDING')
  } finally { await reader?.cancel().catch(() => {}); reader?.releaseLock() }
}

async function readPdfSignature(reader: ReadableStreamDefaultReader<Uint8Array>, signature = ''): Promise<string> {
  if (signature.length >= 5) return signature
  const chunk = await reader.read()
  if (chunk.done) throw new Error('PDF_PENDING')
  return readPdfSignature(reader, signature + new TextDecoder().decode(chunk.value.slice(0, 5 - signature.length)))
}
