import type { Entry } from './journal.ts'

export const dailyWebMaxEntries = 5000
export const dailyWebPageSize = 100

export type Receipt = Readonly<{ revision: string; digest: string; entry: Entry }>
export type Page = Readonly<{ records: readonly Receipt[]; nextCursor: string | null; through: string }>

export function validRevision(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/u.test(value) &&
    BigInt(value) <= 9223372036854775807n
}

export function dailyWebInput(input: Record<string, unknown>) {
  switch (input.action) {
    case 'save':
      return Object.keys(input).length === 2 && !!input.command &&
        typeof input.command === 'object' && !Array.isArray(input.command)
    case 'list':
      return Object.keys(input).every(key => ['action', 'after', 'through'].includes(key)) &&
        validRevision(input.after) &&
        (input.through === undefined ? input.after === '0' :
          validRevision(input.through) && BigInt(input.after) <= BigInt(input.through))
    default:
      return false
  }
}
