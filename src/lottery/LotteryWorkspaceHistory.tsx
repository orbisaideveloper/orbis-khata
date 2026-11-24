import { useRef, useState } from 'react'
import { inLanguage } from '../localize'
import { useLotteryLanguage } from './language'
import { lotteryFetch } from './transport'
import type { HistoryCursor, HistoryKind, HistoryPage } from './workspace-history'

function exportPage(page: HistoryPage, kind: HistoryKind) {
  const blob = new Blob([JSON.stringify({ version: 1, kind, ...page }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `lottery-${kind}-page.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function LotteryWorkspaceHistory({ organizationId }: Readonly<{ organizationId: string }>) {
  const language = useLotteryLanguage()
  const [kind, setKind] = useState<HistoryKind>('audit')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<HistoryPage>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const retryCursor = useRef<HistoryCursor | null>(null)

  async function load(cursor: HistoryCursor | null) {
    setLoading(true)
    setError('')
    retryCursor.current = cursor
    const params = new URLSearchParams({ organizationId, kind, search: query })
    if (cursor) {
      params.set('revision', cursor.revision)
      params.set('ordinal', cursor.ordinal)
      params.set('offset', String(cursor.offset))
    }
    try {
      const response = await lotteryFetch('/lottery/workspace/history?' + params)
      const result = await response.json()
      if (!response.ok || !Array.isArray(result?.entries)) {
        const code = result?.error?.code
        throw new Error(code === 'LOTTERY_HISTORY_CHANGED' ? code : 'LOTTERY_HISTORY_UNAVAILABLE')
      }
      setPage(result as HistoryPage)
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'LOTTERY_HISTORY_CHANGED'
        ? 'LOTTERY_HISTORY_CHANGED' : 'LOTTERY_HISTORY_UNAVAILABLE')
    } finally {
      setLoading(false)
    }
  }

  function reset() { setPage(undefined); setError(''); retryCursor.current = null }
  return <details className="space-y-2 rounded-xl border p-3">
    <summary>{inLanguage(language, 'অডিট ও লেজার ইতিহাস', 'ऑडिट और लेजर इतिहास', 'Audit and ledger history')}</summary>
    <form onSubmit={event => { event.preventDefault(); setPage(undefined); void load(null) }} className="flex flex-wrap gap-2">
      <select aria-label={inLanguage(language, 'ইতিহাসের ধরন', 'इतिहास का प्रकार', 'History type')}
        disabled={loading} value={kind} onChange={event => { setKind(event.target.value === 'ledger' ? 'ledger' : 'audit'); reset() }}>
        <option value="audit">{inLanguage(language, 'অডিট', 'ऑडिट', 'Audit')}</option>
        <option value="ledger">{inLanguage(language, 'লেজার', 'लेजर', 'Ledger')}</option>
      </select>
      <input aria-label={inLanguage(language, 'ইতিহাস খুঁজুন', 'इतिहास खोजें', 'Search history')}
        maxLength={100} disabled={loading} value={query} onChange={event => { setQuery(event.target.value); reset() }} />
      <button disabled={loading}>{inLanguage(language, 'খুঁজুন', 'खोजें', 'Search')}</button>
    </form>
    {error && <p role="alert">
      {error === 'LOTTERY_HISTORY_CHANGED'
        ? inLanguage(language, 'হিসাব বদলেছে। শুরু থেকে আবার খুলুন।', 'हिसाब बदला है। शुरू से खोलें।', 'Records changed. Start again from the first page.')
        : inLanguage(language, 'ইতিহাস লোড হয়নি। আবার চেষ্টা করুন।', 'इतिहास लोड नहीं हुआ। फिर प्रयास करें।', 'History did not load. Try again.')}
      {' '}<button disabled={loading} onClick={() => void load(error === 'LOTTERY_HISTORY_CHANGED' ? null : retryCursor.current)}>
        {inLanguage(language, 'আবার চেষ্টা করুন', 'फिर प्रयास करें', 'Retry')}
      </button>
    </p>}
    {page?.entries.map(entry => <details key={entry.id + ':' + entry.offset}>
      <summary>{entry.id}{entry.offset || !entry.complete ? ` · +${entry.offset}` : ''}</summary>
      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">{entry.json}</pre>
    </details>)}
    {page && <div className="flex gap-2">
      <button disabled={loading || !page.entries.length} onClick={() => exportPage(page, kind)}>
        {inLanguage(language, 'এই পেজ রপ্তানি', 'यह पेज निर्यात करें', 'Export this page')}
      </button>
      {page.next && <button disabled={loading || Boolean(error)} onClick={() => void load(page.next)}>
        {inLanguage(language, 'পরের পেজ', 'अगला पेज', 'Next page')}
      </button>}
    </div>}
  </details>
}
