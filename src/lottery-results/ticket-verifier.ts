import { createCentralVerifier } from '../accounting/server-gateway.ts'

// Match the established financial gateway's server-to-server session contract.
export function createTicketVerifier(baseUrl: string, verificationKey: string, fetchImpl?: typeof fetch) {
  if (verificationKey && verificationKey.length < 32) throw new Error('TICKET_VERIFICATION_KEY_INVALID')
  return createCentralVerifier({ baseUrl, ...(verificationKey ? { verificationKey } : {}), fetchImpl })
}
