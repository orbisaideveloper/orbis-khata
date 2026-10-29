import {textValue} from '../text-value';
import type {WorkspaceSettings} from '../accounting/workspace-contract';
import {settlementMinor} from '../accounting/record-line-amount';
import {useTutorial} from '../tutorial';
import {InvoiceNumberField} from '../accounting/InvoiceNumberField';
import {useInvoiceNumber} from '../accounting/use-invoice-number';
import { useWorkspaceSettings } from '../accounting/use-settings';
import { billError } from '../accounting/business-error';
import { readBillTemplate } from '../billing/bill-preference';
import { BillShare } from '../billing/BillShare';
import { inLanguage } from '../localize';
import { restoreBill, retainBill, clearBill } from '../billing/recovery';
import { rejected } from '../accounting/api';
import type { KhataOperation } from '../accounting/server-gateway';
import { confirmDelete } from '../confirm-delete';
import '../billing/memo.css';
import { amountFromRate, rateDisplay, rateMinor, updatePricing } from '../billing/amounts';
import { useEffect, useRef, useState } from 'react';
import { PaperPreview } from './PaperPreview';
import type { ExpenseCommand } from '../accounting/expense-model';
import { useBookServices, type BookServices } from '../books-services';
import { PartyMaster } from './Masters';
import { designCopy } from './design-copy';
import type { Language } from '../i18n';
import { minor, money, today } from '../accounting/model';
import { billTotal, displayQuantity, quantity, type InventoryCommand, type StockLine } from '../inventory/model';
import { decimal, itemLabel, type DemoItem, type DemoParty } from './master-model';
import { masterCopy } from './master-copy';
import { demoRequest, saveDemoExpenseBill, demoPreviousBalance } from './store';
export type BillKind = 'sale' | 'purchase' | 'expense';
const copy = {
    bn: { memo: 'মেমো / বিল', subtotal: 'সাবটোটাল', previous: 'আগের ব্যালেন্স (B/F)', totalQuantity: 'মোট পরিমাণ', partySignature: 'পার্টির স্বাক্ষর', authorizedSignature: 'অনুমোদিত স্বাক্ষর', thanks: 'ধন্যবাদ', creditBalance: 'অবশিষ্ট অ্যাডভান্স', sale: 'বিক্রয় বিল', purchase: 'ক্রয় বিল', expense: 'খরচের বিল', number: 'বিল নম্বর', date: 'তারিখ', party: 'পার্টি', choose: 'বেছে নিন', serial: 'নং', item: 'আইটেমের নাম', description: 'বিবরণ', quantity: 'পরিমাণ', unit: 'ইউনিট', rate: 'দর', amount: 'টাকা', total: 'সর্বমোট', add: 'রো যোগ করুন', remove: 'সরান', review: 'বিল যাচাই', confirm: 'নিশ্চিত করে সংরক্ষণ', edit: 'বিলে ফিরুন', cancel: 'ফিরে যান', notes: 'নোট', warehouse: 'গোডাউন', saved: 'বিল সংরক্ষণ হয়েছে।', invalid: 'পার্টি, আইটেম, পরিমাণ ও দর পরীক্ষা করুন।', stock: 'এই গোডাউনে পর্যাপ্ত স্টক নেই।', due: 'এই বিলের টাকা বাকি হিসাবে থাকবে।', method: 'পরিশোধ', unpaid: 'বাকি', cash: 'নগদ', bank: 'ব্যাংক', print: 'বিল প্রিন্ট', newBill: 'নতুন বিল', noParty: 'আগে এই ধরনের পার্টি যোগ করুন।', category: 'খরচের খাতা' },
    en: { memo: 'Memo / Bill', subtotal: 'Subtotal', previous: 'Previous balance (B/F)', totalQuantity: 'Total quantity', partySignature: 'Party signature', authorizedSignature: 'Authorized signature', thanks: 'Thank you', creditBalance: 'Advance remaining', sale: 'Sales invoice', purchase: 'Purchase invoice', expense: 'Expense bill', number: 'Bill number', date: 'Date', party: 'Party', choose: 'Choose', serial: 'No.', item: 'Item name', description: 'Description', quantity: 'Quantity', unit: 'Unit', rate: 'Rate', amount: 'Amount', total: 'Grand total', add: 'Add row', remove: 'Remove', review: 'Review bill', confirm: 'Confirm & save', edit: 'Back to bill', cancel: 'Back', notes: 'Notes', warehouse: 'Godown', saved: 'Bill saved.', invalid: 'Check party, items, quantities and rates.', stock: 'Insufficient stock in this godown.', due: 'This bill remains due until a separate payment is recorded.', method: 'Payment', unpaid: 'Unpaid', cash: 'Cash', bank: 'Bank', print: 'Print bill', newBill: 'New bill', noParty: 'Add a party of this category first.', category: 'Expense account' },
    hi: { memo: 'मेमो / बिल', subtotal: 'उप-योग', previous: 'पुराना बैलेंस (B/F)', totalQuantity: 'कुल मात्रा', partySignature: 'पार्टी के हस्ताक्षर', authorizedSignature: 'अधिकृत हस्ताक्षर', thanks: 'धन्यवाद', creditBalance: 'शेष एडवांस', sale: 'बिक्री बिल', purchase: 'खरीद बिल', expense: 'खर्च बिल', number: 'बिल नंबर', date: 'तारीख', party: 'पार्टी', choose: 'चुनें', serial: 'क्रम', item: 'आइटम नाम', description: 'विवरण', quantity: 'मात्रा', unit: 'यूनिट', rate: 'दर', amount: 'रकम', total: 'कुल योग', add: 'पंक्ति जोड़ें', remove: 'हटाएँ', review: 'बिल जाँचें', confirm: 'पुष्टि और सहेजें', edit: 'बिल पर लौटें', cancel: 'वापस', notes: 'नोट', warehouse: 'गोदाम', saved: 'बिल सहेजा गया।', invalid: 'पार्टी, आइटम, मात्रा और दर जाँचें।', stock: 'इस गोदाम में पर्याप्त स्टॉक नहीं है।', due: 'अलग भुगतान दर्ज करने तक यह बिल बकाया रहेगा।', method: 'भुगतान', unpaid: 'बकाया', cash: 'नकद', bank: 'बैंक', print: 'बिल प्रिंट', newBill: 'नया बिल', noParty: 'पहले इस श्रेणी की पार्टी जोड़ें।', category: 'खर्च खाता' },
};
type Line = {
    key: string;
    item: string;
    description: string;
    quantity: string;
    rate: string;
    amount: string;
    basis: 'rate' | 'amount';
};
const fresh = (): Line => ({ key: crypto.randomUUID(), item: '', description: '', quantity: '1', rate: '', amount: '', basis: 'rate' });
function displayedRate(rate: string) {
    try {
        return money(rateMinor(rate)).replace('₹', '').replaceAll(',', '');
    }
    catch {
        return rate;
    }
}
function needsStockWarning(kind: BillKind, lines: Line[], stocks: {
    item: string;
    warehouse: string;
    closing: string;
}[], warehouse: string) {
    if (kind !== 'sale') {
        return false;
    }
    return lines.some(line => {
        try {
            const available = BigInt(stocks.find(row => row.item === line.item && row.warehouse === warehouse)?.closing ?? '0');
            const used = lines.filter(row => row.item === line.item).reduce((sum, row) => sum + BigInt(quantity(row.quantity)), 0n);
            return Boolean(line.item) && used > available;
        }
        catch {
            return false;
        }
    });
}
function billAppearance(settings:WorkspaceSettings,kind:BillKind,companyName:string){const invoice=kind==='purchase'?undefined:settings.invoice;return {template:settings.invoice?.template??readBillTemplate(),printedCompany:invoice?.name.trim()||companyName,companyDetails:invoice?.details??''};}
function savedBillReference(value:unknown){return value&&typeof value==='object'&&'reference' in value&&typeof value.reference==='string'?value.reference:'';}
function InvoiceHelp({language}:Readonly<{language:Language}>){const tutorial=useTutorial();
 return tutorial?<p className="books-hint">{inLanguage(language,'আইটেম, পরিমাণ ও দর বা টাকা লিখুন। দরকারে রো যোগ করুন। নম্বর শুধু সেভের পরে বাড়ে। ডিসকাউন্ট বাদ দিয়ে বাকি হিসাব হবে। শেয়ারের আগে প্রিভিউ দেখুন।','आइटम, मात्रा और दर या रकम भरें। जरूरत पर पंक्ति जोड़ें। नंबर सेव के बाद बढ़ता है। छूट के बाद बकाया निकलेगा। शेयर से पहले प्रीव्यू देखें।','Enter item, quantity and rate or amount. Add rows as needed. Numbers advance only after saving. Discount reduces the bill and due. Check the preview before sharing.')}</p>:null;
}
function settlementAmounts(total: bigint, paid: string, discount: string, previous: string,kind:BillKind,method:string) {
    let adjustment=0n;try{adjustment=-BigInt(settlementMinor(discount||'0'));}catch{/* Review validates discount. */}
    let paidMinor = 0n;
    try {
        if (paid.trim()) {
            paidMinor = BigInt(minor(paid));
        }
    }
    catch { /* Review validates input. */ }
    const payable = total + adjustment;
    if(kind==='expense'&&['cash','bank'].includes(method))paidMinor=payable;
    return { adjustment, paidMinor, payable, grandTotal: payable + BigInt(previous) - paidMinor };
}
function BillBalanceWarning({ negativeStock, negativeCash, language }: Readonly<{
    negativeStock: boolean;
    negativeCash: boolean;
    language: Language;
}>) {
    if (!negativeStock && !negativeCash) {
        return null;
    }
    const message = negativeStock ? inLanguage(language, 'স্টক মাইনাস হবে। বিল সেভ করতে পারবেন।', 'स्टॉक ऋणात्मक होगा। बिल सहेज सकते हैं।', 'Stock will become negative. You can still save this bill.') : inLanguage(language, 'অ্যাকাউন্টের টাকা মাইনাস হবে। পেমেন্ট সেভ করতে পারবেন।', 'खाते का बैलेंस ऋणात्मक होगा। भुगतान सहेज सकते हैं।', 'Account balance will become negative. You can still save this payment.');
    return <output className="balance-warning">{message}</output>;
}
function accountWillBeNegative(kind: BillKind, paid: bigint, accounts: {
    id: string;
    balance: string;
}[], id: string) { return kind === 'purchase' && paid > BigInt(accounts.find(row => row.id === id)?.balance ?? '0'); }

