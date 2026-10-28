import { useState } from 'react';
import type { Language } from '../i18n';
import { today } from './model';
import { presetRange, type DatePreset } from './date-range';
const copy = {
    bn: { title: 'সময় বেছে নিন', today: 'আজ', yesterday: 'গতকাল', seven: '৭ দিন', month: 'এই মাস', custom: 'নিজের মতো', from: 'শুরুর তারিখ', to: 'শেষ তারিখ' },
    en: { title: 'Choose period', today: 'Today', yesterday: 'Yesterday', seven: '7 days', month: 'This month', custom: 'Custom', from: 'From', to: 'To' },
    hi: { title: 'अवधि चुनें', today: 'आज', yesterday: 'कल', seven: '7 दिन', month: 'इस महीने', custom: 'अपनी अवधि', from: 'शुरू की तारीख', to: 'अंतिम तारीख' },
};
export function DateRange({ language, from, to, onChange }: Readonly<{ language: Language; from: string; to: string; onChange: (from: string, to: string) => void }>) {
    const t = copy[language], day = today();
    const [custom, setCustom] = useState(false);
    const presets: DatePreset[] = ['today', 'yesterday', 'seven', 'month'];
    const selected = custom ? undefined : presets.find(key => { const range = presetRange(key, day); return range.from === from && range.to === to; });
    return <div className="date-range"><div className="date-presets" role="group" aria-label={t.title}>
        {presets.map(key => <button type="button" key={key} aria-pressed={selected === key} onClick={() => { const range = presetRange(key, day); setCustom(false); onChange(range.from, range.to); }}>{t[key]}</button>)}
        <button type="button" aria-pressed={!selected} onClick={() => setCustom(true)}>{t.custom}</button>
    </div><div className="books-filters"><label>{t.from}<input type="date" value={from} max={to || day} onChange={event => onChange(event.target.value, to)}/></label><label>{t.to}<input type="date" value={to} min={from} max={day} onChange={event => onChange(from, event.target.value)}/></label></div></div>;
}
