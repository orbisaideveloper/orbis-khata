import { useBooksBack } from '../books-navigation';
import { expenseLedgerReport } from './expense-ledger';
import { PartyLedger } from './PartyLedger';
import { allPages } from './report-pages';
import { itemLabel } from '../demo/master-model';
import { useEffect, useState } from 'react';
import type { Language } from '../i18n';
import type { Report } from './model';
import type { ExpenseReport } from './expense-model';
import type { InventoryReport } from '../inventory/model';
import { expenseReport, report } from './api';
import { inventoryReport } from '../inventory/api';
import { money } from './model';
import { accountingCopy } from './copy';
import { expenseCopy } from './expense-copy';
import { ItemStatement } from './ItemStatement';
const copy = {
    bn: { title: 'লেজার', search: 'নাম বা আইটেম কোড দিয়ে খুঁজুন', all: 'সব লেজার', party: 'পার্টি', expense: 'খরচ', item: 'আইটেম', choose: 'বিস্তারিত দেখতে একটি লেজার বেছে নিন', empty: 'কোনো লেজার পাওয়া যায়নি', back: 'তালিকায় ফিরুন' },
    en: { title: 'Ledger', search: 'Search by name or item code', all: 'All ledgers', party: 'Party', expense: 'Expense', item: 'Item', choose: 'Choose a ledger to view its details', empty: 'No matching ledgers', back: 'Back to list' },
    hi: { title: 'लेजर', search: 'नाम या आइटम कोड से खोजें', all: 'सभी लेजर', party: 'पार्टी', expense: 'खर्च', item: 'आइटम', choose: 'विवरण के लिए एक लेजर चुनें', empty: 'कोई लेजर नहीं मिला', back: 'सूची पर लौटें' },
};
export type LedgerEntity = {
    id: string;
    name: string;
    type: 'party' | 'expense' | 'item';
    category?: string;
    payee?: string;
    partyId?: string;
};
export function LedgerExplorer({ company, language, from, to, version, parties, initialSelection, onBack }: Readonly<{
    company: string;
    language: Language;
    from: string;
    to: string;
    version: number;
    parties: Report['parties'];
    initialSelection?: LedgerEntity;
    onBack?: () => void;
}>) {
    const t = copy[language], a = accountingCopy[language], e = expenseCopy[language];
    const [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [selected, setSelected] = useState<LedgerEntity | null>(initialSelection ?? null);
    useBooksBack(Boolean(selected), () => { if(onBack) onBack(); else setSelected(null); });
    const query = JSON.stringify([company, from, to, version]);
    const scopedType = initialSelection?.type;
    const [result, setResult] = useState<{
        query: string;
        expenses: ExpenseReport;
        inventory: InventoryReport;
    } | null>(null);
    const [failed, setFailed] = useState(''), [retry, setRetry] = useState(0);
    const [partyResult, setPartyResult] = useState<{
        key: string;
        data: Report;
    } | null>(null);
    useEffect(() => {
        let alive = true;
        async function load() {
            try {
                const emptyExpenses: ExpenseReport = { balances: {}, categories: [], bills: [], entries: [], count: 0 };
                const emptyInventory: InventoryReport = { items: [], warehouses: [], stocks: [], documents: [], count: 0 };
                const skipExpenses = scopedType === 'party' || scopedType === 'item';
                const skipInventory = Boolean(scopedType && scopedType !== 'item');
                const [expenses, inventory] = await Promise.all([skipExpenses ? Promise.resolve(emptyExpenses) : expenseReport(company, from, to, 0), skipInventory ? Promise.resolve(emptyInventory) : inventoryReport(company, from, to, 0)]);
                const [fullExpense, fullInventory] = await Promise.all([allPages(expenses, 'entries', offset => expenseReport(company, from, to, offset)), allPages(inventory, 'documents', offset => inventoryReport(company, from, to, offset))]);
                if (alive) {
                    setResult({ query, expenses: fullExpense, inventory: fullInventory });
                    setFailed('');
                }
            }
            catch {
                if (alive) {
                    setFailed(query);
                }
            }
        }
        void load();
        return () => { alive = false; };
    }, [company, from, to, query, retry, scopedType]);
    const data = result?.query === query ? result : null;
    const partyKey = query + selected?.id;
    useEffect(() => {
        let alive = true;
        if (!selected || (selected.type !== 'party' && !(selected.type === 'expense' && selected.partyId))) {
            return;
        }
        void report(company, from, to, selected.partyId ?? selected.id, 0).then(first => allPages(first, 'entries', offset => report(company, from, to, selected.partyId ?? selected.id, offset))).then(data => {
            if (alive) {
                setPartyResult({ key: partyKey, data });
            }
        }, () => {
            if (alive) {
                setFailed(partyKey);
            }
        });
        return () => { alive = false; };
    }, [company, from, to, selected, partyKey, retry]);
    if (failed === query) {
        return <output>{a.error}<button type="button" onClick={() => setRetry(n => n + 1)}>{a.retry}</button></output>;
    }
    if (!data) {
        return <output>{a.loading}</output>;
    }
    const entities: LedgerEntity[] = [...parties.map(p => ({ id: p.id, name: p.name, type: p.kind === 'expense' ? 'expense' as const : 'party' as const, ...(p.kind === 'expense' ? { payee: p.name, partyId: p.id } : {}) })), ...data.expenses.categories.map(c => ({ id: 'category:' + c.name, name: c.name, type: 'expense' as const, category: c.name })), ...data.inventory.items.map(item => ({ id: item.id, name: itemLabel(item), type: 'item' as const }))];
    const matches = entities.filter(row => (filter === 'all' || row.type === filter) && row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    const expenseEntries = selected?.type === 'expense' ? data.expenses.entries.filter(row => selected.category ? row.category === selected.category : row.payee === selected.payee) : [];
    const selectedExpenseBills = data.expenses.bills.filter(row => selected?.type === 'expense' && (selected.category ? row.category === selected.category : row.payee === selected.payee));
    const expenseTotal = selected?.category ? BigInt(data.expenses.categories.find(c => c.name === selected.category)?.amount ?? '0') : expenseEntries.filter(row => row.kind === 'charge' && !row.reversed).reduce((sum, row) => sum + BigInt(row.amount), 0n);
    const expenseDue = selectedExpenseBills.reduce((sum, row) => sum + BigInt(row.due), 0n);
    const stockRows = data.inventory.stocks.filter(row => row.item === selected?.id);
    const item = data.inventory.items.find(row => row.id === selected?.id);
    const documents = data.inventory.documents.filter(row => !row.reversed && row.lines.some(line => line.item === selected?.id));
    const expenseAdvance = language === 'bn' ? 'অ্যাডভান্স' : 'Advance', expensePreviousDue = language === 'bn' ? 'আগের বাকি' : 'Previous due';
    const partyData = partyResult?.key === partyKey ? partyResult.data : null;
    return <section className="books-card ledger-explorer" aria-label={t.title}><h2>{t.title}</h2>
  {!initialSelection && <div className="ledger-search"><select aria-label={t.title} value={filter} onChange={event => { setFilter(event.target.value); setSelected(null); }}>{(['all', 'party', 'expense', 'item'] as const).map(type => <option value={type} key={type}>{t[type]}</option>)}</select><input aria-label={t.search} placeholder={t.search} type="search" value={search} onChange={event => { setSearch(event.target.value); setSelected(null); }}/></div>}
  {!selected && <><p className="ledger-hint">{t.choose}</p><div className="ledger-results">{!matches.length && <p>{t.empty}</p>}{matches.map(row => <button type="button" className="books-entity ledger-row" key={row.id} onClick={() => setSelected(row)}><strong>{row.name}</strong>{' '}<span>{t[row.type]}</span><span aria-hidden="true">›</span></button>)}</div></>}
  {selected && <div className="ledger-detail"><button type="button" onClick={() => {
                if (onBack) {
                    onBack();
                }
                else {
                    setSelected(null);
                }
            }}>{t.back}</button><h3>{selected.name}</h3>
   {selected.type === 'party' && <>{failed === partyKey && <output>{a.error}<button type="button" onClick={() => setRetry(n => n + 1)}>{a.retry}</button></output>}{failed !== partyKey && !partyData && <output>{a.loading}</output>}{failed !== partyKey && partyData && <><p>{a.receivable}: {money(partyData.ledger_balances.receivable?.closing ?? '0')} · {a.payable}: {money(-BigInt(partyData.ledger_balances.payable?.closing ?? '0'))}</p>{!partyData.entries.length && !partyData.opening_entries?.length ? <p>{a.empty}</p> : <PartyLedger data={partyData} language={language} company={company} from={from} to={to} name={selected.name} onChanged={() => setRetry(n => n + 1)}/>}</>}</>}
   {selected.type === 'expense' && <>{partyResult?.key === partyKey && partyResult.data.opening_entries?.map(row => <p key={row.id}>{a.opening} · {row.date} · {row.side === 'advance' ? expenseAdvance : expensePreviousDue} · {money(row.amount)}</p>)}<p>{e.period}: {money(expenseTotal)} · {e.outstanding}: {money(expenseDue)}</p>{!expenseEntries.length && <p>{a.empty}</p>}<PartyLedger source="expense" data={expenseLedgerReport(data.expenses, expenseEntries, parties, expenseDue)} language={language} company={company} from={from} to={to} name={selected.name} onChanged={() => setRetry(n => n + 1)}/></>}
   {selected.type === 'item' && <ItemStatement language={language} item={item} stocks={stockRows} documents={documents} warehouses={data.inventory.warehouses}/>}

  </div>}
 </section>;
}
