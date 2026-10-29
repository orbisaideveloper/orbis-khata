import {expect,it} from 'vitest';
import {ledgerRows} from './ledger-model';
import {currentEntries} from './current-entries';
import {expenseLedgerReport} from './expense-ledger';
import {moneyRows} from './overview-model';
import type {Report,Voucher} from './model';
import type {ExpenseReport,ExpenseEntry} from './expense-model';
const empty:Report={balances:{},ledger_balances:{},parties:[],entries:[],count:0,as_of:'2026-10-29'};
const expenses:ExpenseReport={balances:{},categories:[],bills:[],entries:[],count:0};
function trade(id:string,kind:Voucher['kind'],amount:number,extra:Partial<Voucher>={}):Voucher{
 const accounts={sale:['receivable','sales'],purchase:['purchases','payable'],receipt:['cash','receivable'],payment:['payable','cash'],reversal:['payable','purchases']} as const;
 return {id,kind,party_id:'p',party_name:'Party',effective_date:'2026-10-26',reference:'B1',note:'',reversed:false,reverses_id:null,amount_minor:String(amount),debit_account:accounts[kind][0],credit_account:accounts[kind][1],...extra};
}
it('reproduces owner screenshot and fixes 8660 gross bills to 6080 with 2580 paid and 3500 due',()=>{
 const entries=[trade('old','purchase',258000,{reversed:true}),trade('reverse','reversal',258000,{reverses_id:'old'}),trade('new','purchase',258000),trade('paid','payment',258000,{note:'Payment with bill'}),trade('b2','purchase',192000,{reference:'B2',effective_date:'2026-10-27'}),trade('b3','purchase',158000,{reference:'B3',effective_date:'2026-10-28'})];
 const result=ledgerRows({...empty,entries},'2026-10-01');expect(result.rows).toHaveLength(3);expect(result.bills).toBe(608000n);expect(result.payments).toBe(258000n);expect(result.closing).toBe(-350000n);expect(result.rows.find(r=>r.id==='new')).toMatchObject({paid:258000n,balance:0n});
});
for(const kind of ['sale','purchase'] as const){
 it(`${kind}: repeated corrections, deletion and linked settlement do not inflate statements`,()=>{
 const paymentKind=kind==='sale'?'receipt':'payment';const original=trade('old',kind,10000,{reversed:true});
 const reverse=trade('r','reversal',10000,{reverses_id:'old',debit_account:original.credit_account,credit_account:original.debit_account});
 const obsoletePay=trade('oldpay',paymentKind,2000,{reversed:true});
 const rp=trade('rp','reversal',2000,{reverses_id:'oldpay',debit_account:obsoletePay.credit_account,credit_account:obsoletePay.debit_account});
 const entries=[original,reverse,obsoletePay,rp,trade('final',kind,12000),trade('linked',paymentKind,3000,{bill_id:'final'}),trade('separate',paymentKind,1000,{reference:'B1',note:'Separate payment'})];
 const result=ledgerRows({...empty,entries},'2026-10-01');expect(result.rows).toHaveLength(2);expect(result.bills).toBe(12000n);expect(result.payments).toBe(4000n);expect(result.closing).toBe(kind==='sale'?8000n:-8000n);
 const allDeleted=entries.slice(0,4);expect(ledgerRows({...empty,entries:allDeleted},'2026-10-01')).toMatchObject({bills:0n,payments:0n,closing:0n});
 });
}
it('does not join ambiguous reference numbers or another party, but uses an explicit bill link',()=>{
 const entries=[trade('one','purchase',10000),trade('two','purchase',20000),trade('pay','payment',1000,{note:'Payment with bill'}),trade('other','payment',500,{party_id:'other',note:'Payment with bill'})];
 expect(ledgerRows({...empty,entries},'2026-10-01').rows).toHaveLength(4);entries[2].bill_id='two';const r=ledgerRows({...empty,entries},'2026-10-01');expect(r.rows).toHaveLength(3);expect(r.rows.find(row=>row.id==='two')?.paid).toBe(1000n);
});
it('restates opening when a prior-period record is reversed and preserves historical as-of records',()=>{
 const reverse=trade('r','reversal',10000,{reverses_id:'prior',debit_account:'payable',credit_account:'purchases'});
 const r=ledgerRows({...empty,ledger_balances:{payable:{opening:'-10000',closing:'0'}},entries:[reverse]},'2026-10-01');expect(r).toMatchObject({opening:0n,closing:0n,bills:0n});
 expect(currentEntries([trade('future-correction','purchase',10000,{reversed:true})],true)).toHaveLength(1);
 expect(currentEntries([{id:'legacy',kind:'purchase',reversed:true}])).toHaveLength(0);
});
it('cash/bank current movements discard reversed payments and corrections without double counting',()=>{
 const old=trade('old','payment',2000,{reversed:true});const entries=[old,trade('r','reversal',2000,{reverses_id:'old',debit_account:'cash',credit_account:'payable'}),trade('new','payment',3000)];
 const rows=moneyRows({...empty,entries},expenses,'cash');expect(rows).toHaveLength(1);expect(rows[0].amount).toBe('-3000');expect(moneyRows({...empty,entries},expenses,'bank')).toHaveLength(0);
});
it('expense cash bills show payment in the bill row; corrected credit bills and standalone payments reconcile',()=>{
 const cost=(id:string,kind:ExpenseEntry['kind'],amount:string,extra:Partial<ExpenseEntry>={}):ExpenseEntry=>({id,kind,amount,category:'Rent',payee:'Owner',method:null,effective_date:'2026-10-26',parent_id:null,reverses_id:null,reference:id,note:'',reversed:false,...extra});
 const rows=[cost('old','charge','10000',{reversed:true}),cost('r','reversal','10000',{reverses_id:'old'}),cost('new','charge','12000'),cost('pay','payment','3000',{method:'cash',parent_id:'new'}),cost('cash','charge','5000',{method:'cash'})];
 const r=ledgerRows(expenseLedgerReport(expenses,rows,[],9000n),'2026-10-01');expect(r.bills).toBe(17000n);expect(r.payments).toBe(8000n);expect(r.closing).toBe(-9000n);expect(r.rows).toHaveLength(3);
});
it('export totals and rows use the same effective statement with no duplicate bill',async()=>{
 const {ledgerWorkbook}=await import('./ledger-export');const {unzipSync,strFromU8}=await import('fflate');
 const entries=[trade('old','purchase',258000,{reversed:true}),trade('r','reversal',258000,{reverses_id:'old'}),trade('new','purchase',258000),trade('pay','payment',258000,{note:'Payment with bill'})];const result=ledgerRows({...empty,entries},'2026-10-01');
 const file=ledgerWorkbook({name:'Party',from:'2026-10-01',to:'2026-10-29',headings:['Bill','Paid'],rows:result.rows.map(r=>[r.bill.toString(),r.paid.toString()]),opening:result.opening.toString(),totals:[result.bills.toString(),result.payments.toString(),result.closing.toString()]});
 const sheet=strFromU8(unzipSync(file)['xl/worksheets/sheet1.xml']);expect(result.rows).toHaveLength(1);expect(sheet).not.toContain('516000');expect(result).toMatchObject({bills:258000n,payments:258000n,closing:0n});
});
