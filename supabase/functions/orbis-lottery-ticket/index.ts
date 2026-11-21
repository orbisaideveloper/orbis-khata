import { createCentralVerifier } from '../../../src/accounting/server-gateway.ts'
import { createTicketGateway } from '../../../src/lottery-results/ticket-gateway.ts'
import { createTicketLookup } from '../../../src/lottery-results/ticket-provider.ts'

const env = (key: string) => Deno.env.get(key) ?? ''
const verify = createCentralVerifier({ baseUrl: env('ORBIS_CUSTOMER_API_URL') || 'https://orbis-admin-staging.onrender.com' })
const lookup = createTicketLookup({ token: () => env('SAMBAD_API_TOKEN') })
// Independent, read-only result service: no database client and no financial gateway execution.
Deno.serve(createTicketGateway({ origins: (env('KHATA_ORIGINS') || 'https://orbis-khata.onrender.com,http://127.0.0.1:5173').split(',').map(value => value.trim()).filter(Boolean).concat(['https://localhost', 'capacitor://localhost']), verify, lookup }))
