import { useRecordDialog } from './use-record-dialog';
import type { RecordDetailProps } from './record-detail-props';
import { useEffect, useState } from 'react';
import { inLanguage } from '../localize';
import { confirmDelete } from '../confirm-delete';
import { money, minor } from './model';
import { quantity, displayQuantity } from '../inventory/model';
import { amountFromRate, rateMinor } from '../billing/amounts';
import { useWorkspaceSettings } from './use-settings';
import { billError } from './business-error';
import type { ExpenseCommand } from './expense-model';
type ExpenseDetail = {
    expense: ExpenseCommand & {
        effective_date?: string;
        amount_minor?: string;
        parent_id?: string | null;
    };
    lines: {
        description: string;
        quantity: string;
        unit: string;
        rate: string;
        unit_rate?: string;
    }[] | null;
};
export function ExpenseRecordDetail({ company, id, mode, language, onClose, onChanged }: RecordDetailProps) {
    const dialog = useRecordDialog(onClose);
    const { request } = useWorkspaceSettings(company), [data, setData] = useState<ExpenseDetail | null>(null), [editing, setEditing] = useState(mode === 'edit'), [amount, setAmount] = useState(''), [date, setDate] = useState(''), [reference, setReference] = useState(''), [note, setNote] = useState(''), [lines, setLines] = useState<{
        key: string;
        description: string;
        qty: string;
        rate: string;
        unit: string;
    }[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [operation] = useState(() => crypto.randomUUID()), [replacementId] = useState(() => crypto.randomUUID());
    const l = (bn: string, hi: string, en: string) => inLanguage(language, bn, hi, en);
    useEffect(() => {
        let alive = true;
        void request<ExpenseDetail>('workspace', { company, action: 'detail', id }).then(value => {
            if (!alive) {
                return;
            }
            if (!value?.expense) {
                setError('Entry unavailable');
                return;
            }
            const e = value.expense;
            setData(value);
            setDate(e.effective_date ?? e.date);
            setReference(e.reference);
            setNote(e.note);
            const n = BigInt(e.amount_minor ?? e.amount);
            setAmount((n / 100n) + '.' + String(n % 100n).padStart(2, '0'));
            setLines((value.lines ?? []).map(row => ({ key: crypto.randomUUID(), description: row.description, qty: displayQuantity(row.quantity), rate: row.unit_rate ?? String(BigInt(row.rate) / 100n) + '.' + String(BigInt(row.rate) % 100n).padStart(2, '0'), unit: row.unit })));
        }, () => {
            if (alive) {
                setError('Entry unavailable');
            }
        });
        return () => { alive = false; };
    }, [company, id, request]);
    async function correct(remove: boolean) {
        if (!data) {
            return;
        }
        try {
            let replacement = null;
            if (remove) {
                if (!confirmDelete(language, reference || id)) {
                    return;
                }
            }
            else {
                const editedLines = lines.map(row => ({ description: row.description, quantity: quantity(row.qty), unit: row.unit, rate: rateMinor(row.rate), unit_rate: row.rate }));
                const total = lines.length ? String(lines.reduce((sum, row) => sum + BigInt(amountFromRate(row.qty, row.rate)), 0n)) : minor(amount);
                const old = data.expense;
                const command: ExpenseCommand = { id: replacementId, company, date, kind: old.kind, amount: total, category: old.category, payee: old.payee, method: old.method, parent: old.parent_id ?? old.parent ?? null, reference, note };
                replacement = { company, action: 'expense', id: replacementId, command, lines: editedLines };
                if (!window.confirm(l('পরিবর্তিত খরচ যাচাই করেছেন?', 'बदला खर्च जाँचा है?', 'Have you reviewed the changed expense?')) || !window.confirm(l('শেষবার নিশ্চিত করে সেভ করুন।', 'अंतिम पुष्टि करें।', 'Final confirmation — save changes?'))) {
                    return;
                }
            }
            setBusy(true);
            await request('workspace', { company, action: 'correct', id: operation, target: id, type: 'expense', reason: remove ? 'Expense deleted by owner' : 'Expense edited by owner', replacement });
            onChanged();
        }
        catch (e) {
            setError(billError(e, language, l('সেভ হয়নি। আবার চেষ্টা করুন।', 'सहेजा नहीं गया। फिर कोशिश करें।', 'Not saved. Retry.')));
        }
        finally {
            setBusy(false);
        }
    }
    return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} className="record-detail books-card" aria-modal="true" aria-label={l('খরচের বিস্তারিত', 'खर्च विवरण', 'Expense details')}><button disabled={busy} type="button" onClick={onClose}>{l('বন্ধ করুন', 'बंद करें', 'Close')}</button>{error && <output role="alert">{error}</output>}{data && <><h3>{data.expense.payee || data.expense.category}</h3><p>{date} · {reference} · {money(data.expense.amount_minor ?? data.expense.amount)}</p>{editing && <><label>{l('তারিখ', 'तारीख', 'Date')}<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label><label>{l('বিল নম্বর', 'बिल नंबर', 'Bill number')}<input maxLength={80} value={reference} onChange={e => setReference(e.target.value)}/></label>{lines.length ? lines.map((row, index) => <fieldset key={row.key}><label>{l('বিবরণ', 'विवरण', 'Description')}<input value={row.description} onChange={e => setLines(old => old.map((r, i) => i === index ? { ...r, description: e.target.value } : r))}/></label><label>{l('পরিমাণ', 'मात्रा', 'Quantity')}<input inputMode="decimal" value={row.qty} onChange={e => setLines(old => old.map((r, i) => i === index ? { ...r, qty: e.target.value } : r))}/></label><label>{l('দর', 'दर', 'Rate')}<input inputMode="decimal" value={row.rate} onChange={e => setLines(old => old.map((r, i) => i === index ? { ...r, rate: e.target.value } : r))}/></label></fieldset>) : <label>{l('টাকা', 'रकम', 'Amount')}<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></label>}<label>{l('নোট', 'टिप्पणी', 'Note')}<input value={note} onChange={e => setNote(e.target.value)}/></label><button disabled={busy} type="button" onClick={() => { void correct(false); }}>{l('যাচাই ও সেভ', 'जाँचें और सहेजें', 'Review & save')}</button></>}<div className="books-buttons"><button disabled={busy} type="button" onClick={() => setEditing(true)}>{l('এডিট', 'बदलें', 'Edit')}</button><button disabled={busy} type="button" onClick={() => { void correct(true); }}>{l('ডিলিট', 'मिटाएँ', 'Delete')}</button></div></>}</dialog>;
}
