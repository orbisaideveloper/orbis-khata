import type { Language } from '../i18n';
import type { PartyStatement } from './statement';
import { shareCopy, type ShareText } from './copy';
function money(value: string) { const amount = BigInt(value), absolute = amount < 0n ? -amount : amount; return `${amount < 0n ? '−' : ''}₹${(absolute / 100n).toLocaleString('en-IN')}.${String(absolute % 100n).padStart(2, '0')}`; }
export function StatementView({ statement, language, busy, offset, onPage }: Readonly<{
    statement: PartyStatement;
    language: Language;
    busy: boolean;
    offset: number;
    onPage: (page: number) => void;
}>) {
    const t = (key: ShareText) => shareCopy(language, key);
    return <section className="customer-statement" aria-label={t('open')}>
        <header className="statement-heading"><small>{t('statement')}</small><h2>{statement.source} · {t(statement.sourceRole === 'Stockist' ? 'stockist' : 'customer')}</h2><p>{statement.party} · {statement.from} — {statement.to}</p><small>{t(statement.direction)}</small></header>
        <dl className="customer-balances"><div><dt>{t('opening')}</dt><dd>{money(statement.opening)}</dd></div><div><dt>{t('balance')}</dt><dd>{money(statement.balance)}</dd></div></dl>
        <p className="customer-scroll-hint">{t('scrollHint')}</p>
        <section className="customer-table" aria-label={t('entries')}><table>
            <caption>{t('entries')} · {statement.total}</caption>
            <thead><tr>{(['serial', 'date', 'dispatch', 'unsold', 'netQuantity', 'rate', 'commission', 'tds', 'bill', 'payment', 'running'] as const).map(key => <th scope="col" key={key}>{t(key)}</th>)}</tr></thead>
            <tbody>{statement.rows.map((row, index) => <tr key={row.id}>
                <td>{offset + index + 1}</td><th scope="row">{row.date}<small>{row.reference}</small><span className="statement-kind">{t(row.kind)}</span></th>
                <td>{row.quantity ?? '—'}</td><td>{row.quantity === undefined ? '—' : row.returned ?? '0'}</td><td>{row.netQuantity ?? '—'}</td>
                <td>{row.rate === undefined ? '—' : money(row.rate)}</td><td>{row.commission === undefined ? '—' : money(row.commission)}</td><td>{row.tds === undefined ? '—' : money(row.tds)}</td>
                <td>{row.kind === 'payment' ? '—' : money(row.business)}</td><td>{row.kind === 'payment' ? <>{money(row.money)}{row.split && <small>{t('split')}: {['cashPaise', 'bankPaise', 'pwtPaise', 'upiPaise', 'chequePaise'].map(key => money(row.split![key] ?? '0')).join(' / ')}</small>}</> : '—'}</td><td className="statement-running">{money(row.balance)}</td>
            </tr>)}</tbody>
        </table></section>
        {!statement.rows.length && <p className="customer-empty">{t('noRows')}</p>}
        <div className="customer-actions statement-pagination"><button type="button" disabled={busy || offset === 0} onClick={() => onPage(Math.max(0, offset - 100))}>{t('previous')}</button><button type="button" disabled={busy || statement.next === null} onClick={() => {
            if (statement.next !== null) onPage(statement.next);
        }}>{t('next')}</button></div>
    </section>;
}
