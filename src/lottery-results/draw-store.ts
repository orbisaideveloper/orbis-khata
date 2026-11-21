import { readTicketText } from './ticket.ts'

export type DrawRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>
export function createDrawRpc(base: string, serviceKey: string, fetchImpl: typeof fetch = fetch): DrawRpc {
  return async (name, args) => {
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(base) || !serviceKey || !/^lottery_(draw_(claim|finish|candidates)|worker_authorized)$/.test(name)) throw new Error('TICKET_NOT_CONFIGURED')
    const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' }, body: JSON.stringify(args) })
    if (!response.ok) throw new Error('DRAW_CACHE_UNAVAILABLE')
    return JSON.parse(await readTicketText(response.body, 65536))
  }
}
