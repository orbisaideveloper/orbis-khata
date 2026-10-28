import type { Report, Voucher } from './model';
export type LedgerRow = { id: string; date: string; reference: string; kind: string; description: string; bill: bigint; paid: bigint; balance: bigint; voucher?: Voucher };
function signedAmount(row:Voucher) {
 const relevant=(account:string)=>['receivable','payable'].includes(account);
 return (relevant(row.debit_account)?BigInt(row.amount_minor):0n)-(relevant(row.credit_account)?BigInt(row.amount_minor):0n);
}
function voucherRow(row:Voucher):LedgerRow {
 const isBill=row.kind==='sale'||row.kind==='purchase', amount=BigInt(row.amount_minor);
 return {id:row.id,date:row.effective_date,reference:row.reference,kind:row.kind,description:row.note,bill:isBill?amount:0n,paid:!isBill&&row.kind!=='reversal'?amount:0n,balance:signedAmount(row),voucher:row};
}
function openingRows(data:Report,from:string):LedgerRow[] {
 return (data.opening_entries??[]).filter(entry=>entry.date>=from).map(entry=>{
  const party=data.parties.find(p=>p.id===entry.party_id), sign=(party?.kind==='supplier'?-1n:1n)*(entry.side==='advance'?-1n:1n);
  return {id:entry.id,date:entry.date,reference:'',kind:'opening',description:entry.side,bill:0n,paid:0n,balance:sign*BigInt(entry.amount)};
 });
}
export function ledgerRows(data:Report,from:string) {
 const opening=BigInt(data.ledger_balances.receivable?.opening??'0')+BigInt(data.ledger_balances.payable?.opening??'0');
 const rows=[...data.entries.map(voucherRow),...openingRows(data,from)].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 let current=opening,bills=0n,payments=0n;
 for(const row of rows){current+=row.balance;row.balance=current;bills+=row.bill;payments+=row.paid;}
 return {rows,opening,closing:current,bills,payments};
}
