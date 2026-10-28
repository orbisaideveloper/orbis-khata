import { PaymentEntry } from '../accounting/PaymentEntry';
import { WorkspaceSettings } from '../accounting/WorkspaceSettings';
import { DateRange } from '../accounting/DateRange';
import { OverviewDetails } from '../accounting/OverviewDetails';
import type { OverviewKind } from '../accounting/overview-model';
import type { ExpenseReport } from '../accounting/expense-model';
import { inLanguage } from '../localize';
import { requestKhata } from '../accounting/api';
import { useBookServices, type BookServices } from '../books-services';
import type { DemoItem, DemoParty } from './master-model';
import { Dashboard } from './Dashboard';
import { designCopy } from './design-copy';
import { useEffect, useState } from 'react';
import type { Language } from '../i18n';
import { useBooksNavigation, booksLabels } from '../books-navigation';
import { Accounting } from '../accounting/Accounting';
import { Expenses } from '../accounting/Expenses';
import { LedgerExplorer } from '../accounting/LedgerExplorer';
import type { Report } from '../accounting/model';
import { today } from '../accounting/model';
import { Inventory } from '../inventory/Inventory';
import { demoMasters, demoRequest, demoCompanyName } from './store';
import { ItemMaster, PartyMaster } from './Masters';
import { InvoicePage, type BillKind } from './InvoicePage';
const overviewLabels = { receivable: 'receive', payable: 'pay', cash: 'cash', bank: 'bank', expenses: 'expense' } as const;
const types = { bn: { sale: 'বিক্রয় বিল', purchase: 'ক্রয় বিল', expense: 'খরচের বিল', bills: 'বিল', stock: 'গোডাউন ও স্টক' }, en: { sale: 'Sales invoice', purchase: 'Purchase invoice', expense: 'Expense bill', bills: 'Bills', stock: 'Godown & stock' }, hi: { sale: 'बिक्री बिल', purchase: 'खरीद बिल', expense: 'खर्च बिल', bills: 'बिल', stock: 'गोदाम और स्टॉक' } };
type MasterSnapshot = {
    company: string;
    items: DemoItem[];
    parties: DemoParty[];
};
const fallbackRequest = import.meta.env.DEV ? demoRequest : requestKhata;
function workspaceMasters(services: BookServices | null, snapshot: MasterSnapshot, company: string) {
    if (services) {
        if (snapshot.company === company) {
            return snapshot;
        }
        return { items: [], parties: [] };
    }
    if (import.meta.env.DEV) {
        return demoMasters(company);
    }
    return { items: [], parties: [] };
}
function workspaceName(services: BookServices | null, companies: {
    id: string;
    name: string;
}[], company: string) {
    if (services) {
        return companies.find(c => c.id === company)?.name ?? '';
    }
    if (import.meta.env.DEV) {
        return demoCompanyName(company);
    }
    return '';
}
export function DemoWorkspace({ language, userId = 'demo-owner' }: Readonly<{
    language: Language;
    userId?: string;
}>) {
    const services = useBookServices(), request = services?.request ?? fallbackRequest;
    const [liveMasters, setLiveMasters] = useState<{
        company: string;
        items: DemoItem[];
        parties: DemoParty[];
    }>({ company: '', items: [], parties: [] });
    const navigation = useBooksNavigation(), t = types[language], labels = booksLabels[language];
    const [company, setCompany] = useState(services ? '' : '11111111-1111-4111-8111-111111111111'), [companies, setCompanies] = useState<{
        id: string;
        name: string;
    }[]>([]), [version, setVersion] = useState(0);
    const [from, setFrom] = useState(() => today().slice(0, 7) + '-01'), [to, setTo] = useState(today), [bill, setBill] = useState<BillKind | null>(null), [billKey, setBillKey] = useState(0);
    const [result, setResult] = useState<{
        key: string;
        report: Report;
        expenses: ExpenseReport;
        warehouses: {
            id: string;
            name: string;
        }[];
    } | null>(null), [errorKey, setErrorKey] = useState('');
    const requestKey = [company, from, to, version].join('/');
    const report = result?.key === requestKey ? result.report : null, warehouses = result?.key === requestKey ? result.warehouses : [], failed = errorKey === requestKey;
    const [overview, setOverview] = useState<{ company: string; kind: OverviewKind } | null>(null);
    const showingOverview = navigation.page === 'overview' && overview !== null && overview.company === company;
    function closeOverview() { setOverview(null); navigation.open('home'); }
    const [locked, setLocked] = useState(false);
    const changed = () => setVersion(n => n + 1);
    useEffect(() => {
        let alive = true;
        void request<{
            id: string;
            name: string;
        }[]>('companies', {}).then(list => {
            if (alive) {
                setCompanies(list);
                setCompany(old => list.some(c => c.id === old) ? old : list[0]?.id ?? '');
            }
        }, () => {
            if (alive) {
                setErrorKey(requestKey);
            }
        });
        return () => { alive = false; };
    }, [version, services, request, requestKey]);
    useEffect(() => {
        if (!services || !company) {
            return;
        }
        let alive = true;
        void services.request<{
            items: DemoItem[];
            parties: DemoParty[];
        }>('masters', { company }).then(value => {
            if (alive) {
                setLiveMasters({ company, ...value });
            }
        }, () => {
            if (alive) {
                setErrorKey(requestKey);
            }
        });
        return () => { alive = false; };
    }, [services, company, version, requestKey]);
    useEffect(() => {
        if (!company) {
            return;
        }
        let alive = true;
        void Promise.all([request<Report>('report', { company, from, to, offset: 0, party: null }), request<{
                warehouses: {
                    id: string;
                    name: string;
                }[];
            }>('inventory-report', { company, from, to, offset: 0 }), request<ExpenseReport>('expense-report', { company, from, to, offset: 0 })]).then(([r, i, e]) => {
            if (!e || !Array.isArray(e.bills) || !Array.isArray(e.categories)) throw new Error('EXPENSE_REPORT_INVALID');
            if (alive) {
                setResult({ key: requestKey, report: r, expenses: e, warehouses: i.warehouses });
            }
        }).catch(() => {
            if (alive) {
                setErrorKey(requestKey);
            }
        });
        return () => { alive = false; };
    }, [company, from, to, version, requestKey, request]);
    const masters = workspaceMasters(services, liveMasters, company), companyName = workspaceName(services, companies, company);
    function openBill(kind: BillKind) { setOverview(null); setBill(kind); setBillKey(n => n + 1); navigation.open('bills'); }
    if (navigation.page === 'company' || services && !companies.length) {
        return <Accounting userId={userId} initialCompany={company} language={language} onBill={openBill} onCompanyChange={setCompany}/>;
    }
    return <div className="books">
  <nav className="books-navigation" aria-label={labels.ledger}>{(['home', 'ledger', 'all-ledgers', 'parties', 'items', 'bills', 'expenses', 'settings'] as const).map(page => <button type="button" key={page} disabled={locked} aria-current={navigation.page === page ? 'page' : undefined} onClick={() => { setOverview(null); setBill(null); navigation.open(page); }}>{labels[page]}</button>)}</nav>
  <label>{inLanguage(language, 'কোম্পানি', 'कंपनी', 'Company')}<select value={company} disabled={locked} onChange={e => { setOverview(null); setCompany(e.target.value); setBill(null); }}>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  {(navigation.page === 'home' || navigation.page === 'all-ledgers' || navigation.page === 'expenses' || navigation.page === 'stock' || showingOverview) && <DateRange language={language} from={from} to={to} onChange={(start, end) => { setFrom(start); setTo(end); }}/>}
  {(navigation.page === 'home' || navigation.page === 'overview' && !showingOverview) && <Dashboard language={language} companyName={companyName} report={report} failed={failed} onRetry={changed} onOpen={navigation.open} onBill={openBill} periodLabel={from + ' — ' + to} partyCount={masters.parties.length} itemCount={masters.items.length} expenses={result?.key === requestKey ? result.expenses : { balances: {}, categories: [], bills: [], entries: [], count: 0 }} onOverview={kind => { setOverview({ company, kind }); navigation.open('overview'); }}/>}
  {showingOverview && report && result?.key === requestKey && <OverviewDetails key={[company, overview.kind, from, to].join('/')} {...{ company, language, from, to, version, report }} expenses={result.expenses} kind={overview.kind} title={designCopy[language][overviewLabels[overview.kind]]} onBack={closeOverview}/>}
  {showingOverview && !report && !failed && <output>{designCopy[language].loading}</output>}
  {showingOverview && failed && <output role="alert">{designCopy[language].error}<button type="button" onClick={changed}>{designCopy[language].retry}</button><button type="button" onClick={closeOverview}>{designCopy[language].home}</button></output>}
  {navigation.page === 'home' && <button className="kh-company-manage" type="button" onClick={() => navigation.open('company')}>{designCopy[language].newCompany} →</button>}
  {navigation.page === 'ledger' && <PaymentEntry key={company} userId={userId} company={company} language={language} report={report} onChanged={changed}/>}
  {navigation.page === 'settings' && <WorkspaceSettings company={company} name={companyName} language={language} onChanged={changed}/>}
  {navigation.page === 'items' && <ItemMaster language={language} company={company} items={masters.items} onChanged={changed}/>}
  {navigation.page === 'parties' && <PartyMaster language={language} company={company} parties={masters.parties} onChanged={changed}/>}
  {navigation.page === 'all-ledgers' && report && <><LedgerExplorer {...{ company, language, from, to, version }} parties={report.parties}/><button type="button" onClick={() => navigation.open('stock')}>{t.stock}</button></>}
  {navigation.page === 'stock' && report && <Inventory userId={userId} {...{ company, companyName, language, from, to, version }} parties={report.parties} onLock={setLocked} onChanged={changed} blocked={false}/>}
  {navigation.page === 'expenses' && <><button type="button" onClick={() => openBill('expense')}>{t.expense}</button><Expenses userId={userId} {...{ company, companyName, language, from, to, version }} payees={masters.parties.filter(p => p.kind === 'expense').map(p => p.name)} onLock={setLocked} onChanged={changed} blocked={false}/></>}
  {navigation.page === 'bills' && bill && <InvoicePage onLock={setLocked} userId={userId} key={billKey} kind={bill} {...{ language, company, companyName, warehouses }} items={masters.items} parties={masters.parties} onSaved={changed} onBack={() => setBill(null)}/>}
  {navigation.page === 'bills' && !bill && <section className="books-card kh-bill-start"><h2>{t.bills}</h2><div className="books-buttons">{(['sale', 'purchase', 'expense'] as const).map(kind => <button type="button" key={kind} onClick={() => openBill(kind)}>{t[kind]}</button>)}</div></section>}
 </div>;
}
