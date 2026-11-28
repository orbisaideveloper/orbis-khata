import { useMemo, useState } from 'react'
import type { Language } from '../i18n'
import { readNativeDailyLedger, saveNativeDailyLedger } from '../native-local/runtime'
import AndroidLedgerDrive from './AndroidLedgerDrive'
import { dailyLedgerEnabled } from './availability'
import DailyLedger from './DailyLedger'
import { label } from './copy'
import { shareCancelled, shareFile } from '../native/share-file'
import { monthlyReport } from './monthly-report'
import type { LedgerStore } from './ledger-store'

export default function AndroidDailyLedger({ owner, language }: Readonly<{ owner: string; language: Language }>) {
  const [revision, setRevision] = useState(0)
  const backup = dailyLedgerEnabled() && import.meta.env.VITE_KHATA_DAILY_LEDGER_DRIVE === 'staging'
  const store = useMemo<LedgerStore>(() => ({
    list: () => readNativeDailyLedger(owner),
    save: command => saveNativeDailyLedger(owner, command),
  }), [owner])
  return <>
    {backup && <AndroidLedgerDrive key={owner} owner={owner} language={language} onRestored={() => setRevision(value => value + 1)} />}
    <DailyLedger key={owner + ':' + revision} store={store} language={language} separateBackup={backup}
      shareMonthlyReport={async (entries, day) => {
        try { await shareFile(monthlyReport(entries, day), label(language, 'monthlyReport')) }
        catch (error) { if (!shareCancelled(error)) throw error }
      }} />
  </>
}
