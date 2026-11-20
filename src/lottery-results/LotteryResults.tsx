import { useState } from 'react'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import { drawSlots, indiaDate, type DrawSlot } from './result-data'
import './results.css'
import { useResultFeed } from './useResultFeed'
import { ResultSheet } from './ResultSheet'

export function LotteryResults({ language, onBack }: Readonly<{ language: Language; onBack: () => void }>) {
  const [date, setDate] = useState(indiaDate)
  const [slot, setSlot] = useState<DrawSlot>('1pm')
  const copy = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  const feed = useResultFeed()
  const result = feed.results.find(row => row.date === date && row.slot === slot)
  return <section className="scene light-scene active results-page" aria-labelledby="results-title">
    <header className="results-header"><button type="button" onClick={onBack} aria-label={copy('মূল হোমে ফিরুন', 'मुख्य होम पर वापस जाएँ', 'Back to main home')}>←</button><h1 id="results-title">{copy('লটারি রেজাল্ট', 'लॉटरी नतीजे', 'Lottery results')}</h1></header>
    <p className="results-network" role="note">{feed.status === 'offline' ? copy('অফলাইন · ফোনে থাকা ফল দেখানো হচ্ছে', 'ऑफ़लाइन · फ़ोन पर सहेजे नतीजे', 'Offline · showing saved results') : copy('অনলাইন ফল · ৩০ দিনের সংরক্ষণ', 'ऑनलाइन नतीजे · 30 दिन का संग्रह', 'Online results · 30-day retention')}</p>
    <p>{copy('ডিয়ার · নাগাল্যান্ড', 'डियर · नागालैंड', 'Dear · Nagaland')}</p>
    <div className="results-controls"><label>{copy('ড্রয়ের তারিখ', 'ड्रॉ की तारीख', 'Draw date')}<input type="date" value={date} max={indiaDate()} onChange={event => setDate(event.target.value)}/></label><label>{copy('ড্রয়ের সময় (ভারতীয় সময়)', 'ड्रॉ का समय (भारतीय समय)', 'Draw time (IST)')}<select value={slot} onChange={event => setSlot(event.target.value as DrawSlot)}>{drawSlots.map(value => <option value={value} key={value}>{{ '1pm': '1 PM', '6pm': '6 PM', '8pm': '8 PM' }[value]}</option>)}</select></label></div>
    <button type="button" className="results-sample-button" onClick={() => { setDate('2026-11-20'); setSlot('1pm') }}>{copy('২০ নভেম্বর · দুপুর ১টার নমুনা দেখুন', '20 नवंबर · दोपहर 1 बजे का नमूना देखें', 'View sample: 20 November, 1 PM')}</button>
    {result ? <ResultSheet result={result} language={language}/> : <div className="results-notice" role="status"><h2>{copy('যাচাই করা ফল এখনও উপলব্ধ নয়', 'सत्यापित नतीजा अभी उपलब्ध नहीं है', 'Verified result not available yet')}</h2><p>{copy('এই ড্রয়ের যাচাই করা ফল এখনও ফোনে আসেনি। সরকারি প্রকাশনা নিচের লিঙ্কে দেখুন। ফল না পাওয়ার অর্থ টিকিটে পুরস্কার নেই—এমন নয়।', 'इस ड्रॉ का सत्यापित नतीजा अभी फ़ोन पर उपलब्ध नहीं है। नीचे आधिकारिक प्रकाशन देखें। नतीजा उपलब्ध न होने का अर्थ टिकट पर इनाम नहीं होना नहीं है।', 'A reviewed result for this draw has not been downloaded. Check the official publication below. An unavailable result does not mean the ticket has no prize.')}</p></div>}
    <div className="results-ad-slot" data-ad-slot="results-footer" aria-hidden="true"/>
    <a className="results-source" href="https://nagalandlotteries.com/results.php" target="_blank" rel="noopener noreferrer">{copy('সরকারি রেজাল্ট গ্যাজেট দেখুন', 'आधिकारिक रिज़ल्ट गज़ट देखें', 'Open official result gazettes')} ↗</a>
  </section>
}
