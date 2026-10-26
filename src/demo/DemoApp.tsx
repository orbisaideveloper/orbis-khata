import { inLanguage } from '../localize';
import { confirmDelete } from '../confirm-delete';
import { useCallback, useMemo, useState } from 'react';
import { DemoWorkspace } from './DemoWorkspace';
import { WorkspaceMenu } from '../WorkspaceMenu';
import { BooksNavigation, type BooksPage } from '../books-navigation';
import { TutorialContext } from '../tutorial';
import { languageOptions, type Language } from '../i18n';
import { resetDemo } from './store';
import '../App.css';
import './design.css';
import { designCopy } from './design-copy';
import { DesignIcon } from './DesignIcon';
const copy = { bn: { title: 'ORBIS খাতা · ডেমো', hint: 'এটি আলাদা ডেমো। আসল অ্যাকাউন্টে কিছু যাবে না। পেজ রিফ্রেশ করলে ডেমো মুছে যাবে।', reset: 'ডেমো নতুন করে শুরু', language: 'ভাষা' }, en: { title: 'ORBIS Khata · Demo', hint: 'Isolated demo. Nothing is saved to your real account. Refreshing clears this demo.', reset: 'Reset demo', language: 'Language' }, hi: { title: 'ORBIS खाता · डेमो', hint: 'अलग डेमो। असली अकाउंट में कुछ नहीं जाएगा। रिफ्रेश करने पर डेमो मिट जाएगा।', reset: 'डेमो फिर से शुरू करें', language: 'भाषा' } };
export default function DemoApp() {
    const [language, setLanguage] = useState<Language>('bn'), [page, setPage] = useState<BooksPage>('home'), [tutorial, setTutorial] = useState(false), [revision, setRevision] = useState(0);
    const t = copy[language], d = designCopy[language];
    const [profile, setProfile] = useState(false);
    const navigate = useCallback((next: BooksPage) => {
        if (next !== page && page === 'bills' && !window.confirm(inLanguage(language, 'বিলের পাতা ছেড়ে যাবেন?', 'बिल का पृष्ठ छोड़ें?', 'Leave the bill page?'))) {
            return;
        }
        setProfile(false);
        setPage(next);
        window.scrollTo?.(0, 0);
    }, [page, language]);
    const navigation = useMemo(() => ({ page, open: navigate }), [page, navigate]);
    return <BooksNavigation.Provider value={navigation}><TutorialContext.Provider value={tutorial}><main className="phone kh-app" lang={language}><section className="scene light-scene active">
  <header className="kh-app-header"><button className="kh-brand" type="button" onClick={() => navigate('home')} aria-label={d.home}><span className="kh-logo">O</span><span><small>ORBIS</small><strong>{inLanguage(language, 'খাতাবই', 'खाताबही', 'Khata Boi')}</strong></span></button><div className="kh-header-actions"><select aria-label={t.language} value={language} onChange={e => setLanguage(e.target.value as Language)}>{languageOptions.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select><WorkspaceMenu demo language={language} signedIn tutorial={tutorial} onTutorial={setTutorial} onBooks={navigate} onProfile={() => setProfile(true)} onLogout={() => { resetDemo(); setRevision(n => n + 1); }}/></div></header>
  <aside className="kh-demo-strip"><span><b>{d.demo}</b> · {d.demoHint}</span><button type="button" onClick={() => {
            if (confirmDelete(language, t.reset)) {
                resetDemo();
                setPage('home');
                setRevision(n => n + 1);
            }
        }}>{d.reset}</button></aside>
  {profile && <section className="books-card kh-profile-panel"><h2>{d.account}</h2><p>{d.accountHint}</p><label><input type="checkbox" checked={tutorial} onChange={e => setTutorial(e.target.checked)}/>{d.tutorial}</label></section>}
  <div className="kh-workspace">
  <DemoWorkspace key={revision} language={language}/>
  </div>
 <nav className="kh-bottom-nav" aria-label={inLanguage(language, 'প্রধান নেভিগেশন', 'मुख्य नेविगेशन', 'Main navigation')}>{(['home', 'bills', 'all-ledgers', 'parties'] as const).map(target => <button type="button" key={target} aria-current={page === target ? 'page' : undefined} onClick={() => navigate(target)}><DesignIcon name={target === 'all-ledgers' ? 'ledger' : target}/><span>{target === 'all-ledgers' ? d.ledger : d[target]}</span></button>)}</nav>
 </section></main></TutorialContext.Provider></BooksNavigation.Provider>;
}
