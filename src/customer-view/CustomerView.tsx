import { useEffect, useRef, useState } from 'react';
import type { Language } from '../i18n';
import { requestKhata } from '../accounting/api';
import type { Share, ShareCommand } from './contract';
import { shareCopy, type ShareText } from './copy';
import type { PartyStatement } from './statement';
import { StatementView } from './StatementView';
import { ShareList } from './ShareList';
import './customer-view.css';
const request = <T,>(command: ShareCommand) => requestKhata<T>('party-sharing', command);
export default function CustomerView({ language, onBack, onBooks }: Readonly<{
    language: Language;
    onBack: () => void;
    onBooks: () => void;
}>) {
    const t = (key: ShareText) => shareCopy(language, key);
    const [links, setLinks] = useState<Share[]>([]), [statement, setStatement] = useState<PartyStatement | null>(null), [active, setActive] = useState<string | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState(false), [remove, setRemove] = useState<Share | null>(null);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const recent = new Date(today + 'T00:00:00Z');
    recent.setUTCDate(recent.getUTCDate() - 29);
    const recentFrom = recent.toISOString().slice(0, 10);
    const [from, setFrom] = useState(recentFrom), [to, setTo] = useState(today), [offset, setOffset] = useState(0);
    const [checkedAt, setCheckedAt] = useState<Date | null>(null);
    const revision = useRef(0), pending = useRef(false);
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
                setCheckedAt(null);
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
            setLinks(rows.filter(row => !row.outgoing));
        }
        return rows;
    }
    useEffect(() => {
        const version = ++revision.current;
        pending.current = true;
        void request<Share[]>({ action: 'list' }).then(rows => {
            if (version === revision.current) {
                setLinks(rows.filter(row => !row.outgoing));
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
    async function command(link: Share, action: 'accept' | 'decline') {
        await request({ action, id: link.id });
        setStatement(null);
        setActive(null);
        setRemove(null);
        await load();
    }
    async function open(id: string, page = 0) {
        setStatement(null);
        setCheckedAt(null);
        setActive(id);
        const version = revision.current;
        const result = await request<PartyStatement>({ action: 'statement', id, from, to, offset: page });
        if (version === revision.current) {
            setOffset(page);
            setStatement(result);
            setCheckedAt(new Date());
        }
    }
    function closeStatement() {
        setStatement(null);
        setActive(null);
        setCheckedAt(null);
    }
    async function refresh() {
        const version = revision.current;
        setStatement(null);
        setCheckedAt(null);
        const rows = await load();
        if (version !== revision.current) return;
        if (active) {
            if (rows.some(row => row.id === active && !row.outgoing && row.status === 'accepted')) {
                await open(active);
            } else {
                closeStatement();
            }
        }
    }
    function changePeriod(start: string, end: string) {
        setFrom(start);
        setTo(end);
        setStatement(null);
        setCheckedAt(null);
    }
    function previousMonth() {
        const last = new Date(today.slice(0, 7) + '-01T00:00:00Z');
        last.setUTCDate(0);
        const end = last.toISOString().slice(0, 10);
        changePeriod(end.slice(0, 7) + '-01', end);
    }
    return <section className="scene light-scene active customer-view" aria-label={t('title')}>
 <header className="customer-heading"><button type="button" onClick={active ? closeStatement : onBack}>{t('back')}</button><h1>{t('title')}</h1><button type="button" disabled={busy} onClick={() => void perform(refresh)}>{t('refresh')}</button></header>
 <div className="customer-intro"><strong>{t('readonlyTitle')}</strong><p>{t('readonly')}</p></div>
 {busy && <output>{t('busy')}</output>}{error && <p role="alert">{t('error')}</p>}
 {!links.length && !busy && <p className="customer-empty">{t('empty')}</p>}
 {!active && <ShareList links={links} outgoing={false} busy={busy} language={language} onCommand={(link, action) => void perform(() => command(link, action))} onOpen={id => void perform(() => open(id))} onRemove={setRemove}/>}
 {remove && <section role="alertdialog" aria-label={t('confirm')}><p>{t('confirm')}</p><button type="button" disabled={busy} onClick={() => void perform(() => command(remove, 'decline'))}>{t('remove')}</button><button type="button" onClick={() => setRemove(null)}>{t('cancel')}</button></section>}
 {active && <form className="customer-period" onSubmit={event => { event.preventDefault(); void perform(() => open(active)); }}>
 <div className="customer-period-presets"><button type="button" disabled={busy} onClick={() => changePeriod(recentFrom, today)}>{t('last30')}</button><button type="button" disabled={busy} onClick={() => changePeriod(today.slice(0, 7) + '-01', today)}>{t('thisMonth')}</button><button type="button" disabled={busy} onClick={previousMonth}>{t('previousMonth')}</button></div>
 <label>{t('from')}<input type="date" required disabled={busy} value={from} max={to} onChange={event => changePeriod(event.target.value, to)}/></label><label>{t('to')}<input type="date" required disabled={busy} value={to} min={from} onChange={event => changePeriod(from, event.target.value)}/></label><button type="submit" disabled={busy}>{t('apply')}</button><small>{t('periodHint')}</small></form>}
 {statement && <><p className="customer-checked">{t('checked')}: {checkedAt?.toLocaleString({bn:'bn-IN',hi:'hi-IN',en:'en-IN'}[language], {timeZone:'Asia/Kolkata'})} IST · {t('refreshHint')}</p><StatementView statement={statement} language={language} busy={busy} offset={offset} onPage={page => void perform(() => open(active!, page))}/></>}
 <footer className="customer-own-books"><p>{t('ownHint')}</p><button type="button" onClick={onBooks}>{t('own')}</button></footer>
 </section>;
}
