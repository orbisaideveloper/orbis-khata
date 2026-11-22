import { useCallback, useEffect, useRef, useState } from 'react'
import { recoverDocument } from './ticket-client'
import { ArrowUpRight, FileText } from 'lucide-react'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import type { DrawDocument } from './document-feed'

function DocumentLabel({ official, language }: Readonly<{ official: boolean; language: Language }>) {
  return <><FileText size={17} aria-hidden="true"/><span>{official ? inLanguage(language, 'সরকারি গ্যাজেট', 'सरकारी गज़ट', 'Government Gazette') : inLanguage(language, 'সংবাদ PDF', 'संवाद PDF', 'Sambad PDF')}</span><ArrowUpRight size={15} aria-hidden="true"/></>
}

export function ResultSheet({ document, date, slot, language }: Readonly<{ document?: DrawDocument; date: string; slot: string; language: Language }>) {
  const copy = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  const [recovered, setRecovered] = useState<DrawDocument | null>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'pending' | 'error'>('idle')
  const active = useRef<AbortController | null>(null)
  const current = recovered ?? document
  const recover = useCallback(async (popup: Window | null = null) => {
    if (active.current) { popup?.close(); return }
    const controller = new AbortController(); active.current = controller; setState('busy')
    const timer = window.setTimeout(() => controller.abort(), 25000)
    try {
      const result = await recoverDocument(date, slot, controller.signal)
      if (controller.signal.aborted) { popup?.close(); return }
      if (result?.sambadUrl) { setRecovered(result); setState('idle'); if (popup) popup.location.href = result.sambadUrl }
      else { setState('pending'); popup?.close() }
    } catch {
      if (!controller.signal.aborted) setState('error')
      popup?.close()
    }
    finally { window.clearTimeout(timer); if (active.current === controller) active.current = null }
  }, [date, slot])
  useEffect(() => {
    const wake = () => { if (!current?.sambadUrl && globalThis.document.visibilityState !== 'hidden') void recover() }
    wake()
    const timer = window.setInterval(wake, 30000)
    return () => { active.current?.abort(); window.clearInterval(timer) }
    // The parent keys this component by selected date/slot.
  }, [date, slot, current?.sambadUrl, recover])
  let message = copy('ফল প্রকাশিত হলে সংগ্রহ হবে। PDF বোতামেও চেষ্টা করতে পারেন।', 'प्रकाशित होने पर नतीजा प्राप्त होगा। PDF बटन से भी कोशिश करें।', 'Waiting for publication. You can also try the PDF button.')
  if (state === 'busy') message = copy('ফল খোঁজা হচ্ছে…', 'नतीजा खोज रहे हैं…', 'Checking for the result…')
  if (state === 'error') message = copy('এখন সংগ্রহ করা যায়নি। আবার চেষ্টা করুন।', 'अभी प्राप्त नहीं हुआ। फिर कोशिश करें।', 'Could not collect now. Please retry.')
  return <article className="result-sheet" aria-label={copy('ড্রয়ের রেজাল্ট PDF', 'ड्रॉ रिज़ल्ट PDF', 'Draw result PDFs')}>
    <div className="results-document-links">
      {current?.sambadUrl ? <a className="results-source" aria-label={copy('এই ড্রয়ের লটারি সংবাদ PDF', 'इस ड्रॉ का लॉटरी संवाद PDF', 'Lottery Sambad PDF for this draw')} href={current.sambadUrl} target="_blank" rel="noopener noreferrer"><DocumentLabel official={false} language={language}/></a> : <button className="results-source" type="button" disabled={state === 'busy'} onClick={() => { const popup = window.open('about:blank', '_blank'); if (popup) { popup.opener = null }
        void recover(popup) }}><DocumentLabel official={false} language={language}/></button>}
      <OfficialDocument document={document} date={date} language={language}/>
    </div>
    {!current?.sambadUrl && <output>{message}</output>}
  </article>
}

function OfficialDocument({ document, date, language }: Readonly<{ document?: DrawDocument; date: string; language: Language }>) {
  const title = inLanguage(language, 'এই ড্রয়ের মূল সরকারি গ্যাজেট', 'इस ड्रॉ का मूल आधिकारिक गज़ट', 'Original official gazette for this draw')
  const label = <DocumentLabel official language={language}/>
  if (document?.officialSource === 'sikkim-6pm') return <form action="https://www.sikkimlotteries.com/old_result.php" method="post" target="_blank" rel="noopener noreferrer">
    <input type="hidden" name="deardbpdf" value={date.split('-').reverse().join('/')}/>
    <input type="hidden" name="deardb_pdf_btn" value="Download"/>
    <button type="submit" className="results-source" aria-label={title}>{label}</button>
  </form>
  if (document?.officialUrl) return <a className="results-source" aria-label={title} href={document.officialUrl} target="_blank" rel="noopener noreferrer">{label}</a>
  return <div className="results-source results-pending" aria-disabled="true">{label}<span>{inLanguage(language, 'প্রকাশের অপেক্ষায়', 'प्रकाशन की प्रतीक्षा', 'Awaiting publication')}</span></div>
}
