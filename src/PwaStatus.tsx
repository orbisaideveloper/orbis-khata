import { useEffect, useState } from 'react'
import type { Language } from './i18n'

const copy = {
  bn: { offline: 'ইন্টারনেট নেই। লগইন যাচাই ও নতুন হিসাবের জন্য কানেকশন দরকার।', update: 'নতুন সংস্করণ প্রস্তুত। অসমাপ্ত কাজ শেষ করে অ্যাপের সব উইন্ডো বন্ধ করে আবার খুলুন।', failed: 'অফলাইনে খোলার ব্যবস্থা চালু হয়নি। ইন্টারনেট এলে আবার অ্যাপ খুলুন।' },
  en: { offline: 'Offline. Connection is required to verify login and load current books.', update: 'Update ready. Finish pending work, then close all app windows and reopen.', failed: 'Offline startup is not ready. Reopen the app when connected.' },
  hi: { offline: 'इंटरनेट नहीं है। लॉगिन जाँच और नया हिसाब देखने के लिए कनेक्शन चाहिए।', update: 'नया संस्करण तैयार है। अधूरा काम पूरा करके ऐप की सभी विंडो बंद करें और फिर खोलें।', failed: 'ऑफ़लाइन खोलने की सुविधा तैयार नहीं है। इंटरनेट आने पर ऐप फिर खोलें।' },
}

export function PwaStatus({ language }: Readonly<{ language: Language }>) {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [status, setStatus] = useState<'ready' | 'update' | 'failed'>('ready')
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    let alive = true
    let registration: ServiceWorkerRegistration | undefined
    let worker: ServiceWorker | null = null
    const changed = () => {
      if (alive && worker?.state === 'installed' && navigator.serviceWorker.controller) setStatus('update')
    }
    const found = () => {
      worker?.removeEventListener('statechange', changed)
      worker = registration?.installing ?? null
      worker?.addEventListener('statechange', changed)
    }
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(value => {
        if (!alive) return
        registration = value
        if (value.waiting) setStatus('update')
        value.addEventListener('updatefound', found)
        found()
      }).catch(() => { if (alive) setStatus('failed') })
    }
    return () => {
      alive = false
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
      registration?.removeEventListener('updatefound', found)
      worker?.removeEventListener('statechange', changed)
    }
  }, [])
  const t = copy[language]
  return <>{offline && <p className="connection-notice" role="status">{t.offline}</p>}{status !== 'ready' && <p className="connection-notice" role="status">{t[status]}</p>}</>
}
