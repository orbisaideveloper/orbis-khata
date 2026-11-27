import { androidLocalFirst } from '../native-local/route'

export const dailyLedgerEnabled = () => import.meta.env.VITE_KHATA_DAILY_LEDGER === 'enabled' && androidLocalFirst()
