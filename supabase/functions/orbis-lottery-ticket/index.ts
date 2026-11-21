import { createDocumentGateway } from '../../../src/lottery-results/document-gateway.ts'
import { createTicketVerifier } from '../../../src/lottery-results/ticket-verifier.ts'
import { createTicketGateway } from '../../../src/lottery-results/ticket-gateway.ts'
import { createDrawRpc } from '../../../src/lottery-results/draw-store.ts'
import { createDrawService } from '../../../src/lottery-results/draw-service.ts'
import { createTicketLookup } from '../../../src/lottery-results/ticket-provider.ts'

const env = (key: string) => Deno.env.get(key) ?? ''
const verificationKey = env('ORBIS_CUSTOMER_VERIFY_KEY')
const verify = createTicketVerifier(env('ORBIS_CUSTOMER_API_URL') || 'https://orbis-admin-staging.onrender.com', verificationKey)
console.info('LOTTERY_TICKET_CONFIGURATION', { serviceVerification: Boolean(verificationKey), providerConfigured: Boolean(env('SAMBAD_API_TOKEN').trim()) })
const rpc = createDrawRpc(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
const load = createDrawService({ rpc, token: () => env('SAMBAD_API_TOKEN') })
const lookup = createTicketLookup(load)
const document = async (date: string, slot: string) => {
  try { return { date, slot, sambadUrl: (await load(date, slot, true)).pdf } }
  catch (error) { if (error instanceof Error && error.message === 'DRAW_PENDING') return { date, slot, sambadUrl: null }; throw error }
}
// Private public-result cache only; financial tables and financial gateway are never accessed.
const origins = (env('KHATA_ORIGINS') || 'https://orbis-khata.onrender.com,http://127.0.0.1:5173').split(',').map(value => value.trim()).filter(Boolean).concat(['https://localhost', 'capacitor://localhost'])
const ticketGateway = createTicketGateway({ origins, verify, lookup, document })
const documentGateway = createDocumentGateway({ origins, document })
Deno.serve(request => new URL(request.url).pathname.endsWith('/orbis-lottery-ticket/document') ? documentGateway(request) : ticketGateway(request))
