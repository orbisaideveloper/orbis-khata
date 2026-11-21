import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleCheck, ScanLine, Search } from 'lucide-react'
import type { IScannerControls } from '@zxing/browser'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import type { DrawSlot } from './result-data'
import { TicketScanner } from './TicketScanner'
import { checkTicket } from './ticket-client'
import { parseTicket, ticketFromQr, type TicketVerdict } from './ticket'

export function TicketSearch({ date, slot, language }: Readonly<{ date: string; slot: DrawSlot; language: Language }>) {
  const copy = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  const [series, setSeries] = useState('')
  const [number, setNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const messages = {
    qrFormat: copy('এই QR-এর ধরন চেনা যায়নি। টিকিট দেখে নম্বর লিখুন।', 'यह QR प्रारूप पहचाना नहीं गया। नंबर लिखें।', 'Unrecognized QR format. Enter the printed ticket number.'),
    qrReady: copy('নম্বর পড়া হয়েছে। তারিখ ও সময় মিলিয়ে যাচাই করুন।', 'नंबर पढ़ा गया। तारीख और समय मिलाकर जाँचें।', 'Number read. Confirm the draw date and time, then check.'),
    camera: copy('ক্যামেরা খোলা যায়নি। অনুমতি দিন অথবা নম্বর লিখুন।', 'कैमरा नहीं खुला। अनुमति दें या नंबर लिखें।', 'Camera unavailable. Allow camera access or enter the number.'),
    input: copy('৩০ দিনের মধ্যে সঠিক ড্র, সিরিজ ও পাঁচ অঙ্কের নম্বর দিন।', '30 दिनों के भीतर सही ड्रॉ, सीरीज़ और पाँच अंक दें।', 'Choose a draw within 30 days and enter a valid series and five-digit number.'),
    busy: copy('যাচাই ব্যস্ত আছে। একটু পরে আবার চেষ্টা করুন।', 'जाँच व्यस्त है। थोड़ी देर बाद कोशिश करें।', 'Checks are busy. Please try again shortly.'),
    unavailable: copy('এখন যাচাই করা যায়নি। সংযোগ ও সার্ভিস চালু আছে কি না দেখুন; পুরস্কার নেই বলা হচ্ছে না।', 'अभी जाँच नहीं हुई। कनेक्शन और सेवा जाँचें; इसका अर्थ कोई इनाम नहीं नहीं है।', 'Could not check now. Check your connection and service availability; this does not mean no prize.')
  }
  const [message, setMessage] = useState<keyof typeof messages | ''>('')
  const [verdict, setVerdict] = useState<TicketVerdict | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const scanner = useRef<IScannerControls | null>(null)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  const scanGeneration = useRef(0)
  const stopCamera = useCallback(() => { scanGeneration.current++; scanner.current?.stop(); scanner.current = null; setScanning(false) }, [])
  const invalidate = () => { generation.current++; request.current?.abort(); request.current = null; setVerdict(null); setMessage(''); setBusy(false) }
  useEffect(() => () => { generation.current++; scanGeneration.current++; request.current?.abort(); scanner.current?.stop() }, [])
  useEffect(() => {
    if (!scanning) return
    const stop = () => { if (document.hidden) stopCamera() }
    const timer = window.setTimeout(stopCamera, 30000)
    document.addEventListener('visibilitychange', stop)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', stop) }
  }, [scanning, stopCamera])
  const startCamera = async () => {
    invalidate()
    stopCamera()
    const scan = ++scanGeneration.current
    setScanning(true)
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      if (scan !== scanGeneration.current || !video.current) return
      const controls = await new BrowserQRCodeReader().decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' } } }, video.current, (result, _error, control) => {
        if (!result || scan !== scanGeneration.current) return
        control.stop(); scanGeneration.current++; setScanning(false)
        const ticket = ticketFromQr(result.getText())
        if (!ticket) { setMessage('qrFormat'); return }
        setSeries(ticket.series); setNumber(ticket.number)
        setMessage('qrReady')
      })
      if (scan !== scanGeneration.current) controls.stop()
      else scanner.current = controls
    } catch {
      if (scan !== scanGeneration.current) return
      stopCamera()
      setMessage('camera')
    }
  }
  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (request.current) return
    stopCamera(); invalidate()
    const current = generation.current
    let input
    try { input = parseTicket({ date, slot, series: series.trim().toUpperCase(), number: number.trim() }) }
    catch { setMessage('input'); return }
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    const timer = window.setTimeout(() => controller.abort(), 30000)
    try {
      const result = await checkTicket(input, controller.signal)
      if (current === generation.current) setVerdict(result)
    } catch (error) {
      if (current !== generation.current) return
      const limited = error instanceof Error && error.message === 'TICKET_BUSY'
      setMessage(limited ? 'busy' : 'unavailable')
    } finally { window.clearTimeout(timer); if (current === generation.current) { request.current = null; setBusy(false) } }
  }
  let statusText = copy('এই টিকিটের ফল এখনও নিশ্চিত করা যায়নি', 'इस टिकट का नतीजा अभी तय नहीं है', 'This ticket result is not confirmed yet')
  if (verdict?.status === 'pending' || verdict?.status === 'upcoming') statusText = copy('এই ড্রয়ের ফল এখনও নিশ্চিতভাবে পাওয়া যায়নি', 'इस ड्रॉ का नतीजा अभी उपलब्ध नहीं है', 'The result for this draw is not available yet')
  if (verdict?.status === 'win') statusText = copy('পুরস্কারের মিল পাওয়া গেছে', 'पुरस्कार का मिलान मिला', 'Prize match found')
  if (verdict?.status === 'no_prize') statusText = copy('এই ড্রয়ে পুরস্কারের মিল পাওয়া যায়নি', 'इस ड्रॉ में पुरस्कार का मिलान नहीं मिला', 'No prize match in this draw')
  return <section className="ticket-search" aria-labelledby="ticket-search-title">
    <div className="results-section-heading"><h2 id="ticket-search-title">{copy('টিকিট যাচাই', 'टिकट जाँच', 'Check a ticket')}</h2><ScanLine size={20} aria-hidden="true"/></div>
    <p className="ticket-draw-context" role="note"><strong>{date} · {slot.toUpperCase()} IST</strong><br/>{copy('এই নির্বাচিত তারিখ ও সময়ের ফলেই নম্বর যাচাই হবে। কাগজের টিকিটের তারিখ ও সময় মিলিয়ে নিন।', 'नंबर केवल इस चुनी हुई तारीख और समय के नतीजे से जाँचा जाएगा। कागज़ के टिकट की तारीख और समय मिलाएँ।', 'Numbers are checked only against this selected draw. Match the date and time printed on your ticket.')}</p>
    <form onSubmit={submit}>
      <div className="ticket-fields"><label>{copy('সিরিজ', 'सीरीज़', 'Series')}<input aria-label={copy('টিকিট সিরিজ', 'टिकट सीरीज़', 'Ticket series')} value={series} maxLength={3} autoCapitalize="characters" autoComplete="off" placeholder="35B" onChange={event => { invalidate(); setSeries(event.target.value.toUpperCase()) }}/></label><label>{copy('টিকিট নম্বর', 'टिकट नंबर', 'Ticket number')}<input value={number} inputMode="numeric" maxLength={5} autoComplete="off" placeholder="00000" onChange={event => { invalidate(); setNumber(event.target.value.replace(/\D/g, '')) }}/></label></div>
      <div className="ticket-actions"><button type="submit" className="results-action-primary" disabled={busy}><Search size={17} aria-hidden="true"/>{busy ? copy('যাচাই হচ্ছে…', 'जाँच जारी…', 'Checking…') : copy('নম্বর যাচাই', 'नंबर जाँचें', 'Check number')}</button><button type="button" onClick={() => { void startCamera() }} disabled={scanning}><ScanLine size={17} aria-hidden="true"/>{copy('QR স্ক্যান', 'QR स्कैन', 'Scan QR')}</button></div>
    </form>
    {scanning && <TicketScanner video={video} onClose={stopCamera} language={language} date={date} slot={slot}/>}
    {message && <p className="ticket-message"><output>{messages[message]}</output></p>}
    {verdict && <div className="ticket-verdict" data-state={verdict.status}><output><strong>{verdict.status === 'win' && <CircleCheck size={20} aria-hidden="true"/>}{statusText}</strong><span>{verdict.date} · {verdict.slot.toUpperCase()} · {verdict.series} {verdict.number}</span>{verdict.prize && <span>{copy('পুরস্কার', 'पुरस्कार', 'Prize')} · {verdict.prize.tier} · ₹{verdict.prize.amount.toLocaleString('en-IN')}</span>}</output></div>}

  </section>
}
