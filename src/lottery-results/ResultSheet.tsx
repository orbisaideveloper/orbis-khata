import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import type { PublishedResult } from './result-feed'

export function ResultSheet({ result, language }: Readonly<{ result: PublishedResult; language: Language }>) {
  const copy = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  return <article className="result-sheet" aria-label={copy('নমুনা রেজাল্ট', 'नमूना नतीजा', 'Sample result')}>
    <p role="status">{copy('নমুনা · দুই উৎস হাতে মিলিয়ে যাচাই করা', 'नमूना · दो स्रोतों से मैन्युअल मिलान', 'Sample · manually compared with two sources')}</p>
    <h2>{result.name}</h2>
    <p>{result.date} · {{'1pm': '1 PM', '6pm': '6 PM', '8pm': '8 PM'}[result.slot] ?? result.slot} IST · {copy('ড্র', 'ड्रॉ', 'Draw')} {result.draw}</p>
    <h3>{copy('প্রথম পুরস্কার', 'पहला पुरस्कार', 'First prize')}</h3>
    <strong className="result-first">{result.first.series} {result.first.number}</strong>
    <h3>{copy('সান্ত্বনা পুরস্কারের নম্বর', 'सांत्वना पुरस्कार नंबर', 'Consolation number')}</h3><p>{result.consolation}</p>
    <p>{copy('প্রথম পুরস্কারের বিজয়ী সিরিয়াল ও সিরিজ বাদে; সম্পূর্ণ শর্ত সরকারি গ্যাজেটে দেখুন।', 'पहले पुरस्कार की विजेता सीरियल और सीरीज़ को छोड़कर; पूरी शर्तें आधिकारिक गज़ट में देखें।', 'Excludes the first-prize winning serial and series; see the official gazette for full conditions.')}</p>
    {result.tiers.map(tier => <section key={tier.rank}><h3>{copy('পুরস্কার', 'पुरस्कार', 'Prize')} {tier.rank}</h3><div className="result-number-grid">{tier.numbers.map(number => <span key={number}>{number}</span>)}</div></section>)}
    <a className="results-source" href={result.officialUrl} target="_blank" rel="noopener noreferrer">{copy('এই ড্রয়ের মূল সরকারি গ্যাজেট', 'इस ड्रॉ का मूल आधिकारिक गज़ट', 'Original official gazette for this draw')} ↗</a>
    <p>{copy('উৎসের গ্যাজেট দেখে নিশ্চিত করুন। ফল দেখা কোনো পুরস্কারের দাবি জমা দেয় না।', 'मूल गज़ट से पुष्टि करें। नतीजा देखने से पुरस्कार का दावा जमा नहीं होता।', 'Confirm against the original gazette. Viewing a result does not submit a prize claim.')}</p>
  </article>
}
