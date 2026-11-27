import { useMemo } from 'react'
import type { Language } from '../i18n'
import { readNativeDailyLedger, saveNativeDailyLedger } from '../native-local/runtime'
import DailyLedger from './DailyLedger'
import type { LedgerStore } from './ledger-store'

export default function AndroidDailyLedger({ owner, language }: Readonly<{ owner: string; language: Language }>) {
  const store = useMemo<LedgerStore>(() => ({
    list: () => readNativeDailyLedger(owner),
    save: command => saveNativeDailyLedger(owner, command),
  }), [owner])
  return <DailyLedger key={owner} store={store} language={language} />
}
