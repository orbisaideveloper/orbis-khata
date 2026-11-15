export const recoveryKeyPattern = /^[a-f0-9]{64}$/u

export function validRecoveryEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[a-z0-9.!#$%&\x27*+/=?^_\x60{|}~-]+@[a-z0-9.-]+$/iu.test(value)
}

export function recoveryKeyBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!recoveryKeyPattern.test(value)) throw new Error('FINANCIAL_BACKUP_KEY_INVALID')
  return Uint8Array.from(value.match(/../gu)!, pair => Number.parseInt(pair, 16))
}

export type AccountRecovery = { email: string; key: string }

export function isAccountRecovery(value: unknown): value is AccountRecovery {
  if (!value || typeof value !== 'object' || !('email' in value) || !('key' in value)) return false
  return validRecoveryEmail(value.email) && typeof value.key === 'string' && recoveryKeyPattern.test(value.key)
}
