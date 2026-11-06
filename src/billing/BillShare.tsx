import { useRef, useState } from 'react'
import type { Language } from '../i18n'
import { canShareFile, shareCancelled, shareFile } from '../native/share-file'
import { isNativeApp } from '../native/platform'

const copy = {
  bn: { prepare: 'বিলের PDF তৈরি করুন', busy: 'PDF তৈরি হচ্ছে…', download: 'PDF ডাউনলোড', share: 'বিল শেয়ার করুন', ready: 'PDF প্রস্তুত। শেয়ার মেনু থেকে WhatsApp বেছে নিন।', fallback: 'PDF ডাউনলোড করে WhatsApp-এ ডকুমেন্ট হিসেবে পাঠাতে পারবেন।', failed: 'PDF তৈরি বা শেয়ার করা যায়নি। আবার চেষ্টা করুন, অথবা বিল প্রিন্ট থেকে PDF সেভ করুন।' },
  en: { prepare: 'Prepare bill PDF', busy: 'Preparing PDF…', download: 'Download PDF', share: 'Share bill', ready: 'PDF ready. Choose WhatsApp from the share menu.', fallback: 'Download the PDF and attach it as a document in WhatsApp.', failed: 'Could not prepare or share the PDF. Retry, or use Print bill to save a PDF.' },
  hi: { prepare: 'बिल PDF बनाएँ', busy: 'PDF बन रहा है…', download: 'PDF डाउनलोड', share: 'बिल शेयर करें', ready: 'PDF तैयार है। शेयर मेनू से WhatsApp चुनें।', fallback: 'PDF डाउनलोड करके WhatsApp पर दस्तावेज़ की तरह भेजें।', failed: 'PDF बना या शेयर नहीं कर सके। फिर कोशिश करें या बिल प्रिंट से PDF सेव करें।' },
}
export function BillShare({ language, name }: Readonly<{ language: Language; name: string }>) {
  const host = useRef<HTMLDivElement>(null), guard = useRef(false)
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(false)
  const t = copy[language]
  const shareable = canShareFile(file)
  const native = isNativeApp()
  const downloadLabel = native ? { bn: 'PDF সেভ / শেয়ার', en: 'Save / share PDF', hi: 'PDF सेव / शेयर' }[language] : t.download
  async function prepare() {
    if (guard.current) return
    guard.current = true; setBusy(true); setError(false)
    try {
      const sheets = Array.from(host.current?.closest('.bill-review')?.querySelectorAll<HTMLElement>('.bill-sheet') ?? [])
      const { createBillPdf } = await import('./bill-pdf')
      setFile(await createBillPdf(sheets, name))
    } catch { setError(true) }
    finally { guard.current = false; setBusy(false) }
  }
  function download() {
    if (!file) return
    if (native) { void share(); return }
    const url = URL.createObjectURL(file), link = document.createElement('a')
    link.href = url; link.download = file.name; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  async function share() {
    if (!file || guard.current) return
    guard.current = true; setError(false)
    try { await shareFile(file, name) }
    catch (e) { if (!shareCancelled(e)) setError(true) }
    finally { guard.current = false }
  }
  return <div ref={host} className="bill-share-panel"><div className="bill-share-actions">{!file && <button type="button" disabled={busy} onClick={() => { void prepare() }}>{busy ? t.busy : t.prepare}</button>}{file && <><button type="button" onClick={download}>{downloadLabel}</button>{shareable && !native && <button type="button" onClick={() => { void share() }}>{t.share}</button>}</>}</div>{file && <p className="books-hint">{shareable ? t.ready : t.fallback}</p>}{error && <output role="alert">{t.failed}</output>}</div>
}
