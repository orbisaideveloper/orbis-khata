import { overviewAmount, type OverviewKind } from '../accounting/overview-model';
import type { ExpenseReport } from '../accounting/expense-model';
import { inLanguage } from '../localize';
import type { Language } from '../i18n';
import { money, type Report, type Kind } from '../accounting/model';
import { designCopy } from './design-copy';
import { DesignIcon, type DesignIconName } from './DesignIcon';
import type { BooksPage } from '../books-navigation';
import type { BillKind } from './InvoicePage';
const pageForModule: Record<string, BooksPage> = { accounts: 'ledger', ledger: 'all-ledgers' };
const iconForEntry: Partial<Record<Kind, DesignIconName>> = { sale: 'sale', purchase: 'purchase' };
export function Dashboard({ language, companyName, report, failed, onRetry, onOpen, onBill, partyCount, itemCount, expenses, onOverview, periodLabel }: Readonly<{
    language: Language;
    companyName: string;
    report: Report | null;
    failed: boolean;
    onRetry: () => void;
    onOpen: (page: BooksPage) => void;
    onBill: (kind: BillKind) => void;
    partyCount: number;
    itemCount: number;
    expenses: ExpenseReport;
    onOverview: (kind: OverviewKind) => void;
    periodLabel?: string;
}>) {
    const t = designCopy[language];
    const metrics = [['receivable', t.receive], ['payable', t.pay], ['cash', t.cash], ['bank', t.bank], ['expenses', t.expense]] as const;
    return <div className="kh-dashboard"><section className="kh-greeting"><span className="kh-eyebrow">{t.hello}</span><h1>{companyName}</h1><p>{t.headline}</p><span className="kh-greeting-mark" aria-hidden="true"><DesignIcon name="ledger"/></span></section>
 <div className="kh-section-heading"><h2>{t.overview}</h2><span>{periodLabel ?? t.period}</span><button className="overview-refresh" type="button" onClick={onRetry}>{inLanguage(language,'হালনাগাদ','ताज़ा करें','Refresh balances')}</button></div>
 {failed && <output role="alert">{t.error} <button type="button" onClick={onRetry}>{t.retry}</button></output>}
 {!failed && !report && <output>{t.loading}</output>}
 {!failed && report && <div className="kh-metrics">{metrics.map(([account, label]) => <button type="button" aria-label={account === 'expenses' ? inLanguage(language, 'খরচের বিস্তারিত', 'खर्च का विवरण', 'Expense details') : label} onClick={() => onOverview(account)} key={account} className={'kh-metric kh-metric-' + account}><span>{label}</span><strong>{money(overviewAmount(report, expenses, account))}</strong><span className="overview-card-arrow" aria-hidden="true">›</span></button>)}</div>}
 <div className="kh-section-heading"><h2>{t.actions}</h2></div><div className="kh-quick-actions">{(['sale', 'purchase', 'expense'] as const).map(kind => <button type="button" key={kind} onClick={() => onBill(kind)}><span><DesignIcon name={kind}/></span>{t[kind]}</button>)}</div>
 <div className="kh-section-heading"><h2>{t.manage}</h2></div><div className="kh-module-grid">{(['parties', 'items', 'ledger', 'stock', 'accounts', 'bills'] as const).map(key => <button type="button" key={key} onClick={() => onOpen(pageForModule[key] ?? key as BooksPage)}><span className={'kh-module-icon kh-module-' + key}><DesignIcon name={key}/></span><span>{t[key]}{key === 'parties' && <small>{partyCount}</small>}{key === 'items' && <small>{itemCount}</small>}</span><span aria-hidden="true">›</span></button>)}</div>
 <div className="kh-section-heading"><h2>{t.recent}</h2></div><section className="kh-recent">{!report?.entries.length ? <div className="kh-empty"><DesignIcon name="bills"/><strong>{t.empty}</strong><p>{t.start}</p></div> : report.entries.slice(0, 4).map(entry => <article key={entry.id}><span className="kh-list-icon"><DesignIcon name={iconForEntry[entry.kind] ?? 'accounts'}/></span><div><strong>{entry.party_name}</strong><small>{entry.effective_date} · {entry.reference}</small></div><strong>{money(entry.amount_minor)}</strong></article>)}</section>
 </div>;
}
