import type { Language } from './i18n'
const copy = {
  bn:{menu:'আরও বিকল্প',profile:'অ্যাকাউন্ট ও প্রোফাইল',tutorial:'টিউটোরিয়াল',logout:'লগআউট'},
  en:{menu:'More options',profile:'Account & profile',tutorial:'Tutorial',logout:'Log out'},
  hi:{menu:'अन्य विकल्प',profile:'अकाउंट और प्रोफ़ाइल',tutorial:'ट्यूटोरियल',logout:'लॉग आउट'},
}
export function WorkspaceMenu({language,tutorial,onTutorial,onProfile,onLogout,signedIn}: Readonly<{
  language: Language; tutorial: boolean; onTutorial:(enabled:boolean)=>void;
  onProfile:()=>void; onLogout:()=>void; signedIn:boolean
}>) {
  const t=copy[language]
  return <details className="workspace-menu">
    <summary aria-label={t.menu}>⋮</summary>
    <div className="workspace-menu-panel">
      {signedIn && <button type="button" onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');onProfile()}}>{t.profile}</button>}
      <label><input type="checkbox" checked={tutorial} onChange={event=>onTutorial(event.target.checked)}/>{t.tutorial}</label>
      <button type="button" onClick={onLogout}>{t.logout}</button>
    </div>
  </details>
}
