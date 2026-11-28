import { GatewayRejection } from '../accounting/gateway-admission.ts'
import { needsHouseholdHistory, postHousehold } from './household.ts'
import { matchesRemoteLedgerGrant } from './integration-contracts.ts'
import { normalize, post, validDate, validId, type Command, type Entry } from './journal.ts'
import { dailyWebInput, type Page, type Receipt } from './web-contract.ts'

type LedgerGrant = NonNullable<Parameters<typeof matchesRemoteLedgerGrant>[0]>
export type DailyLedgerPrincipal = Readonly<{ orbisIdentityId: string; dailyLedger?: LedgerGrant }>

interface LockedJournal {
  find(operationId: string): Promise<Receipt | undefined>
  history(): Promise<readonly Entry[]>
  append(entry: Entry, digest: string): Promise<Receipt>
}
export interface DailyLedgerDatabase {
  write<T>(owner: string, work: (journal: LockedJournal) => Promise<T>): Promise<T>
  page(owner: string, after: string, through?: string): Promise<Page>
}

const commandErrors = new Set([
  'DAILY_COMMAND_INVALID', 'DAILY_CORRECTION_INVALID', 'DAILY_OCCURRENCE_EXISTS', 'DAILY_OCCURRENCE_MONTH',
  'DAILY_OPENING_EXISTS', 'DAILY_OPENING_SOURCE_REQUIRED', 'DAILY_REFERENCE_INVALID', 'DAILY_REVERSAL_INVALID',
  'DAILY_AMOUNT_INVALID', 'DAILY_RECURRING_DATE_INVALID', 'DAILY_SETTLEMENT_EXISTS', 'DAILY_SETTLEMENT_LIMIT',
])

function validate<T>(work: () => T): T {
  try { return work() }
  catch (error) {
    if (error instanceof Error && commandErrors.has(error.message)) throw new GatewayRejection(422, error.message)
    throw error
  }
}

function commandFromJson(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !('id' in input) || typeof input.id !== 'string' ||
      !('date' in input) || typeof input.date !== 'string') {
    throw new GatewayRejection(400, 'DAILY_COMMAND_INVALID')
  }
  const command = validate(() => normalize(input as Command))
  if (Object.keys(input).some(key => !Object.hasOwn(command, key))) {
    throw new GatewayRejection(400, 'DAILY_COMMAND_INVALID')
  }
  return command
}

async function digestCommand(command: Command) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(command)))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function save(db: DailyLedgerDatabase, owner: string, input: unknown, currentDay: string) {
  const command = commandFromJson(input)
  const digest = await digestCommand(command)
  return db.write(owner, async journal => {
    const existing = await journal.find(command.id)
    if (existing) {
      if (existing.digest !== digest) throw new GatewayRejection(409, 'DAILY_OPERATION_CONFLICT')
      return existing
    }
    if (!validDate(currentDay) || command.date > currentDay) throw new GatewayRejection(422, 'DAILY_DATE_INVALID')
    const original = command.kind === 'reversal' ? (await journal.find(command.originalId))?.entry : undefined
    const needsHistory = needsHouseholdHistory(command) || Boolean(original && needsHouseholdHistory(original.command))
    const history = needsHistory ? await journal.history() : []
    const entry = validate(() => needsHistory
      ? postHousehold(command, history, currentDay, original)
      : post(command, original))
    return journal.append(entry, digest)
  })
}

export async function executeDailyLedgerWeb(db: DailyLedgerDatabase | undefined, principal: DailyLedgerPrincipal,
  input: Record<string, unknown>, businessDay: () => string) {
  if (!db) throw new GatewayRejection(503, 'DAILY_WEB_UNAVAILABLE')
  const owner = principal.orbisIdentityId
  const scope = { orbisIdentityId: owner, scopeKind: 'personal_ledger' as const, scopeId: owner }
  if (!validId(owner) || !matchesRemoteLedgerGrant(principal.dailyLedger, scope, 'webLedger')) {
    throw new GatewayRejection(403, 'DAILY_WEB_FORBIDDEN')
  }
  if (!dailyWebInput(input)) throw new GatewayRejection(400, 'DAILY_WEB_INPUT_INVALID')
  if (input.action === 'save') return save(db, owner, input.command, businessDay())
  return db.page(owner, input.after as string, input.through as string | undefined)
}
