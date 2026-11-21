import { createTicketVerifier } from '../../../src/lottery-results/ticket-verifier.ts'
import { createTicketGateway } from '../../../src/lottery-results/ticket-gateway.ts'
import { createTicketLookup } from '../../../src/lottery-results/ticket-provider.ts'

const env = (key: string) => Deno.env.get(key) ?? ''
const verificationKey = env('ORBIS_CUSTOMER_VERIFY_KEY')
const verify = createTicketVerifier(env('ORBIS_CUSTOMER_API_URL') || 'https://orbis-admin-staging.onrender.com', verificationKey)
console.info('LOTTERY_TICKET_CONFIGURATION', { serviceVerification: Boolean(verificationKey), providerConfigured: Boolean(env('SAMBAD_API_TOKEN').trim()) })
const lookup = createTicketLookup({ token: () => env('SAMBAD_API_TOKEN') })
// Independent, read-only result service: no database client and no financial gateway execution.
Deno.serve(createTicketGateway({ origins: (env('KHATA_ORIGINS') || 'https://orbis-khata.onrender.com,http://127.0.0.1:5173').split(',').map(value => value.trim()).filter(Boolean).concat(['https://localhost', 'capacitor://localhost']), verify, lookup }))
