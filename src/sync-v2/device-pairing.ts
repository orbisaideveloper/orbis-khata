import type { Scope } from './command.ts'
import type { LocalFeedCodec, LocalFeedStorage } from './local-feed.ts'

type Client = 'android' | 'web'
type Registration = {
  actor: string
  registration: string
  client: Client
  scope: Scope<'company' | 'lottery-organization'>
  canWrite: boolean
  expiresAt: string
}
type PairingState = { credential: string; registration?: Registration }

const identifier = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,128}$/u.test(value)
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

/** The active Central session supplies actor and request; the local vault owns the proof. */
export function createDevicePairing(
  actor: string, client: Client, storage: LocalFeedStorage, codec: LocalFeedCodec,
  request: (operation: string, input: unknown) => Promise<unknown>,
) {
  if (!identifier(actor)) throw new Error('SYNC_PAIRING_ACTOR_INVALID')
  return async (ticket: string): Promise<Registration & { credential: string }> => {
    if (!/^[a-f0-9]{64}$/u.test(ticket)) throw new Error('SYNC_PAIRING_TICKET_INVALID')
    const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket))))
    const id = ['sync-v2-pair', actor, client, digest].join(':')
    const context = 'sync-v2-pair:' + hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))))
    let marker = await storage.read(id)
    if (marker === null) {
      // Persist before any request so a lost response cannot orphan a registration.
      const credential = hex(crypto.getRandomValues(new Uint8Array(32)))
      const sealed = await codec.seal(JSON.stringify({ credential }), context)
      try {
        await storage.commit(id, null, [{ id, sealed }])
        marker = sealed
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'SYNC_LOCAL_STORAGE_CURSOR_CHANGED') throw error
        marker = await storage.read(id)
      }
    }
    if (marker === null) throw new Error('SYNC_PAIRING_STATE_MISSING')
    const state = JSON.parse(await codec.open(marker, context)) as PairingState
    if (!/^[a-f0-9]{64}$/u.test(state.credential)) throw new Error('SYNC_DEVICE_PROOF_INVALID')
    const registration = await request('lottery-sync', { action: 'pair-device', ticket, credential: state.credential }) as Registration
    if (!registration || registration.actor !== actor || registration.client !== client ||
        !identifier(registration.registration) || !registration.scope ||
        !['company','lottery-organization'].includes(registration.scope.kind) ||
        ![registration.scope.id, registration.scope.epoch].every(identifier) ||
        typeof registration.canWrite !== 'boolean' || !(Date.parse(registration.expiresAt) > Date.now())) {
      throw new Error('SYNC_PAIRING_BINDING_INVALID')
    }
    // No ticket or clear proof in account metadata. Same-proof concurrent retry is harmless.
    if (!state.registration) {
      const sealed = await codec.seal(JSON.stringify({ ...state, registration }), context)
      await storage.commit(id, marker, [{ id, sealed }])
    }
    return { ...registration, credential: state.credential }
  }
}
