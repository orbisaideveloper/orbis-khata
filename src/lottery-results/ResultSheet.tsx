import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import type { DrawDocument } from './document-feed'

export function ResultSheet({ document, date, slot, language }: Readonly<{ document?: DrawDocument; date: string; slot: string; language: Language }>) {
  const copy = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  return <article className="result-sheet" aria-label={copy('ড্রয়ের রেজাল্ট PDF', 'ड्रॉ रिज़ल्ट PDF', 'Draw result PDFs')}>
    <h2>{date} · {{ '1pm': '1 PM', '6pm': '6 PM', '8pm': '8 PM' }[slot]} IST</h2>
    <div className="results-document-links">
      {document?.sambadUrl ? <a className="results-source" href={document.sambadUrl} target="_blank" rel="noopener noreferrer">{copy('এই ড্রয়ের লটারি সংবাদ PDF', 'इस ड्रॉ का लॉटरी संवाद PDF', 'Lottery Sambad PDF for this draw')} ↗</a> : <p><output>{copy('লটারি সংবাদ PDF এখনও পাওয়া যায়নি', 'लॉटरी संवाद PDF अभी उपलब्ध नहीं है', 'Lottery Sambad PDF not available yet')}</output></p>}
      {document?.officialUrl ? <a className="results-source" href={document.officialUrl} target="_blank" rel="noopener noreferrer">{copy('এই ড্রয়ের মূল সরকারি গ্যাজেট', 'इस ड्रॉ का मूल आधिकारिक गज़ट', 'Original official gazette for this draw')} ↗</a> : <p>{copy('এই ড্রয়ের সরকারি PDF এখনও পাওয়া যায়নি', 'इस ड्रॉ का आधिकारिक PDF अभी उपलब्ध नहीं है', 'Official PDF for this draw not available yet')}</p>}
    </div>
    <p>{copy('পুরস্কার নিশ্চিত করতে মূল সরকারি গ্যাজেট মিলিয়ে দেখুন।', 'पुरस्कार की पुष्टि मूल आधिकारिक गज़ट से करें।', 'Confirm any prize against the original official gazette.')}</p>
  </article>
}
