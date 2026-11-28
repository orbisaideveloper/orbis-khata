import type { Command, Entry } from './journal'
import type { LedgerStore } from './ledger-store'
import { dailyWebMaxEntries, dailyWebPageSize, validRevision, type Page, type Receipt } from './web-contract'

function checkPage(page: Page, cursor: string, prior: string | undefined) {
  if (!page || !Array.isArray(page.records) || page.records.length > dailyWebPageSize ||
      !validRevision(page.through) || (prior !== undefined && prior !== page.through)) {
    throw new Error('DAILY_WEB_RESPONSE_INVALID')
  }
  let expected = BigInt(cursor)
  for (const row of page.records) {
    expected += 1n
    if (row?.revision !== String(expected) || !row.entry?.command || !Array.isArray(row.entry.postings)) {
      throw new Error('DAILY_WEB_RESPONSE_INVALID')
    }
  }
  const next = expected === BigInt(page.through) ? null : String(expected)
  if (expected > BigInt(page.through) || (next !== null && next === cursor) || page.nextCursor !== next) {
    throw new Error('DAILY_WEB_RESPONSE_INVALID')
  }
}

type WebRequest = <T>(input: unknown) => Promise<T>

async function loadSnapshot(request: WebRequest, entries: Entry[], cursor: string, through?: string): Promise<void> {
  const page = await request<Page>({ action: 'list', after: cursor, through })
  checkPage(page, cursor, through)
  for (const record of page.records) entries.push(record.entry)
  if (entries.length > dailyWebMaxEntries) throw new Error('DAILY_WEB_HISTORY_LIMIT')
  // Pages depend on verified prior cursor and share one fixed snapshot.
  if (page.nextCursor !== null) await loadSnapshot(request, entries, page.nextCursor, page.through)
}

export function webLedgerStore(request: WebRequest): LedgerStore {
  return {
    async list() {
      const entries: Entry[] = []
      await loadSnapshot(request, entries, '0')
      // Same-day records must be newest-first before the stable date sort.
      entries.reverse()
      entries.sort((a, b) => b.command.date.localeCompare(a.command.date))
      return entries
    },
    async save(command: Command) {
      const receipt = await request<Receipt>({ action: 'save', command })
      if (!receipt?.entry || receipt.entry.command?.id !== command.id || !validRevision(receipt.revision) ||
          receipt.revision === '0' || !Array.isArray(receipt.entry.postings)) {
        throw new Error('DAILY_WEB_RESPONSE_INVALID')
      }
      return receipt.entry
    },
  }
}
