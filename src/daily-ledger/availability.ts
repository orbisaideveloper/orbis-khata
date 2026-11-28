import { androidLocalFirst } from '../native-local/route'
import { validId } from './journal'

export const dailyLedgerEnabled = () => import.meta.env.VITE_KHATA_DAILY_LEDGER === 'enabled' && androidLocalFirst()

/** This controls presentation only. The gateway checks Central entitlement per request. */
export function dailyLedgerWebEntry(owner: string | null) {
  return import.meta.env.VITE_KHATA_DAILY_LEDGER_WEB === 'enabled' &&
    !androidLocalFirst() && owner !== null && validId(owner)
}