const partyKinds = { sale: 'customer', purchase: 'supplier', expense: 'expense' } as const;
const allowedKinds: Record<BillKind, readonly DemoParty['kind'][]> = { sale: ['customer', 'both'], purchase: ['supplier', 'both'], expense: ['expense'] };

type BillDraft = {
    id: string;
    company: string;
    kind: BillKind;
    date: string;
    party: DemoParty;
    category: string;
    method: string;
    reference: string;
    note: string;
    amount: string;
    warehouse: string;
    lines: Line[];
    paid: string;
    account: string;
    roundoff: string;
};
function billStockLines(lines: Line[], warehouse: string): StockLine[] { return lines.map(line => ({ item: line.item, warehouse, to: null, quantity: quantity(line.quantity), rate: rateMinor(line.rate), unit_rate: line.rate })); }
function billExpenseLines(lines: Line[]) { return lines.map(line => ({ description: line.description, quantity: quantity(line.quantity), unit: '', rate: rateMinor(line.rate), unit_rate: line.rate })); }
function billPaymentMethod(method: string): 'cash' | 'bank' | null {
    if (method === 'cash' || method === 'bank') {
        return method;
    }
    return null;
}
function billOperation(draft: BillDraft): KhataOperation {
 const {id,company,date,party,kind,reference,note}=draft;
 const command=kind==='expense'?{company,action:'expense',id,command:{id,company,date,kind:'charge',amount:String(BigInt(draft.amount)+BigInt(draft.roundoff)),category:draft.category.trim()||party.name,payee:party.name,method:billPaymentMethod(draft.method),parent:null,reference,note},lines:billExpenseLines(draft.lines),discount:String(-BigInt(draft.roundoff))}:{company,action:'bill',bill:{id,company,kind,date,code:'',name:'',unit:'',party:party.id,reference,note,lines:billStockLines(draft.lines,draft.warehouse)},paid:draft.paid,account:draft.account,roundoff:draft.roundoff};
 return {operation:'workspace',input:{company,action:'invoice-save',command}};
}
async function persistBill(operation: KhataOperation, services: BookServices | null, userId: string) {
    if (services) {
        retainBill(userId, operation);
        const result=await services.request(operation.operation, operation.input);
        clearBill(userId);
        return result;
    }
    if (!import.meta.env.DEV) {
        throw new Error('LIVE_SERVICES_REQUIRED');
    }
    if (operation.operation === 'expense-bill') {
        await saveDemoExpenseBill(operation.input.command as ExpenseCommand, operation.input.lines as ReturnType<typeof billExpenseLines>);
        return;
    }
    return await demoRequest(operation.operation, operation.input);
}
function recoveredBill(recovery: KhataOperation | null, parties: DemoParty[]):{company:string;date:string;reference:string;partyName:string;amount:string}|null {
    if (!recovery) {
        return null;
    }
    if(recovery.operation==='workspace'&&recovery.input.action==='invoice-save'){const inner=recovery.input.command as Record<string,unknown>;return recoveredBill(inner.action==='expense'?{operation:'expense-bill',input:{command:inner.command,lines:inner.lines}}:{operation:'workspace',input:inner},parties);}
    if (recovery.operation === 'expense-bill') {
        const command = recovery.input.command as ExpenseCommand;
        return { company: command.company, date: command.date, reference: command.reference, partyName: command.payee, amount: command.amount };
    }
    const command = (recovery.operation === 'workspace' ? recovery.input.bill : recovery.input) as InventoryCommand;
    return { company: command.company, date: command.date, reference: command.reference, partyName: parties.find(p => p.id === command.party)?.name ?? '', amount: String(billTotal(command.lines)+BigInt(recovery.operation==='workspace'?textValue(recovery.input.roundoff)||'0':command.roundoff??'0')) };
}
export function InvoicePage({ kind, language, company, companyName, items, parties, warehouses, onSaved, onBack, onLock, userId = 'demo-owner' }: Readonly<{
    onLock?: (locked: boolean) => void;
    userId?: string;
    kind: BillKind;
    language: Language;
    company: string;
    companyName: string;
    items: DemoItem[];
    parties: DemoParty[];
    warehouses: {
        id: string;
        name: string;
    }[];
    onSaved: () => void;
    onBack: () => void;
}>) {
    const t = copy[language], m = masterCopy[language], d = designCopy[language], services = useBookServices();
    const [recovery, setRecovery] = useState(() => services ? restoreBill(userId) : null);
    const { settings, request, loaded, reload:reloadSettings, failed:settingsFailed } = useWorkspaceSettings(company, Boolean(recovery));
    const [focusedRate, setFocusedRate] = useState('');
    const [stockSnapshot, setStockSnapshot] = useState<{
        item: string;
        warehouse: string;
        closing: string;
    }[]>([]);
    const [accountBalances, setAccountBalances] = useState<{
        id: string;
        balance: string;
    }[]>([]);
    const [paid, setPaid] = useState(''), [account, setAccount] = useState('cash'), [discount,setDiscount]=useState(''),[savedReference,setSavedReference]=useState('');
    const balanceGeneration = useRef(0), [balanceBusy, setBalanceBusy] = useState(false), [balanceFailed, setBalanceFailed] = useState(false);
    const {template,printedCompany,companyDetails}=billAppearance(settings,kind,companyName);
    const [id] = useState(() => crypto.randomUUID()), guard = useRef(false);
    const [lines, setLines] = useState<Line[]>([fresh()]), [partyId, setPartyId] = useState(''), [date, setDate] = useState(today), [reference, setReference] = useState(''), [note, setNote] = useState(''), [warehouse, setWarehouse] = useState(warehouses[0]?.id ?? ''), [category, setCategory] = useState(''), [method, setMethod] = useState('due'), [phase, setPhase] = useState<'edit' | 'review' | 'saved'>('edit'), [error, setError] = useState(''), [busy, setBusy] = useState(false), [previous, setPrevious] = useState('0');
    const [addingParty, setAddingParty] = useState(false), [addedParties, setAddedParties] = useState<DemoParty[]>([]);
    const allParties = [...new Map([...parties, ...addedParties].filter(p => p.company === company).map(p => [p.id, p])).values()];
    const party = allParties.find(p => p.id === partyId);
    const selectedWarehouse = warehouse || warehouses[0]?.id || '';
    const partyKind = partyKinds[kind];
    const allowed = allParties.filter(p => allowedKinds[kind].includes(p.kind));
    function change(key: string, field: keyof Line, value: string) {
        setLines(old => old.map(line => {
            if (line.key !== key) {
                return line;
            }
            if (field === 'quantity' || field === 'rate' || field === 'amount') {
                return updatePricing(line, field, value);
            }
            if (field === 'item') {
                return updatePricing({ ...line, item: value }, 'rate', decimal(items.find(i => i.id === value)?.default_rate ?? null));
            }
            return { ...line, [field]: value };
        }));
    }
    function stockLines(): StockLine[] { return billStockLines(lines, selectedWarehouse); }
    function total() {
        return lines.reduce((sum, line) => {
            try {
                return sum + BigInt(amountFromRate(line.quantity, line.rate));
            }
            catch {
                return sum;
            }
        }, 0n);
    }
    function rowAmount(line: Line) {
        try {
            return money(amountFromRate(line.quantity, line.rate));
        }
        catch {
            return '—';
        }
    }
    function loadPrevious(party: string, day: string) {
        const generation = ++balanceGeneration.current;
        setBalanceFailed(false);
        if (!services) {
            setPrevious(import.meta.env.DEV ? demoPreviousBalance(company, party, day, kind) : '0');
            return;
        }
        if (!party || !day) {
            setPrevious('0');
            return;
        }
        setBalanceBusy(true);
        void services.previous(company, party, day, kind).then(value => {
            if (generation === balanceGeneration.current) {
                setPrevious(value);
                setBalanceBusy(false);
            }
        }, () => {
            if (generation === balanceGeneration.current) {
                setBalanceFailed(true);
                setBalanceBusy(false);
                setError(t.invalid);
            }
        });
    }
    function pickParty(value: string) { setPartyId(value); loadPrevious(value, date); }
    function pickDate(value: string) { setDate(value); loadPrevious(partyId, value); }
    function totalQuantities() {
        const groups = new Map<string, bigint>();
        for (const line of lines) {
            try {
                const unit = items.find(i => i.id === line.item)?.unit ?? '';
                groups.set(unit, (groups.get(unit) ?? 0n) + BigInt(quantity(line.quantity)));
            }
            catch { /* Incomplete draft rows have no quantity total. */ }
        }
        return [...groups].map(([unit, value]) => `${displayQuantity(String(value))}${unit ? ' ' + unit : ''}`).join(' · ') || '—';
    }
    useEffect(() => { onLock?.(busy); return () => { onLock?.(false); }; }, [busy, onLock]);
    const { adjustment, payable, paidMinor, grandTotal } = settlementAmounts(total(), paid, discount, previous,kind,method);
    const numbering=useInvoiceNumber({company,id,kind,date,settings,loaded,request,disabled:Boolean(recovery)});
    const billNumber = savedReference || (numbering.number ?? reference.trim());
    useEffect(() => {
        if (recovery) {
            return;
        }
        let alive = true;
        void request<{
            stocks: {
                item: string;
                warehouse: string;
                closing: string;
            }[];
        }>('inventory-report', { company, from: date, to: date, offset: 0 }).then(value => {
            if (alive) {
                setStockSnapshot(value?.stocks ?? []);
            }
        }, () => {
            if (alive) {
                setStockSnapshot([]);
            }
        });
        void request<unknown>('workspace', { company, action: 'accounts' }).then(value => {
            if (alive && Array.isArray(value)) {
                setAccountBalances(value);
            }
        }, () => { });
        return () => { alive = false; };
    }, [company, date, request, recovery]);
    const negativeStock = needsStockWarning(kind, lines, stockSnapshot, selectedWarehouse);
    const negativeCash = accountWillBeNegative(kind, paidMinor, accountBalances, account);
    function review(event: React.SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        try {
            if (settingsFailed || numbering.loading || numbering.failed || !billNumber || balanceBusy || balanceFailed || !party || !allowed.some(p => p.id === party.id) || date > today() || !date || !lines.length || lines.length > 50 || total() <= 0n) {
                throw new Error('INVALID_BILL');
            }
            if(BigInt(settlementMinor(discount||'0'))>=total())throw new Error('INVALID_DISCOUNT');
            stockLines();
            if (kind !== 'expense' && (paid.trim() && BigInt(minor(paid)) > payable || payable <= 0n)) {
                throw new Error('INVALID_PAYMENT');
            }
            if (kind === 'expense') {
                if (lines.some(l => !l.description.trim())) {
                    throw new Error('INVALID_BILL');
                }
            }
            else if (!selectedWarehouse || lines.some(l => !items.some(i => i.id === l.item))) {
                throw new Error('INVALID_BILL');
            }
            setPhase('review');
            window.scrollTo?.(0, 0);
        }
        catch {
            setError(t.invalid);
        }
    }
    async function save() {
        if (guard.current || !party) {
            return;
        }
        guard.current = true;
        setBusy(true);
        setError('');
        try {
            const result=await persistBill(billOperation({ id, company, kind, date, party, category, method, reference: billNumber, note, amount: String(total()), warehouse: selectedWarehouse, lines, paid: String(paidMinor), account, roundoff: String(adjustment) }), services, userId);
            setSavedReference(savedBillReference(result));
            setPhase('saved');
            onSaved();
        }
        catch (e) {
            if (services) {
                if (rejected(e)) {
                    clearBill(userId);
                }
                else {
                    setRecovery(restoreBill(userId));
                }
            }
            setError(billError(e, language, t.invalid));
        }
        finally {
            guard.current = false;
            setBusy(false);
        }
    }
    const recovered = recoveredBill(recovery, parties);
    const sameRecoveryCompany = recovered?.company === company;
    async function retryRecovery() {
        if (!recovery || !services || !sameRecoveryCompany || guard.current) {
            return;
        }
        guard.current = true;
        setBusy(true);
        setError('');
        try {
            await services.request(recovery.operation, recovery.input);
            clearBill(userId);
            setRecovery(null);
            onSaved();
            onBack();
        }
        catch (e) {
            if (rejected(e)) {
                clearBill(userId);
                setRecovery(null);
            }
            setError(t.invalid);
        }
        finally {
            guard.current = false;
            setBusy(false);
        }
    }
    if (recovery) {
        return <section className="books-card"><h2>{sameRecoveryCompany ? companyName : inLanguage(language, 'আগের বিলের কোম্পানি বেছে নিন', 'पिछले बिल की कंपनी चुनें', 'Choose the previous bill’s company')}</h2>{sameRecoveryCompany && <p>{recovered?.date} · {recovered?.reference} · {recovered?.partyName} · {money(recovered?.amount ?? '0')}</p>}<output role="alert">{inLanguage(language, 'আগের বিল সেভ হয়েছে কি না নিশ্চিত নয়। একই বিল আবার যাচাই করুন।', 'पिछला बिल सहेजा गया या नहीं, निश्चित नहीं है। उसी बिल को फिर जाँचें।', 'The previous bill has an unconfirmed save. Retry the same bill before adding another.')}</output>{error && <output>{error}</output>}<button disabled={busy || !sameRecoveryCompany} type="button" onClick={() => { void retryRecovery(); }}>{t.confirm}</button><button disabled={busy} type="button" onClick={onBack}>{t.cancel}</button></section>;
    }
    if (phase !== 'edit') {
        return <section aria-label={t[kind]} className="bill-review">
  <PaperPreview template={template} companyDetails={companyDetails} draft={phase !== 'saved' ? d.draft : ''} continuation={d.continue} companyName={printedCompany} title={t[kind]} memo={t.memo} numberLabel={t.number} number={billNumber} dateLabel={t.date} date={date.split('-').reverse().join('-')} partyName={party?.name ?? ''} partyDetails={[party ? m[party.kind] : '', party?.phone, party?.address, party?.email].filter(Boolean).join(' · ')} headings={[t.serial, kind === 'expense' ? t.description : t.item, t.quantity, t.rate, t.amount]} rows={lines.map((line, index) => [String(index + 1), kind === 'expense' ? line.description : items.find(i => i.id === line.item)?.name ?? '', displayQuantity(quantity(line.quantity)) + ' ' + (items.find(i => i.id === line.item)?.unit ?? ''), rateDisplay(line.rate), rowAmount(line)])} totals={[[t.totalQuantity, totalQuantities()], [t.subtotal, money(total())], [inLanguage(language, 'লেস / ডিসকাউন্ট', 'छूट', 'Less / discount'), money(adjustment)], [t.total,money(payable)], [t.previous, money(previous)], [inLanguage(language, 'জমা / পরিশোধ', 'जमा / भुगतान', 'Received / paid'), money(paidMinor)], [inLanguage(language,'বাকি / ব্যালেন্স','शेष / बैलेंस','Remaining balance'), money(grandTotal)]]} note={note} thanks={t.thanks} signatures={[t.partySignature, t.authorizedSignature]}/>
  <BillShare key={phase + template} language={language} name={companyName + '-' + billNumber}/>
  <button className="bill-print-button" type="button" onClick={() => window.print()}>{d.print}</button>
  {grandTotal < 0n && <p>{t.creditBalance}: {money(-grandTotal)}</p>}{error && <output role="alert">{error}</output>}
  <div className="books-buttons memo-controls">{phase === 'review' ? <><button type="button" className="books-primary" disabled={busy} onClick={() => { void save(); }}>{t.confirm}</button><button type="button" disabled={busy} onClick={() => setPhase('edit')}>{t.edit}</button></> : <output>{t.saved}</output>}<button type="button" disabled={busy} onClick={onBack}>{t.cancel}</button></div>
 </section>;
    }
    if (addingParty) {
        return <PartyMaster language={language} company={company} parties={allParties} startKind={partyKind} onChanged={() => { }} onCreated={p => { setAddedParties(old => [...old, p]); pickParty(p.id); setAddingParty(false); }} onCancelCreate={() => setAddingParty(false)}/>;
    }
    return <section className="invoice-page books-card memo-paper memo-edit" aria-label={t[kind]}>
  <div className="invoice-heading memo-heading"><h1>{companyName}</h1><span className="memo-badge">{t.memo}</span><p>{t[kind]}</p></div><button className="memo-back" type="button" disabled={busy} onClick={onBack}>{t.cancel}</button>
  <form onSubmit={review}>
   <div className="invoice-party"><p className="bill-party-context">{companyName} · {m[partyKind]}</p>{<label>{t.party}<select required value={partyId} onChange={e => pickParty(e.target.value)}><option value="">{t.choose}</option>{allowed.map(p => <option key={p.id} value={p.id}>{p.name} · {m[p.kind]}</option>)}</select></label>}<button type="button" className="bill-add-party" onClick={() => setAddingParty(true)}>＋ {m.addParty}</button>{!allowed.length && <output>{t.noParty} ({m[partyKind]})</output>}{party && <address><strong>{party.name}</strong><span>{m[party.kind]}</span>{party.phone && <span>{m.phone}: {party.phone}</span>}{party.address && <span>{party.address}</span>}{party.email && <span>{party.email}</span>}</address>}</div>
   <div className="invoice-meta">{<><InvoiceNumberField numbering={numbering} reference={reference} onReference={setReference} label={t.number} language={language} settingsFailed={settingsFailed} onRetry={()=>{reloadSettings();numbering.retry();}}/><label>{t.date}<input type="date" required max={today()} value={date} onChange={e => pickDate(e.target.value)}/></label></>}</div>

   {kind !== 'expense' && warehouses.length > 1 && <label>{t.warehouse}<select value={selectedWarehouse} onChange={e => setWarehouse(e.target.value)}>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
   {kind === 'expense' && <div className="invoice-meta"><label>{t.category}<input maxLength={80} value={category} onChange={e => setCategory(e.target.value)}/></label><label>{t.method}<select value={method} onChange={e => setMethod(e.target.value)}>{(['due', 'cash', 'bank'] as const).map(value => <option key={value} value={value}>{value === 'due' ? t.unpaid : t[value]}</option>)}</select></label></div>}
   <div className="invoice-scroll"><table className="invoice-table"><thead><tr><th>{t.serial}</th><th>{kind === 'expense' ? t.description : t.item}</th><th>{t.quantity}</th><th>{t.rate}</th><th>{t.amount}</th>{<th />}</tr></thead><tbody>{lines.map((line, index) => <tr key={line.key}><td>{index + 1}</td><td>{(kind === 'expense' ? <input aria-label={`${t.description} ${index + 1}`} required maxLength={120} value={line.description} onChange={e => change(line.key, 'description', e.target.value)}/> : <select aria-label={`${t.item} ${index + 1}`} required value={line.item} onChange={e => change(line.key, 'item', e.target.value)}><option value="">{t.choose}</option>{items.map(item => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}</select>)}</td><td data-label={t.quantity}>{<input aria-label={`${t.quantity} ${index + 1}`} inputMode="decimal" required value={line.quantity} onChange={e => change(line.key, 'quantity', e.target.value)}/>}<small className="memo-unit">{items.find(i => i.id === line.item)?.unit ?? ''}</small></td><td data-label={t.rate}>{<input aria-label={`${t.rate} ${index + 1}`} inputMode="decimal" required value={focusedRate === line.key ? line.rate : displayedRate(line.rate)} onFocus={() => setFocusedRate(line.key)} onBlur={() => setFocusedRate('')} onChange={e => change(line.key, 'rate', e.target.value)}/>}</td><td data-label={t.amount}>{<input aria-label={`${t.amount} ${index + 1}`} inputMode="decimal" required value={line.amount} onChange={e => change(line.key, 'amount', e.target.value)}/>}</td>{<td><button type="button" aria-label={`${t.remove} ${index + 1}`} disabled={lines.length === 1} onClick={() => {
                    if (confirmDelete(language, String(lines.indexOf(line) + 1))) {
                        setLines(old => old.filter(row => row.key !== line.key));
                    }
                }}>×</button></td>}</tr>)}</tbody><tfoot><tr><th colSpan={2}>{t.totalQuantity}</th><td>{totalQuantities()}</td><th>{t.subtotal}</th><td><strong>{money(total())}</strong></td>{<td />}</tr></tfoot></table></div>
   {<button className="memo-add-row" type="button" disabled={lines.length >= 50} onClick={() => setLines(old => [...old, fresh()])}>＋ {t.add}</button>}
   <BillBalanceWarning negativeStock={negativeStock} negativeCash={negativeCash} language={language}/>
   <div className="invoice-discount"><label>{inLanguage(language,'লেস / ডিসকাউন্ট','छूट','Less / discount')}<input inputMode="decimal" value={discount} placeholder="0.00" onChange={e=>setDiscount(e.target.value)}/></label><strong>{t.total}: {money(payable)}</strong></div>
   <InvoiceHelp language={language}/>
   {kind !== 'expense' && <fieldset className="bill-payment"><legend>{inLanguage(language, 'এই বিলের পেমেন্ট', 'इस बिल का भुगतान', 'Payment with this bill')}</legend><label>{kind === 'sale' ? inLanguage(language, 'এখন জমা', 'अभी प्राप्त', 'Received now') : inLanguage(language, 'এখন পরিশোধ', 'अभी भुगतान', 'Paid now')}<input inputMode="decimal" value={paid} placeholder="0.00" onChange={event => setPaid(event.target.value)}/></label><label>{inLanguage(language, 'অ্যাকাউন্ট', 'खाता', 'Account')}<select value={account} onChange={event => setAccount(event.target.value)}>{settings.accounts.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}{row.channel ? ' · ' + row.channel : ''}</option>)}</select></label><p>{inLanguage(language, 'এই বিলের বাকি', 'इस बिल का बकाया', 'Due on this bill')}: {money(payable - paidMinor)}</p></fieldset>}
   <dl className="memo-totals">{BigInt(previous)!==0n&&<div><dt>{t.previous}</dt><dd>{money(previous)}</dd></div>}<div className="memo-grand"><dt>{inLanguage(language,'বাকি / ব্যালেন্স','शेष / बैलेंस','Remaining balance')}</dt><dd>{money(grandTotal)}</dd></div></dl>{grandTotal < 0n && <p>{t.creditBalance}: {money(-grandTotal)}</p>}

   {<details className="invoice-notes"><summary>{t.notes}</summary><textarea aria-label={t.notes} maxLength={500} value={note} onChange={e => setNote(e.target.value)}/></details>}
   {error && <output role="alert">{error}</output>}
   
   <div className="books-buttons memo-controls"><button type="submit" className="books-primary" disabled={!allowed.length || balanceBusy || balanceFailed || numbering.loading || numbering.failed || settingsFailed}>{t.review}</button></div>
  </form>
 </section>;
}
