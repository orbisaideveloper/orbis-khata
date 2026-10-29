import {currentEntries} from './current-entries';
import type { Report, Voucher } from './model';
export type LedgerRow = {
    id: string;
    date: string;
    reference: string;
    kind: string;
    description: string;
    bill: bigint;
    paid: bigint;
    balance: bigint;
    voucher?: Voucher;
};
function signedAmount(row: Voucher) {
    const relevant = (account: string) => ['receivable', 'payable'].includes(account);
    return (relevant(row.debit_account) ? BigInt(row.amount_minor) : 0n) - (relevant(row.credit_account) ? BigInt(row.amount_minor) : 0n);
}
function voucherRow(row: Voucher): LedgerRow {
    const isBill = row.kind === 'sale' || row.kind === 'purchase', amount = BigInt(row.amount_minor);
    return { id: row.id, date: row.effective_date, reference: row.reference, kind: row.kind, description: row.note, bill: isBill ? amount : 0n, paid: isBill ? BigInt(row.settled_minor??'0') : amount, balance: signedAmount(row), voucher: row };
}
function openingRows(data: Report, from: string): LedgerRow[] {
    return (data.opening_entries ?? []).filter(entry => entry.date >= from).map(entry => {
        const party = data.parties.find(p => p.id === entry.party_id), sign = (party?.kind === 'supplier' ? -1n : 1n) * (entry.side === 'advance' ? -1n : 1n);
        return { id: entry.id, date: entry.date, reference: '', kind: 'opening', description: entry.side, bill: 0n, paid: 0n, balance: sign * BigInt(entry.amount) };
    });
}
function billForPayment(payment:Voucher, bills:Voucher[]){
 if(payment.bill_id)return bills.find(b=>b.id===payment.bill_id);
 if(payment.note!=='Payment with bill')return undefined;
 const candidates=bills.filter(b=>b.party_id===payment.party_id&&b.reference===payment.reference&&b.effective_date===payment.effective_date&&((b.kind==='purchase'&&payment.kind==='payment')||(b.kind==='sale'&&payment.kind==='receipt')));
 return candidates.length===1?candidates[0]:undefined;
}
export function ledgerRows(data: Report, from: string) {
 const current=currentEntries(data.entries,true), bills=current.filter(v=>v.kind==='sale'||v.kind==='purchase');
 const merged=new Map<string,LedgerRow>();
 for(const entry of current){merged.set(entry.id,voucherRow(entry));}
 for(const payment of current.filter(v=>v.kind==='payment'||v.kind==='receipt')){
  const bill=billForPayment(payment,bills);if(!bill)continue;
  const target=merged.get(bill.id)!;target.paid+=BigInt(payment.amount_minor);target.balance+=signedAmount(payment);merged.delete(payment.id);
 }
 const openings=openingRows(data,from);
 const rows=[...merged.values(),...openings].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const rawOpening=BigInt(data.ledger_balances.receivable?.opening??'0')+BigInt(data.ledger_balances.payable?.opening??'0');
 const rawMovement=data.entries.reduce((sum,v)=>sum+signedAmount(v),0n);
 const activeMovement=current.reduce((sum,v)=>sum+signedAmount(v),0n);
 // Reversals of entries preceding the selected period restate the opening,
 // keeping the current statement reconciled with the immutable journal.
 const opening=rawOpening+rawMovement-activeMovement;
 let closing=opening,totalBills=0n,payments=0n;
 for(const row of rows){closing+=row.balance;row.balance=closing;totalBills+=row.bill;payments+=row.paid;}
 return {rows,opening,closing,bills:totalBills,payments};
}
