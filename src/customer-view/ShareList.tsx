import type { Language } from '../i18n';
import type { Share } from './contract';
import { shareCopy, type ShareText } from './copy';
export function ShareList({ links, outgoing, busy, language, onCommand, onOpen, onRemove }: Readonly<{
    links: Share[];
    outgoing: boolean;
    busy: boolean;
    language: Language;
    onCommand: (link: Share, action: "accept" | "decline") => void;
    onOpen: (id: string) => void;
    onRemove: (link: Share) => void;
}>) { const t = (key: ShareText) => shareCopy(language, key); return <section><h2>{t(outgoing ? 'outgoing' : 'incoming')}</h2>{links.filter(row => row.outgoing === outgoing).map(link => <article className="customer-link" key={link.id}><strong>{link.organization} · {link.party}</strong><small>{link.recipient} · {t(link.status)}</small><div className="customer-actions">{!outgoing && link.status === 'pending' && <><button disabled={busy} onClick={() => onCommand(link, 'accept')}>{t('accept')}</button><button disabled={busy} onClick={() => onCommand(link, 'decline')}>{t('decline')}</button></>}{!outgoing && link.status === 'accepted' && <button disabled={busy} onClick={() => onOpen(link.id)}>{t('open')}</button>}{(link.status === 'accepted' || outgoing && link.status === 'pending') && <button disabled={busy} onClick={() => onRemove(link)}>{t('remove')}</button>}</div></article>)}</section>; }
