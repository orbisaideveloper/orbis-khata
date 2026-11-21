import { useState } from 'react'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import { drawSlots, indiaDate, type DrawSlot } from './result-data'
import './results.css'
import { useResultFeed } from './useResultFeed'
import { ResultSheet } from './ResultSheet'
import { TicketSearch } from './TicketSearch'

export function LotteryResults({ language, onBack }: Readonly<{ language: Language; onBack: () => void }>) {
  const feed = useResultFeed()
  const [selection, setSelection] = useState(() => {
    const latest = [...feed.documents].sort((a, b) => b.date.localeCompare(a.date) || drawSlots.indexOf(b.slot as DrawSlot) - drawSlots.indexOf(a.slot as DrawSlot))[0]
    return { date: latest?.date ?? indiaDate(), slot: (latest?.slot ?? '1pm') as DrawSlot }
  })
  const { date, slot } = selection
  const copy = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  const document = feed.documents.find(row => row.date === date && row.slot === slot)
  return <section className="scene light-scene active results-page" aria-labelledby="results-title">
    <header className="results-header"><button type="button" onClick={onBack} aria-label={copy('মূল হোমে ফিরুন', 'मुख्य होम पर वापस जाएँ', 'Back to main home')}>←</button><h1 id="results-title">{copy('লটারি রেজাল্ট', 'लॉटरी नतीजे', 'Lottery results')}</h1></header>
    <p className="results-network" role="note">{feed.status === 'offline' ? copy('সংযোগ নেই · সংরক্ষিত লিঙ্ক দেখানো হচ্ছে; PDF খুলতে ইন্টারনেট লাগতে পারে', 'कनेक्शन नहीं · सहेजे लिंक; PDF के लिए इंटरनेट लग सकता है', 'Offline · saved links; opening PDFs may require internet') : copy('রেজাল্ট PDF · ৩০ দিনের লিঙ্ক', 'रिज़ल्ट PDF · 30 दिन के लिंक', 'Result PDFs · 30-day links')}</p>
    <p>{slot === '6pm' ? copy('ডিয়ার · সিকিম', 'डियर · सिक्किम', 'Dear · Sikkim') : copy('ডিয়ার · নাগাল্যান্ড', 'डियर · नागालैंड', 'Dear · Nagaland')}</p>
    <div className="results-controls"><label><span>{copy('তারিখ', 'तारीख', 'Date')}</span><input aria-label={copy('ড্রয়ের তারিখ', 'ड्रॉ की तारीख', 'Draw date')} type="date" value={date} max={indiaDate()} onChange={event => setSelection(value => ({ ...value, date: event.target.value }))}/></label><label><span>{copy('সময়', 'समय', 'Time')}</span><select aria-label={copy('ড্রয়ের সময় (ভারতীয় সময়)', 'ड्रॉ का समय (भारतीय समय)', 'Draw time (IST)')} value={slot} onChange={event => setSelection(value => ({ ...value, slot: event.target.value as DrawSlot }))}>{drawSlots.map(value => <option value={value} key={value}>{{ '1pm': '1 PM', '6pm': '6 PM', '8pm': '8 PM' }[value]}</option>)}</select></label></div>
    <ResultSheet document={document} date={date} slot={slot} language={language}/>
    <TicketSearch key={date + slot} date={date} slot={slot} language={language}/>
    <div className="results-ad-slot" data-ad-slot="results-footer" aria-hidden="true"/>
  </section>
}
