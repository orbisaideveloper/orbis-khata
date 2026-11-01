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
    return <section aria-label={t('open')}><h2>{statement.source} · {t(statement.sourceRole === 'Stockist' ? 'stockist' : 'customer')}</h2><p>{statement.party} · {statement.from} — {statement.to}</p><p>{t(statement.direction)}</p><dl className="customer-balances"><div><dt>{t('opening')}</dt><dd>{money(statement.opening)}</dd></div><div><dt>{t('balance')}</dt><dd>{money(statement.balance)}</dd></div></dl><div className="customer-table"><table><thead><tr><th>{t('date')}</th><th>{t('details')}</th><th>{t('amount')}</th><th>{t('running')}</th></tr></thead><tbody>{statement.rows.map(row => <tr key={row.id}><td>{row.date}<small>{row.reference}</small></td><td>{t(row.kind)}{row.quantity !== undefined && <small>{t('quantity')}: {row.quantity} / {row.returned ?? '0'}</small>}{row.netQuantity !== undefined && <small>{t('netQuantity')}: {row.netQuantity}</small>}{row.gross && <small>{t('gross')}: {money(row.gross)}</small>}{row.rate && <small>{t('rate')}: {money(row.rate)}</small>}{row.commission && <small>{t('commission')}: {money(row.commission)} · {t('tds')}: {money(row.tds ?? '0')}</small>}{row.split && <small>{t('split')}: {['cashPaise', 'bankPaise', 'pwtPaise', 'upiPaise', 'chequePaise'].map(key => money(row.split![key] ?? '0')).join(' / ')}</small>}</td><td>{money(row.kind === 'payment' ? row.money : row.business)}</td><td>{money(row.balance)}</td></tr>)}</tbody></table></div>{!statement.rows.length && <p>{t('noRows')}</p>}<div className="customer-actions"><button disabled={busy || offset === 0} onClick={() => onPage(Math.max(0, offset - 100))}>{t('previous')}</button><button disabled={busy || statement.next === null} onClick={() => {
            if (statement.next !== null) {
                onPage(statement.next);
            }
        }}>{t('next')}</button></div></section>;
}
