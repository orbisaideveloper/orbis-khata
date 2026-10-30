import type {ReactNode} from 'react';
import {inLanguage} from './localize';
import { booksLabels, type BooksPage } from './books-navigation';
import type { Language } from './i18n';
const copy = {
    bn: { menu: 'আরও বিকল্প', profile: 'অ্যাকাউন্ট ও প্রোফাইল', tutorial: 'টিউটোরিয়াল', logout: 'লগআউট' },
    en: { menu: 'More options', profile: 'Account & profile', tutorial: 'Tutorial', logout: 'Log out' },
    hi: { menu: 'अन्य विकल्प', profile: 'अकाउंट और प्रोफ़ाइल', tutorial: 'ट्यूटोरियल', logout: 'लॉग आउट' },
};
export function WorkspaceMenu({ language, tutorial, onTutorial, onProfile, onLogout, signedIn, onBooks, demo = false, enhanced = false, settings, actions }: Readonly<{
    settings?:ReactNode;
    actions?:ReactNode;
    language: Language;
    tutorial: boolean;
    onTutorial: (enabled: boolean) => void;
    demo?: boolean;
    enhanced?: boolean;
    onBooks?: (page: BooksPage) => void;
    onProfile: () => void;
    onLogout: () => void;
    signedIn: boolean;
}>) {
    const t = copy[language];
    return <details className="workspace-menu">
    <summary aria-label={t.menu}>⋮</summary>
    <div className="workspace-menu-panel">
      {signedIn && onBooks && ([...((demo || enhanced) ? ['home' as const] : []), 'ledger', 'all-ledgers', 'parties', 'items', ...((demo || enhanced) ? ['bills' as const] : []), 'expenses', 'reports', 'company', 'settings', 'themes'] as const).map(page => <button type="button" key={page} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onBooks(page); }}>{booksLabels[language][page]}</button>)}
      {signedIn && <button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onProfile(); }}>{t.profile}</button>}
      {actions}
      {settings&&<details className="workspace-settings"><summary>{inLanguage(language,'সেটিংস','सेटिंग्स','Settings')}</summary><div>{settings}</div></details>}
      <label className="tutorial-menu-row"><span>{t.tutorial}</span><input type="checkbox" checked={tutorial} onChange={event => onTutorial(event.target.checked)}/></label>
      {!demo && <button type="button" onClick={onLogout}>{t.logout}</button>}
    </div>
  </details>;
}
