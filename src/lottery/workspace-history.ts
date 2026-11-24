export const compactWorkspace = 'compact-v1'
export const historyModels = {
  audit: 'foundationLotteryAuditEvent',
  ledger: 'foundationLotteryLedgerEntry',
} as const

export type HistoryKind = keyof typeof historyModels
export type HistoryCursor = { revision: string; ordinal: string; offset: number }
export type HistoryRequest = {
  organizationId: string
  kind: HistoryKind
  search: string
  cursor?: HistoryCursor
}
export type HistoryPage = {
  entries: { id: string; json: string; offset: number; complete: boolean }[]
  next: HistoryCursor | null
}

const digits = /^\d{1,19}$/u
const maxBigint = 9223372036854775807n

function bigintText(value: unknown): value is string {
  return typeof value === 'string' && digits.test(value) && BigInt(value) <= maxBigint
}

export function parseHistoryRequest(input: Record<string, unknown>): HistoryRequest | null {
  const { organizationId, kind, search = '', revision, ordinal, offset } = input
  if (typeof organizationId !== 'string' || organizationId.length === 0 || organizationId.length > 128) return null
  if (kind !== 'audit' && kind !== 'ledger') return null
  if (typeof search !== 'string' || search.length > 100) return null
  if (revision === undefined && ordinal === undefined && offset === undefined) return { organizationId, kind, search }
  if (!bigintText(revision) || !bigintText(ordinal) || typeof offset !== 'string' || !/^\d{1,9}$/u.test(offset)) return null
  return { organizationId, kind, search, cursor: { revision, ordinal, offset: Number(offset) } }
}

export const historyFragmentSize = 24_000
export const historyPageRows = 12

export function historyPage(
  revision: string,
  rows: { id: string; ordinal: string; json: string; length: number; offset: number }[],
): HistoryPage {
  const entries: HistoryPage['entries'] = []
  for (const row of rows.slice(0, historyPageRows)) {
    const complete = row.length <= row.offset + historyFragmentSize
    entries.push({ id: row.id, json: row.json, offset: row.offset, complete })
    if (!complete) {
      return { entries, next: { revision, ordinal: row.ordinal, offset: row.offset + historyFragmentSize } }
    }
  }
  const next = rows[historyPageRows]
  return { entries, next: next ? { revision, ordinal: next.ordinal, offset: 0 } : null }
}
