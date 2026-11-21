import { useEffect, useState } from 'react'
import { cachedResults, refreshResults } from './result-feed'
import { cachedDocuments, refreshDocuments } from './document-feed'

export function useResultFeed(includeNumbers = false) {
  const [results, setResults] = useState(() => includeNumbers ? cachedResults() : [])
  const [documents, setDocuments] = useState(cachedDocuments)
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading')
  useEffect(() => {
    let current = true
    let controller: AbortController | undefined
    const refresh = async () => {
      if (controller || document.visibilityState === 'hidden') return
      controller = new AbortController()
      const timer = window.setTimeout(() => controller?.abort(), 15000)
      try {
        const [records, links] = await Promise.allSettled([(includeNumbers ? refreshResults(controller.signal) : Promise.resolve([])), refreshDocuments(controller.signal)])
        if (current) {
          if (records.status === 'fulfilled') setResults(records.value)
          if (links.status === 'fulfilled') setDocuments(links.value)
          setStatus(links.status === 'fulfilled' ? 'ready' : 'offline')
        }
      } catch { if (current) setStatus('offline') }
      finally { window.clearTimeout(timer); controller = undefined }
    }
    const wake = () => { void refresh() }
    wake()
    const timer = window.setInterval(wake, 120000)
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    return () => { current = false; controller?.abort(); window.clearInterval(timer); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake) }
  }, [includeNumbers])
  return { results, documents, status }
}
