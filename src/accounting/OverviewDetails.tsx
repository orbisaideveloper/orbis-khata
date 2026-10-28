import { AccountBreakdown, type AccountRow } from './AccountBreakdown';
import { useEffect, useState } from 'react';
import type { Language } from '../i18n';
import { inLanguage } from '../localize';
import { useBookServices } from '../books-services';
import { requestKhata } from './api';
import { demoRequest } from '../demo/store';
import { balance, money, type Report } from './model';
import type { ExpenseReport } from './expense-model';
import { allPages } from './report-pages';
import { dueRows, moneyRows, overviewAmount, type OverviewKind } from './overview-model';
import { LedgerExplorer, type LedgerEntity } from './LedgerExplorer';
import { accountingCopy } from './copy';
export function OverviewDetails({ company, language, from, to, version, report, expenses, kind, title, onBack }: Readonly<{
    company: string;
    language: Language;
    from: string;
    to: string;
    version: number;
    report: Report;
    expenses: ExpenseReport;
    kind: OverviewKind;
    title: string;
    onBack: () => void;
}>) {
    const services = useBookServices(), request = services?.request ?? (import.meta.env.DEV ? demoRequest : requestKhata);
    const [account, setAccount] = useState<AccountRow | null>(null);
    const a = accountingCopy[language], [selected, setSelected] = useState<LedgerEntity | null>(null);
    const [snapshot, setSnapshot] = useState<{
        query: string;
        report: Report;
        expenses: ExpenseReport;
    } | null>(null), [failure, setFailure] = useState(''), [retry, setRetry] = useState(0);
    const query = JSON.stringify([company, from, to, version, retry]);
    const loaded = snapshot?.query === query ? snapshot : null, failed = failure === query;
    const cash = kind === 'cash' || kind === 'bank';
    useEffect(() => {
        if (!cash) {
            return;
        }
        let alive = true;
        void Promise.all([
            allPages(report, 'entries', offset => request<Report>('report', { company, from, to, party: null, offset })),
            allPages(expenses, 'entries', offset => request<ExpenseReport>('expense-report', { company, from, to, offset })),
        ]).then(([r, e]) => {
            if (alive) {
                setSnapshot({ query, report: r, expenses: e });
            }
        }, () => {
            if (alive) {
                setFailure(query);
            }
        });
        return () => { alive = false; };
    }, [cash, company, from, to, report, expenses, request, query]);
    if (selected) {
        return <LedgerExplorer {...{ company, language, from, to, version }} parties={report.parties} initialSelection={selected} onBack={() => setSelected(null)}/>;
    }
    const rows = kind === 'receivable' || kind === 'payable' ? dueRows(report, expenses, kind) : expenses.categories.filter(c => BigInt(c.amount) !== 0n).map(c => ({ id: 'category:' + c.name, name: c.name, type: 'expense' as const, category: c.name, amount: c.amount }));
    const allMovements = cash && loaded ? moneyRows(loaded.report, loaded.expenses, kind) : [];
    const movements = account ? allMovements.filter(row => row.id.startsWith('trade:') ? account.entry_ids.includes(row.id.slice(6)) : account.id === kind) : allMovements;
    const back = inLanguage(language, 'হোমে ফিরুন', 'होम पर लौटें', 'Back to home');
    return <section className="books-card overview-details" aria-label={title}>
    <button className="overview-back" type="button" onClick={onBack}>← {back}</button>
    <div className="overview-heading"><h2>{title}</h2><strong>{money(overviewAmount(report, expenses, kind))}</strong></div>
    <p className="books-hint">{kind === 'receivable' || kind === 'payable' ? inLanguage(language, 'এই তারিখ পর্যন্ত বাকি: ', 'इस तारीख तक बकाया: ', 'Outstanding as of: ') + to : from + ' — ' + to}</p>
    {!cash && <><p className="books-hint">{inLanguage(language, 'বিস্তারিত দেখতে নামের উপর চাপুন', 'विवरण के लिए नाम दबाएँ', 'Select a name to view its ledger')}</p>{!rows.length && <p>{a.empty}</p>}{rows.map(row => <button className="overview-ledger-row" type="button" key={row.id} onClick={() => setSelected(row)}><span>{row.name}</span><strong>{money(row.amount)}</strong><span aria-hidden="true">›</span></button>)}</>}
    {cash && <><AccountBreakdown key={query} company={company} language={language} kind={kind} from={from} to={to} onSelect={setAccount}/><div className="overview-opening"><span>{a.opening}: {money(balance(report, kind, 'opening'))}</span><span>{inLanguage(language, 'শেষ ব্যালেন্স', 'अंतिम बैलेंस', 'Closing balance')}: {money(balance(report, kind))}</span></div>{failed && <output role="alert">{a.error} <button type="button" onClick={() => setRetry(n => n + 1)}>{a.retry}</button></output>}{!failed && !loaded && <output>{a.loading}</output>}{loaded && !movements.length && <p>{a.empty}</p>}{loaded && movements.length > 0 && <div className="overview-transactions"><table><thead><tr><th>{a.date}</th><th>{inLanguage(language, 'নাম / বিবরণ', 'नाम / विवरण', 'Name / description')}</th><th>{inLanguage(language, 'জমা', 'जमा', 'Money in')}</th><th>{inLanguage(language, 'পরিশোধ', 'भुगतान', 'Money out')}</th></tr></thead><tbody>{movements.map(row => <tr key={row.id}><td>{row.date}</td><td><button className="overview-party-link" type="button" onClick={() => setSelected(row.ledger)}>{row.name}</button><small>{row.reference}</small></td><td>{BigInt(row.amount) > 0n ? money(row.amount) : '—'}</td><td>{BigInt(row.amount) < 0n ? money(-BigInt(row.amount)) : '—'}</td></tr>)}</tbody></table></div>}</>}
  </section>;
}
