import { useMemo } from 'react'
import type { Language } from '../i18n'
import { requestOnlineDailyLedger } from '../accounting/api'
import DailyLedger from './DailyLedger'
import { webLedgerStore } from './web-store'

export default function WebDailyLedger({ owner, language }: Readonly<{ owner: string; language: Language }>) {
  const store = useMemo(() => webLedgerStore(<T,>(input: unknown) => requestOnlineDailyLedger<T>(owner, input)), [owner])
  return <DailyLedger store={store} language={language} web />
}
