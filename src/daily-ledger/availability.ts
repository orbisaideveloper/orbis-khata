import { androidLocalFirst } from '../native-local/route'
import { validId } from './journal'

export const dailyLedgerEnabled = () => import.meta.env.VITE_KHATA_DAILY_LEDGER === 'enabled' && androidLocalFirst()

/** This controls presentation only. Web has no authorized Daily Ledger data port. */
export function dailyLedgerWebEntry(owner: string | null) {
  const allowedOwner: unknown = import.meta.env.VITE_KHATA_DAILY_LEDGER_WEB_OWNER
  return !androidLocalFirst() && typeof allowedOwner === 'string' && validId(allowedOwner) && owner === allowedOwner
}
