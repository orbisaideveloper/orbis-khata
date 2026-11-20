import { useEffect, useState } from 'react'
import { cachedResults, refreshResults } from './result-feed'

export function useResultFeed() {
  const [results, setResults] = useState(cachedResults)
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading')
  useEffect(() => {
    let current = true
    let controller: AbortController | undefined
    const refresh = async () => {
      if (controller || document.visibilityState === 'hidden') return
      controller = new AbortController()
      const timer = window.setTimeout(() => controller?.abort(), 15000)
      try {
        const records = await refreshResults(controller.signal)
        if (current) { setResults(records); setStatus('ready') }
      } catch { if (current) setStatus('offline') }
      finally { window.clearTimeout(timer); controller = undefined }
    }
    const wake = () => { void refresh() }
    wake()
    const timer = window.setInterval(wake, 120000)
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    return () => { current = false; controller?.abort(); window.clearInterval(timer); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake) }
  }, [])
  return { results, status }
}
