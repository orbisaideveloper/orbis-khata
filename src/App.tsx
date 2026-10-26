import { BookServicesContext, liveBookServices } from './books-services';
import { DemoWorkspace } from './demo/DemoWorkspace';
import './demo/design.css';
import { BooksNavigation, type BooksPage } from './books-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { languageOptions, readLanguage, saveLanguage, translations } from './i18n';
import type { Language, TextKey } from './i18n';
import './App.css';
import { PwaStatus } from './PwaStatus';
import { WorkspaceMenu } from './WorkspaceMenu';
import { TutorialContext, readTutorial, saveTutorial } from './tutorial';
import { authClient } from './auth/client';
import { useAccount } from './auth/useAccount';
import { AccountForm } from './auth/AccountForm';
import { accountCopy } from './auth/copy';
import { CompanyGate } from './auth/CompanyGate';
import { CommonAccountProfile } from './profile/CommonAccountProfile';
import { resolveKhataView, type View } from './navigation-policy';
// Central customer login is required. The data gateway enforces authorization.
const guestUiEnabled = import.meta.env.DEV && !authClient && import.meta.env.VITE_KHATA_GUEST_UI === 'true';
const languagePresentation: Record<Language, {
    title: string;
    pickerLabel: string;
}> = {
    bn: { title: 'ORBIS খাতাবই', pickerLabel: 'ভাষা নির্বাচন' },
    en: { title: 'ORBIS Khata Boi', pickerLabel: 'Choose language' },
    hi: { title: 'ORBIS खाताबही', pickerLabel: 'भाषा चुनें' },
};
function OrbitMark() {
    return (<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="2"/>
      <ellipse cx="16" cy="16" rx="15" ry="6" transform="rotate(-36 16 16)" stroke="#9bceff" strokeWidth="1.5"/>
      <circle cx="25.7" cy="8.8" r="2.4" fill="currentColor"/>
    </svg>);
}
function mainClass(view: View, signedIn: boolean) { return view === 'khata' && signedIn ? 'phone kh-app' : 'phone'; }
function accountStateScreen(account: ReturnType<typeof useAccount>, language: Language, shellClass: string) {
    if (account.loading) {
        return <main className={shellClass}><PwaStatus language={language}/><output>{accountCopy[language].network}</output></main>;
    }
    if (account.unavailable) {
        return <main className={shellClass}><PwaStatus language={language}/><p role='alert'>{accountCopy[language].error}</p><button type='button' onClick={() => window.location.reload()}>{accountCopy[language].retry}</button></main>;
    }
    if (account.recovery) {
        return <main className='phone'><AccountForm key='recovery' language={language} recovery onRecovered={() => account.setRecovery(false)}/></main>;
    }
    return null;
}
function App() {
    // No demo session, user, financial values, company or token is persisted.
    const account = useAccount();
    const [booksPage, setBooksPage] = useState<BooksPage>('home');
    const [tutorial, setTutorial] = useState(readTutorial);
    const [view, setView] = useState<View>(() => authClient && account.session ? 'workspace' : 'welcome');
    const [language, setLanguage] = useState<Language>(readLanguage);
    const sessionId = account.session?.user.id ?? null;
    const [knownSession, setKnownSession] = useState(sessionId);
    if (authClient && !account.loading && sessionId !== knownSession) {
        setKnownSession(sessionId);
        setView(sessionId ? 'workspace' : 'welcome');
    }
    const signedIn = Boolean(account.session);
    const [logoutError, setLogoutError] = useState(false);
    const guestEntered = useRef(false);
    const t = (key: TextKey) => translations[language][key];
    const menu = () => <WorkspaceMenu enhanced language={language} signedIn={signedIn} onBooks={page => {
            setBooksPage(page);
            if (view !== 'khata') {
                navigate('khata');
            }
        }} tutorial={tutorial} onTutorial={enabled => { setTutorial(enabled); saveTutorial(enabled); }} onProfile={() => navigate('profile')} onLogout={() => { void logout(); }}/>;
    const renderBar = (backView: View, ariaKey: TextKey, pillKey: TextKey) => (<header className="bar"><button type="button" className="back" onClick={() => navigate(backView)} aria-label={t(ariaKey)}>←</button><span className="pill">{t(pillKey)}</span>{languagePicker(true)}{signedIn && menu()}</header>);
    const renderBrand = (subKey: TextKey) => (<div className="brand"><span className="orb"><OrbitMark /></span><span>ORBIS<small>{t(subKey)}</small></span></div>);
    const renderPlanned = (ic: string, cls: string, nameKey: TextKey, descKey: TextKey, statusKey: TextKey) => (<div className="module planned"><span className={`ic ${cls}`} aria-hidden="true">{ic}</span><span className="copy"><strong>{t(nameKey)}</strong><small>{t(descKey)}</small></span><span className="status">{t(statusKey)}</span></div>);
    useEffect(() => {
        document.documentElement.lang = language;
        document.title = languagePresentation[language].title;
    }, [language]);
    useEffect(() => {
        window.history.replaceState({ khataView: 'welcome' }, '');
        function onBack(event: PopStateEvent) {
            const target = (event.state as {
                khataView?: View;
            } | null)?.khataView;
            // Browser history uses the same access policy as button navigation.
            setView(resolveKhataView(target, signedIn, guestUiEnabled, guestEntered.current));
        }
        window.addEventListener('popstate', onBack);
        return () => window.removeEventListener('popstate', onBack);
    }, [signedIn]);
    useEffect(() => {
        if (!authClient || account.loading) {
            return;
        }
        window.history.replaceState({ khataView: signedIn ? 'workspace' : 'welcome' }, '');
    }, [signedIn, account.loading]);
    async function logout() {
        if (!authClient) {
            backToWelcome();
            return;
        }
        try {
            const { error } = await authClient.auth.signOut({ scope: 'local' });
            setLogoutError(Boolean(error));
        }
        catch {
            setLogoutError(true);
        }
    }
    function navigate(next: View) {
        const enteringGuest = next === 'workspace' && view === 'login';
        const target = resolveKhataView(next, signedIn, guestUiEnabled, guestEntered.current || enteringGuest);
        if (target === 'workspace' && view === 'login') {
            guestEntered.current = true;
        }
        window.history.pushState({ khataView: target }, '');
        setView(target);
        document.scrollingElement?.scroll?.({ top: 0 });
    }
    function backToWelcome() {
        guestEntered.current = false;
        // Explicit exit clears the current UI navigation trail, not any sensitive data.
        window.history.replaceState({ khataView: 'welcome' }, '');
        setView('welcome');
        document.scrollingElement?.scroll?.({ top: 0 });
    }
    function languagePicker(light = false) {
        return (<select className={`lang${light ? ' light' : ''}`} aria-label={languagePresentation[language].pickerLabel} value={language} onChange={(event) => {
                const selected = event.target.value as Language;
                setLanguage(selected);
                saveLanguage(selected);
            }}>
        {languageOptions.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
      </select>);
    }
    const navigation = useMemo(() => ({ page: booksPage, open: setBooksPage }), [booksPage]);
    const shellClass = mainClass(view, signedIn);
    const accountScreen = accountStateScreen(account, language, shellClass);
    if (accountScreen) {
        return accountScreen;
    }
    return (<BooksNavigation.Provider value={navigation}><TutorialContext.Provider value={tutorial}><main className={shellClass}><PwaStatus language={language}/>
      {logoutError && <p role="alert">{accountCopy[language].error}</p>}
      {view === 'welcome' && (<section className="scene welcome active" aria-label={t('h1a')}>
          <header className="top">
            {renderBrand('brand')}
            {languagePicker()}
          </header>
          <div className="headline">
            <span className="eyebrow">{t('tag')}</span>
            <h1><span>{t('h1a')}</span><br /><span>{t('h1b')}</span><br /><span style={{ color: 'white' }}>{t('h1c')}</span></h1>
            <p>{t('intro')}</p>
          </div>
          <div className="art">
            <div className="paper">
              <div className="cap">{t('paper')}</div>
              <div className="balance">—</div>
              <div className="muted">{t('noFigures')}</div>
              <div className="empty-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
              <div className="lower"><span>{t('in')}</span><span>{t('out')}</span></div>
            </div>
            <span className="bubble one">{t('one')}</span><span className="bubble two">{t('mods')}</span>
          </div>
          <div className="actions">
            <button type="button" className="primary" onClick={() => navigate('login')}>{t('start')}</button>
            <button type="button" className="secondary" onClick={() => navigate('login')}>{t('existing')}</button>
            <p className="welcome-foot">{t('foot')}</p>
          </div>
        </section>)}

      {view === 'login' && (<section className="scene light-scene active" aria-label={t('loginTag')}>
          {renderBar('welcome', 'exit', 'loginTag')}
          <div className="login-title"><div className="login-mark">O</div><h1>{t('back')}</h1>{tutorial && <p className="subtitle">{authClient ? accountCopy[language].persistent : t('authInfo')}</p>}</div>
          {authClient ? <AccountForm language={language} onRecovered={() => account.setRecovery(false)}/> : (<div className="form">
            <label className="field"><span>{t('email')}</span><span className="input"><span aria-hidden="true">✉</span><input autoComplete="off" disabled placeholder={t('pending')}/></span></label>
            <label className="field"><span>{t('pass')}</span><span className="input"><span aria-hidden="true">⌑</span><input type="password" autoComplete="off" disabled placeholder={t('noPass')}/></span></label>
            <div className="options"><span>{t('remember')}</span><span>{t('recover')}</span></div>
            <button type="button" className="disabled" disabled>{t('loginOff')}</button>
            <div className="divider">{t('or')}</div>
            {guestUiEnabled && <button type="button" className="gradient" onClick={() => navigate('workspace')}>{t('skip')}</button>}
            {tutorial && <div className="note" role="note">{t('authGuard')}</div>}
          </div>)}
          <div className="login-footer">{authClient ? '' : t('signup')}</div>
        </section>)}

      {view === 'workspace' && (signedIn || guestUiEnabled) && (<section className="scene light-scene active" aria-label={t('choose')}>
          <header className="bar workspace-header">{renderBrand('workBrand')}{languagePicker(true)}{signedIn && menu()}</header>
          <div className="workspace-title"><p className="orbis-account-id">{account.session?.user.user_metadata?.orbis_display_id}</p><span className="eyebrow l">{t('workBadge')}</span><h1>{t('hi')}</h1><p className="subtitle">{t('choose')}</p></div>
          <div className="welcome-panel"><strong>{t('panel')}</strong>{tutorial && <p>{t('panelDesc')}</p>}</div>
          <div className="modules">
            <button type="button" className="module" onClick={() => navigate('khata')}><span className="ic" aria-hidden="true">📘</span><span className="copy"><strong>{t('khata')}</strong><small>{t('khataDesc')}</small></span><span className="status">{t('open')}</span></button>
            {renderPlanned('🌱', 'farm', 'farm', 'farmDesc', 'later')}
            {renderPlanned('🎟️', 'lot', 'lot', 'lotDesc', 'soon')}
          </div>
          {!signedIn && <button type="button" className="exit" onClick={backToWelcome}>{t('exit')}</button>}

        </section>)}

      {view === 'profile' && signedIn && <section className="scene light-scene active profile-page" aria-label={t('settings')}>
        {renderBar('workspace', 'choose', 'settings')}
        <p className="orbis-account-id">{account.session?.user.user_metadata?.orbis_display_id}</p>
        <CommonAccountProfile key={account.session!.user.id} userId={account.session!.user.id} language={language}/>
        {tutorial && <p className="books-hint">{accountCopy[language].lock} — {accountCopy[language].lockInfo}</p>}
      </section>}

      {view === 'khata' && (signedIn || guestUiEnabled) && (<section className="scene light-scene active" aria-label={t('khata')}>
          {signedIn ? <header className="kh-app-header"><button className="kh-brand" type="button" onClick={() => setBooksPage('home')}><span className="kh-logo">O</span><span><small>ORBIS</small><strong>{t('khata')}</strong></span></button><div className="kh-header-actions">{languagePicker(true)}{menu()}<button type="button" className="kh-profile-button" onClick={() => navigate('workspace')} aria-label={t('choose')}>←</button></div></header> : renderBar('workspace', 'choose', 'khata')}
          {!signedIn && <div className="khata-title"><div className="bar"><span className="eyebrow l">{t('dashboard')}</span><span className="period">{t('month')}</span></div><h1>{t('khata')}</h1><p>{t('khataHead')}</p></div>}
          <CompanyGate key={account.session?.user.id ?? 'guest'} userId={account.session?.user.id} language={language} workspace={<div className="kh-workspace"><BookServicesContext.Provider value={liveBookServices}><DemoWorkspace userId={account.session?.user.id} language={language}/></BookServicesContext.Provider></div>}>
          <div className="metrics">
            {(['moneyIn', 'moneyOut', 'receive', 'pay'] as const).map((key) => <div className="metric" key={key}><span className="metric-label">{t(key)}</span><strong>—</strong><small>{t('emptyValue')}</small></div>)}
          </div>
          <div className="empty"><div className="big" aria-hidden="true">📒</div><h2>{t('emptyTitle')}</h2><p>{t('emptyDesc')}</p><span className="next">{t('next')}</span></div>
          <div className="actions-row">{(['sale', 'purchase', 'receipt', 'payment'] as const).map((key) => <button type="button" className="action-chip" disabled key={key}>{t(key)}</button>)}</div>
          {tutorial && <p className="screen-foot">{t('noFake')}</p>}
          </CompanyGate>
        </section>)}
    </main></TutorialContext.Provider></BooksNavigation.Provider>);
}
export default App;
