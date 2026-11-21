import { ArrowUpRight, FileText } from 'lucide-react'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import type { DrawDocument } from './document-feed'

function DocumentLabel({ official, language }: Readonly<{ official: boolean; language: Language }>) {
  return <><FileText size={17} aria-hidden="true"/><span>{official ? inLanguage(language, 'সরকারি PDF', 'सरकारी PDF', 'Official PDF') : inLanguage(language, 'সংবাদ PDF', 'संवाद PDF', 'Sambad PDF')}</span><ArrowUpRight size={15} aria-hidden="true"/></>
}

export function ResultSheet({ document, date, language }: Readonly<{ document?: DrawDocument; date: string; slot: string; language: Language }>) {
  const copy = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  return <article className="result-sheet" aria-label={copy('ড্রয়ের রেজাল্ট PDF', 'ड्रॉ रिज़ल्ट PDF', 'Draw result PDFs')}>
    <h2>{copy('রেজাল্টের নথি', 'रिज़ल्ट दस्तावेज़', 'Result documents')}</h2>
    <div className="results-document-links">
      {document?.sambadUrl ? <a className="results-source" aria-label={copy('এই ড্রয়ের লটারি সংবাদ PDF', 'इस ड्रॉ का लॉटरी संवाद PDF', 'Lottery Sambad PDF for this draw')} href={document.sambadUrl} target="_blank" rel="noopener noreferrer"><DocumentLabel official={false} language={language}/></a> : <div className="results-source results-pending" aria-disabled="true"><DocumentLabel official={false} language={language}/><output>{copy('প্রকাশের অপেক্ষায়', 'प्रकाशन की प्रतीक्षा', 'Awaiting publication')}</output></div>}
      <OfficialDocument document={document} date={date} language={language}/>
    </div>
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
