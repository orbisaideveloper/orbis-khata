import type { ExpenseEntry, ExpenseReport } from './expense-model';
import type { Report, Voucher } from './model';
export function expenseLedgerReport(_expenses: ExpenseReport, entries: ExpenseEntry[], parties: Report['parties'], due = 0n): Report {
    function pair(row: ExpenseEntry): [
        Voucher['debit_account'],
        Voucher['credit_account']
    ] {
        if (row.kind === 'charge') {
            return ['purchases', row.method ?? 'payable'];
        }
        return ['payable', row.method ?? 'cash'];
    }
    const vouchers: Voucher[] = entries.map(row => {
        let accounts = pair(row);
        if (row.kind === 'reversal') {
            const old = entries.find(e => e.id === (row.reverses_id ?? row.parent_id));
            if (old) {
                const original = pair(old);
                accounts = [original[1], original[0]];
            }
        }
        return { id: row.id, party_id: '', party_name: row.payee, kind: row.kind === 'charge' ? 'purchase' : row.kind, effective_date: row.effective_date, amount_minor: row.amount, debit_account: accounts[0], credit_account: accounts[1], reference: row.reference, note: [row.note, ...(row.bill_lines ?? []).map(l => l.description)].filter(Boolean).join(' · '), reversed: row.reversed, reverses_id: row.reverses_id, settled_minor: row.kind==='charge'&&row.method?row.amount:'0' };
    });
    const movement = vouchers.reduce((sum, v) => sum + (v.debit_account === 'payable' ? BigInt(v.amount_minor) : 0n) - (v.credit_account === 'payable' ? BigInt(v.amount_minor) : 0n), 0n);
    return { balances: {}, ledger_balances: { payable: { opening: String(-due - movement), closing: String(-due) } }, parties, entries: vouchers, count: vouchers.length, as_of: '' };
}
