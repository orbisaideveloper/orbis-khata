import { isAccountRecovery, recoveryKeyBytes, type AccountRecovery } from './account-recovery.ts'

const encoder = new TextEncoder()
const context = (actor: string) => encoder.encode('orbis.khata.drive-recovery.v1:' + actor)

export function createRecoveryEnvelope(wrappingKey: string) {
  const loadKey = () => crypto.subtle.importKey('raw', recoveryKeyBytes(wrappingKey), 'AES-GCM', false, ['encrypt', 'decrypt'])
  return {
    async seal(actor: string, record: AccountRecovery): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context(actor) },
        await loadKey(), encoder.encode(JSON.stringify(record)))
      return btoa(String.fromCodePoint(...iv, ...new Uint8Array(ciphertext)))
    },
    async open(actor: string, envelope: string): Promise<AccountRecovery> {
      const bytes = Uint8Array.from(atob(envelope), character => character.codePointAt(0)!)
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: context(actor) },
        await loadKey(), bytes.slice(12))
      const result: unknown = JSON.parse(new TextDecoder().decode(plaintext))
      if (!isAccountRecovery(result)) throw new Error('KHATA_RECOVERY_RECORD_INVALID')
      return result
    },
  }
}
