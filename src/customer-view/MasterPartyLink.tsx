import type { Language } from '../i18n';
import { shareCopy, type ShareText } from './copy';
import type { MasterLink } from './useMasterPartyLink';
import './customer-view.css';
export function MasterPartyLink({ link, language }: Readonly<{
    link: MasterLink;
    language: Language;
}>) {
    const t = (key: ShareText) => shareCopy(language, key);
    return <fieldset className="master-party-link"><legend>{t('masterLink')}</legend>
 <p>{t('masterHint')}</p>
 {link.active.map(item => <div className="master-link-row" key={item.id}><span><strong>{item.recipient}</strong><small>{t(item.status)}</small></span><button type="button" disabled={link.busy} onClick={() => link.setConfirm(item)}>{t('remove')}</button></div>)}
 {!link.active.length && <label>{t('recipient')}<input aria-invalid={!link.valid} value={link.draft} disabled={!link.ready || link.busy} maxLength={14} pattern="ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}" placeholder="ORB-U-…" onChange={event => link.setDraft(event.target.value.toUpperCase().trim())}/></label>}
 {!link.ready && !link.error && <output>{t('busy')}</output>}
 {link.error && <p role="alert">{t('masterError')}</p>}
 {link.confirm && <div role="alertdialog" aria-label={t('confirm')}><p>{t('confirm')}</p><button type="button" disabled={link.busy} onClick={() => void link.revoke()}>{t('remove')}</button><button type="button" onClick={() => link.setConfirm(null)}>{t('cancel')}</button></div>}
 </fieldset>;
}
