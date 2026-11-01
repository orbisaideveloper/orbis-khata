import { useEffect, useRef, useState } from 'react';
import type { Language } from '../i18n';
import { requestKhata } from '../accounting/api';
import { displayIdentity, type Share, type ShareCommand } from './contract';
import { shareCopy, type ShareText } from './copy';
import type { PartyStatement } from './statement';
import './customer-view.css';
import { StatementView } from './StatementView';
import { ShareList } from './ShareList';
type Choice = {
    organizationId: string;
    organization: string;
    partyId: string;
    party: string;
    partyType: string;
};
const request = <T,>(command: ShareCommand) => requestKhata<T>('party-sharing', command);
export default function CustomerView({ language, onBack, onBooks }: Readonly<{
    language: Language;
    onBack: () => void;
    onBooks: () => void;
}>) {
    const t = (key: ShareText) => shareCopy(language, key);
    const [links, setLinks] = useState<Share[]>([]), [choices, setChoices] = useState<Choice[] | null>(null), [selected, setSelected] = useState(''), [recipient, setRecipient] = useState('');
    const [statement, setStatement] = useState<PartyStatement | null>(null), [active, setActive] = useState<string | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState(false), [sent, setSent] = useState(false), [remove, setRemove] = useState<Share | null>(null);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const [from, setFrom] = useState(today.slice(0, 7) + '-01'), [to, setTo] = useState(today), [offset, setOffset] = useState(0);
    const revision = useRef(0), pending = useRef(false), invitation = useRef<{
        signature: string;
        id: string;
    } | null>(null);
    async function perform(action: () => Promise<void>) {
        if (pending.current) {
            return;
        }
        pending.current = true;
        setBusy(true);
        setError(false);
        const version = revision.current;
        try {
            await action();
        }
        catch {
            if (version === revision.current) {
                setError(true);
                setStatement(null);
            }
        }
        finally {
            if (version === revision.current) {
                pending.current = false;
                setBusy(false);
            }
        }
    }
    async function load() {
        const version = revision.current;
        const rows = await request<Share[]>({ action: 'list' });
        if (version === revision.current) {
            setLinks(rows);
        }
    }
    useEffect(() => {
        const version = ++revision.current;
        pending.current = true;
        void request<Share[]>({ action: 'list' }).then(rows => {
            if (version === revision.current) {
                setLinks(rows);
            }
        }, () => {
            if (version === revision.current) {
                setError(true);
            }
        }).finally(() => {
            if (version === revision.current) {
                pending.current = false;
                setBusy(false);
            }
        });
        return () => { revision.current = version + 1; };
    }, []);
    async function command(link: Share, action: 'accept' | 'decline' | 'revoke') { await request({ action, id: link.id }); setStatement(null); setActive(null); setRemove(null); await load(); }
    async function open(id: string, page = 0) {
        setStatement(null);
        setActive(id);
        const version = revision.current;
        const result = await request<PartyStatement>({ action: 'statement', id, from, to, offset: page });
        if (version === revision.current) {
            setOffset(page);
            setStatement(result);
        }
    }
    async function invite() {
        const choice = choices?.find(row => row.partyId === selected);
        if (!choice || !displayIdentity.test(recipient)) {
            return;
        }
        const signature = JSON.stringify([choice.organizationId, choice.partyId, recipient]);
        if (invitation.current?.signature !== signature) {
            invitation.current = { signature, id: crypto.randomUUID() };
        }
        await request({ action: 'invite', id: invitation.current.id, organization: choice.organizationId, party: choice.partyId, recipient });
        invitation.current = null;
        setSent(true);
        setChoices(null);
        setRecipient('');
        await load();
    }
    return <section className="scene light-scene active customer-view" aria-label={t('title')}><header className="customer-heading"><button type="button" onClick={onBack}>{t('back')}</button><h1>{t('title')}</h1><button type="button" disabled={busy} onClick={() => void perform(async () => { setStatement(null); setActive(null); await load(); })}>{t('refresh')}</button></header><p>{t('readonly')}</p><div className="customer-actions"><button type="button" onClick={onBooks}>{t('own')}</button><button type="button" disabled={busy} onClick={() => void perform(async () => { const rows = await request<Choice[]>({ action: 'choices' }); setChoices(rows); setSent(false); })}>{t('link')}</button></div>{busy && <output>{t('busy')}</output>}{error && <p role="alert">{t('error')}</p>}{sent && <output>{t('sent')}</output>}
 {choices && <form onSubmit={event => { event.preventDefault(); void perform(invite); }}><label>{t('choose')}<select required value={selected} onChange={event => setSelected(event.target.value)}><option value="">{t('choose')}</option>{choices.map(row => <option key={row.partyId} value={row.partyId}>{row.organization} · {row.party} ({row.partyType})</option>)}</select></label><label>{t('recipient')}<input required value={recipient} maxLength={14} pattern="ORB-U-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}" placeholder="ORB-U-…" onChange={event => setRecipient(event.target.value.toUpperCase().trim())}/></label><p>{t('identityHint')}</p><button type="submit" disabled={busy || !selected || !displayIdentity.test(recipient)}>{t('invite')}</button><button type="button" onClick={() => setChoices(null)}>{t('cancel')}</button></form>}
 {remove && <section role="alertdialog" aria-label={t('confirm')}><p>{t('confirm')}</p><button type="button" disabled={busy} onClick={() => void perform(() => command(remove, remove.outgoing ? 'revoke' : 'decline'))}>{t('remove')}</button><button type="button" onClick={() => setRemove(null)}>{t('cancel')}</button></section>}
 {!links.length && !busy && <p>{t('empty')}</p>}{[false, true].map(outgoing => <ShareList key={String(outgoing)} links={links} outgoing={outgoing} busy={busy} language={language} onCommand={(link, action) => void perform(() => command(link, action))} onOpen={id => void perform(() => open(id))} onRemove={setRemove}/>)}
 {active && <form className="customer-period" onSubmit={event => { event.preventDefault(); void perform(() => open(active)); }}><label>{t('from')}<input type="date" required value={from} max={to} onChange={event => { setStatement(null); setFrom(event.target.value); }}/></label><label>{t('to')}<input type="date" required value={to} min={from} onChange={event => { setStatement(null); setTo(event.target.value); }}/></label><button type="submit" disabled={busy}>{t('apply')}</button></form>}
 {statement && <StatementView statement={statement} language={language} busy={busy} offset={offset} onPage={page => void perform(() => open(active!, page))}/>}
 </section>;
}
