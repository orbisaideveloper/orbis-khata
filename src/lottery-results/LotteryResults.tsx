import { useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarDays, Clock3, Languages, ShieldAlert } from 'lucide-react'
import { ModulePicker, type ModuleTarget } from '../ModulePicker'
import type { Language } from '../i18n'
import { inLanguage } from '../localize'
import { drawSlots, indiaDate, currentDraw, type DrawSlot } from './result-data'
import './results.css'
import dearLogo from '../assets/dear-lottery-logo.png'
import { useResultFeed } from './useResultFeed'
import { ResultSheet } from './ResultSheet'
import { TicketSearch } from './TicketSearch'

export function LotteryResults({ language, onBack, onSelect, languageControl }: Readonly<{ language: Language; onBack: () => void; onSelect?: (module: ModuleTarget) => void; languageControl?: ReactNode }>) {
  const feed = useResultFeed()
  const [selection, setSelection] = useState(currentDraw)
  const { date, slot } = selection
  const copy = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en)
  const document = feed.documents.find(row => row.date === date && row.slot === slot)
  return <section className="scene light-scene active results-page" aria-labelledby="results-title">
    <header className="results-header">
      <button className="results-back" type="button" onClick={onBack} aria-label={copy('মূল হোমে ফিরুন', 'मुख्य होम पर वापस जाएँ', 'Back to main home')}><ArrowLeft size={20} aria-hidden="true"/></button>
      <h1 id="results-title">{copy('ডিয়ার লটারি রেজাল্ট', 'डियर लॉटरी नतीजे', 'Dear Lottery Results')}</h1>
      <div className="results-header-actions">{onSelect && <ModulePicker language={language} active="results" onSelect={onSelect}/>}{languageControl && <div className="results-language"><Languages size={19} aria-hidden="true"/>{languageControl}</div>}</div>
    </header>
    <div className="results-brand"><img src={dearLogo} alt="Dear Lotteries" width="115" height="52"/><div><strong>{slot === '6pm' ? copy('ডিয়ার · সিকিম', 'डियर · सिक्किम', 'Dear · Sikkim') : copy('ডিয়ার · নাগাল্যান্ড', 'डियर · नागालैंड', 'Dear · Nagaland')}</strong><span className="results-network" role="note">{feed.status === 'offline' ? copy('অফলাইন · PDF খুলতে ইন্টারনেট লাগতে পারে', 'ऑफ़लाइन · PDF के लिए इंटरनेट लग सकता है', 'Offline · PDFs may require internet') : copy('৩০ দিনের রেজাল্ট লিঙ্ক', '30 दिनों के नतीजे', '30-day result links')}</span></div></div>
    <div className="results-controls"><label><CalendarDays size={18} aria-hidden="true"/><input aria-label={copy('ড্রয়ের তারিখ', 'ड्रॉ की तारीख', 'Draw date')} type="date" value={date} max={indiaDate()} onChange={event => setSelection(value => ({ ...value, date: event.target.value }))}/></label><label><Clock3 size={18} aria-hidden="true"/><select aria-label={copy('ড্রয়ের সময় (ভারতীয় সময়)', 'ड्रॉ का समय (भारतीय समय)', 'Draw time (IST)')} value={slot} onChange={event => setSelection(value => ({ ...value, slot: event.target.value as DrawSlot }))}>{drawSlots.map(value => <option value={value} key={value}>{{ '1pm': '1 PM', '6pm': '6 PM', '8pm': '8 PM' }[value]}</option>)}</select></label></div>
    <TicketSearch key={date + slot} date={date} slot={slot} language={language}/>
    <ResultSheet document={document} date={date} slot={slot} language={language}/>
    <p className="results-disclaimer" role="note"><ShieldAlert size={19} aria-hidden="true"/><span>{copy('ফল লটারি সংবাদের তথ্য অনুযায়ী দেখানো হচ্ছে। পুরস্কারের টাকা দেওয়া বা দাবি করার আগে মূল সরকারি গ্যাজেটের সঙ্গে মিলিয়ে নিন।', 'नतीजे लॉटरी संवाद की जानकारी पर आधारित हैं। इनाम देने या दावा करने से पहले मूल सरकारी गज़ट से मिलाएँ।', 'Results use Lottery Sambad data. Verify with the original official gazette before paying or claiming a prize.')}</span></p>
    <div className="results-ad-slot" data-ad-slot="results-footer"/>
    <p className="results-privacy">{copy('স্ক্যান ফোনেই হয়। কোনো ছবি আপলোড হয় না।', 'स्कैन फ़ोन पर होता है। तस्वीर अपलोड नहीं होती।', 'Scans stay on your device. No photo is uploaded.')}</p>
  </section>
}
