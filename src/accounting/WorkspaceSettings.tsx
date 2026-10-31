import {TutorialNote} from '../tutorial';
import {BillDesign} from '../demo/BillDesign';
import { useEffect, useState } from 'react';
import type { Language } from '../i18n';
import { inLanguage } from '../localize';
import { confirmDelete } from '../confirm-delete';
import { useWorkspaceSettings } from './use-settings';
import { validSettings, type WorkspaceSettings as Settings } from './workspace-contract';
import { money } from './model';
export function WorkspaceSettings({ company, name, language, onChanged }: Readonly<{
    company: string;
    name: string;
    language: Language;
    onChanged: () => void;
}>) {
    const { settings, request, failed } = useWorkspaceSettings(company), [draft, setDraft] = useState<Settings | null>(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [accounts, setAccounts] = useState<{
        id: string;
        name: string;
        balance: string;
    }[]>([]);
    const value = draft ?? settings;
    useEffect(() => {
        let alive = true;
        void request<unknown>('workspace', { company, action: 'accounts' }).then(rows => {
            if (alive && Array.isArray(rows)) {
                setAccounts(rows);
            }
        }, () => { });
        return () => { alive = false; };
    }, [company, request]);
    const label = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en);
    async function save() {
        if (!validSettings(value)) {
            setMessage(label('নাম ও সিরিয়াল পরীক্ষা করুন।', 'नाम और क्रम जाँचें।', 'Check names and numbering.'));
            return;
        }
        setBusy(true);
        try {
            await request('workspace', { company, action: 'settings-save', settings: value });
            setMessage(label('সেটিংস সেভ হয়েছে।', 'सेटिंग्स सहेजी गईं।', 'Settings saved.'));
            onChanged();
        }
        catch {
            setMessage(label('সেভ হয়নি। আবার চেষ্টা করুন।', 'सहेजा नहीं गया। फिर कोशिश करें।', 'Not saved. Retry.'));
        }
        finally {
            setBusy(false);
        }
    }
    async function retire() {
        if (!confirmDelete(language, name)) {
            return;
        }
        const typed = window.prompt(label('কোম্পানির নাম লিখুন: ', 'कंपनी का नाम लिखें: ', 'Type the company name: ') + name);
        if (typed !== name) {
            return;
        }
        setBusy(true);
        try {
            await request('workspace', { company, action: 'retire', name });
            onChanged();
        }
        catch {
            setMessage(label('কোম্পানি মুছে দেওয়া যায়নি।', 'कंपनी नहीं हटाई गई।', 'Could not delete company.'));
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="books-card workspace-settings"><h2>{label('সেটিংস', 'सेटिंग्स', 'Settings')}</h2><fieldset className="production-setting"><label className="books-inline-check"><input type="checkbox" aria-label={label('প্রোডাকশন মোড চালু করুন','उत्पादन मोड चालू करें','Enable production mode')} checked={value.production??false} onChange={e=>setDraft({...value,production:e.target.checked})}/><span>{label('প্রোডাকশন','उत्पादन','Production')}</span></label><TutorialNote><p>{label('চালু করলে কাঁচামাল পাঠানো, উৎপাদন গ্রহণ এবং পারচেজ বিলের প্রোডাকশন অপশন দেখা যাবে। বন্ধ করলেও আগের হিসাব থাকবে।','चालू करने पर कच्चा माल, उत्पादन प्राप्ति और खरीद बिल का उत्पादन विकल्प दिखेगा। बंद करने पर इतिहास रहेगा।','Show production inputs, output receipts and the purchase routing option. Turning off retains all history.')}</p></TutorialNote></fieldset>{failed && <output role="alert">{label('সেটিংস পড়া যায়নি। সংযোগ পরীক্ষা করুন।', 'सेटिंग्स नहीं पढ़ी गईं। कनेक्शन जाँचें।', 'Settings unavailable. Check connection.')}</output>}<details><summary>{label('পেমেন্ট অ্যাকাউন্ট', 'भुगतान खाते', 'Payment accounts')}</summary><TutorialNote><p>{label('GPay/PhonePe যে ব্যাংকে জমা হয় সেই অ্যাকাউন্ট বেছে নিন; একই টাকার জন্য দুটি অ্যাকাউন্ট বানাবেন না।', 'GPay/PhonePe के लिए उसी बैंक खाते का चयन करें जिसमें रकम आती है।', 'For GPay/PhonePe choose the bank account receiving the money; avoid counting the same money twice.')}</p></TutorialNote>{value.accounts.map((row, index) => <fieldset key={row.id}><label>{label('অ্যাকাউন্টের নাম', 'खाते का नाम', 'Account name')}<input maxLength={60} value={row.name} onChange={e => setDraft({ ...value, accounts: value.accounts.map((a, i) => i === index ? { ...a, name: e.target.value } : a) })}/></label><label>{label('ধরন', 'प्रकार', 'Type')}<select disabled={row.id === 'cash' || row.id === 'bank'} value={row.kind} onChange={e => setDraft({ ...value, accounts: value.accounts.map((a, i) => i === index ? { ...a, kind: e.target.value as 'cash' | 'bank' } : a) })}><option value="cash">{label('নগদ', 'नकद', 'Cash')}</option><option value="bank">{label('ব্যাংক', 'बैंक', 'Bank')}</option></select></label><label>{label('পেমেন্ট মাধ্যম (ঐচ্ছিক)', 'भुगतान माध्यम (वैकल्पिक)', 'Payment channel (optional)')}<input placeholder="UPI / GPay / PhonePe / Cheque" maxLength={40} value={row.channel} onChange={e => setDraft({ ...value, accounts: value.accounts.map((a, i) => i === index ? { ...a, channel: e.target.value } : a) })}/></label><label className="books-inline-check"><input type="checkbox" checked={row.active} onChange={e => setDraft({ ...value, accounts: value.accounts.map((a, i) => i === index ? { ...a, active: e.target.checked } : a) })}/>{label('চালু', 'सक्रिय', 'Active')}</label><small>{money(accounts.find(a => a.id === row.id)?.balance ?? '0')}</small></fieldset>)}<button disabled={busy || value.accounts.length >= 30} type="button" onClick={() => setDraft({ ...value, accounts: [...value.accounts, { id: crypto.randomUUID(), name: '', kind: 'bank', channel: '', active: true }] })}>＋ {label('অ্যাকাউন্ট যোগ করুন', 'खाता जोड़ें', 'Add account')}</button></details>
 <details><summary>{label('বিল সেটিংস', 'बिल सेटिंग्स', 'Bill settings')}</summary><TutorialNote><p>{label('অটোমেটিক বিল নম্বর শুধু ১, ২, ৩… হবে। এপ্রিল–মার্চ অর্থবর্ষ বদলালে ১ থেকে শুরু হবে। পরের সিরিয়াল বর্তমান অর্থবর্ষের জন্য। ম্যানুয়ালে নিজের নম্বর লিখুন।', 'स्वचालित बिल नंबर केवल 1, 2, 3… होंगे। अप्रैल–मार्च वर्ष बदलने पर क्रम 1 से शुरू होगा। अगला क्रम वर्तमान वर्ष के लिए है। मैनुअल में अपना नंबर लिखें।', 'Automatic bill numbers are simply 1, 2, 3…; no prefix, year or date is displayed. April–March years restart at 1; Next serial applies to the current financial year. Manual mode requires your own bill number.')}</p></TutorialNote><label>{label('বিলে কোম্পানির নাম (ঐচ্ছিক)','बिल पर कंपनी नाम (वैकल्पिक)','Invoice company name (optional)')}<input maxLength={120} value={value.invoice?.name??''} placeholder={name} onChange={e=>setDraft({...value,invoice:{template:'sample',details:'',...value.invoice,name:e.target.value}})}/></label><label>{label('ঠিকানা ও ফোন (ঐচ্ছিক)','पता और फोन (वैकल्पिक)','Address and phone (optional)')}<input maxLength={500} value={value.invoice?.details??''} onChange={e=>setDraft({...value,invoice:{template:'sample',name:'',...value.invoice,details:e.target.value}})}/></label><BillDesign language={language} value={value.invoice?.template??'sample'} onChange={template=>setDraft({...value,invoice:{name:'',details:'',...value.invoice,template}})}/>
{(['sale', 'purchase', 'expense'] as const).map(kind => <fieldset key={kind}><legend>{{ sale: label('সেল', 'बिक्री', 'Sale'), purchase: label('পারচেজ', 'खरीद', 'Purchase'), expense: label('খরচ', 'खर्च', 'Expense') }[kind]}</legend><label>{label('নম্বর দেওয়ার পদ্ধতি','नंबर देने का तरीका','Numbering mode')}<select value={value.mode?.[kind]??'auto'} onChange={e=>setDraft({...value,mode:{sale:'auto',purchase:'auto',expense:'auto',...value.mode,[kind]:e.target.value as 'auto'|'manual'}})}><option value="auto">{label('অটোমেটিক','स्वचालित','Automatic')}</option><option value="manual">{label('ম্যানুয়াল','मैनुअल','Manual')}</option></select></label><label>{label('পরের সিরিয়াল', 'अगला क्रम', 'Next serial')}<input inputMode="numeric" value={value.next[kind]} onChange={e => setDraft({ ...value, next: { ...value.next, [kind]: e.target.value } })}/></label></fieldset>)}</details><button disabled={busy || failed} type="button" onClick={() => { void save(); }}>{label('সেটিংস সেভ করুন', 'सेटिंग्स सहेजें', 'Save settings')}</button><details><summary>{label('কোম্পানি পরিচালনা', 'कंपनी प्रबंधन', 'Company management')}</summary><strong>{name}</strong><TutorialNote><p>{label('ডিলিট করলে কোম্পানি লুকিয়ে যাবে। ৩০ দিনের মধ্যে ফিরিয়ে আনা যাবে; তারপর স্থায়ী অপসারণের সময় হবে।', 'हटाने पर कंपनी छिपेगी। 30 दिन तक वापस ला सकते हैं; फिर स्थायी सफाई होगी।', 'Deletion hides this company. Restore within 30 days before scheduled permanent removal.')}</p></TutorialNote><button disabled={busy} type="button" onClick={() => { void retire(); }}>{label('কোম্পানি ডিলিট', 'कंपनी मिटाएँ', 'Delete company')}</button></details>{message && <output>{message}</output>}</section>;
}
export function RetiredCompanies({ language, onChanged }: Readonly<{
    language: Language;
    onChanged: () => void;
}>) {
    const { request } = useWorkspaceSettings(''), [rows, setRows] = useState<{
        id: string;
        name: string;
        purge_after: string;
    }[]>([]), [error, setError] = useState('');
    useEffect(() => {
        let alive = true;
        void request<unknown>('retired-companies', {}).then(value => {
            if (alive && Array.isArray(value)) {
                setRows(value);
            }
        }, () => { });
        return () => { alive = false; };
    }, [request]);
    return <details className="books-card"><summary>{inLanguage(language, 'ডিলিট করা কোম্পানি', 'हटाई कंपनियाँ', 'Deleted companies')}</summary>{rows.map(row => <div key={row.id}><strong>{row.name}</strong><small>{row.purge_after.slice(0, 10)}</small><button type="button" onClick={() => {
                if (!window.confirm(inLanguage(language, 'কোম্পানি ফিরিয়ে আনবেন?', 'कंपनी वापस लाएँ?', 'Restore company?'))) {
                    return;
                }
                void request('workspace', { company: row.id, action: 'restore', name: row.name }).then(onChanged, () => setError('Restore failed'));
            }}>{inLanguage(language, 'ফিরিয়ে আনুন', 'वापस लाएँ', 'Restore')}</button></div>)}{error && <output role="alert">{error}</output>}</details>;
}
