import {ledgerRows} from './ledger-model';
import {moneyRows,overviewAmount} from './overview-model';
import { beforeEach, expect, it } from 'vitest';
import { defaultSettings, validSettings, workspaceInput } from './workspace-contract';
import { demoRequest, resetDemo, saveDemoItem, saveDemoParty } from '../demo/store';
import { emptyPartyDetails } from '../demo/master-model';
import type { InventoryCommand, InventoryReport } from '../inventory/model';
import type { Report } from './model';
const company = '11111111-1111-4111-8111-111111111111', warehouse = '22222222-2222-4222-8222-222222222222', party = '33333333-3333-4333-8333-333333333333', item = '44444444-4444-4444-8444-444444444444';
const range = { company, from: '2026-01-01', to: '2026-12-31', party: null, offset: 0 };
function bill(kind: 'sale' | 'purchase' = 'purchase'): InventoryCommand { return { id: crypto.randomUUID(), company, kind, date: '2026-10-20', code: '', name: '', unit: '', party, reference: 'B1', note: '', lines: [{ item, warehouse, to: null, quantity: '2000000', rate: '100000', unit_rate: '1000' }] }; }
const req = (input: Record<string, unknown>) => demoRequest<any>('workspace', { company, ...input });
beforeEach(() => { resetDemo(); saveDemoParty({ id: party, company, name: 'Trader', kind: 'both', receivable: '0', payable: '0', ...emptyPartyDetails }); saveDemoItem({ id: item, company, name: 'Milk', code: 'M', unit: 'litre', default_rate: null }); });
it('validates each bounded operation and rejects forged, malformed or excessive settings', () => {
    const settings = defaultSettings();
    expect(validSettings(settings)).toBe(true);
    expect(validSettings(null)).toBe(false);
    expect(validSettings({ ...settings, accounts: [] })).toBe(false);
    expect(validSettings({ ...settings, accounts: [settings.accounts[0], settings.accounts[0]] })).toBe(false);
    expect(validSettings({ ...settings, next: { ...settings.next, sale: '0' } })).toBe(false);
    for (const input of [{ action: 'settings' }, { action: 'accounts' }, { action: 'settings-save', settings }, { action: 'number', id: crypto.randomUUID(), kind: 'sale' }, { action: 'detail', id: party }, { action: 'retire', name: 'Shop' }, { action: 'restore', name: 'Shop' }, { action: 'bill', bill: bill(), paid: '0', account: 'cash', roundoff: '0' }, { action: 'payment', id: crypto.randomUUID(), party, kind: 'receipt', date: '2026-10-20', amount: '10', account: 'cash', reference: '', note: '' }, { action: 'correct', id: crypto.randomUUID(), target: party, type: 'voucher', reason: 'Wrong', replacement: null }]) {
        expect(workspaceInput({ company, ...input })).toBe(true);
    }
    for (const input of [{ action: 'unknown' }, { action: 'settings', extra: true }, { action: 'bill', bill: bill(), paid: '-1', account: 'cash', roundoff: '0' }, { action: 'correct', id: party, target: item, type: 'voucher', reason: '', replacement: null }, { action: 'detail', id: 'bad' }]) {
        expect(workspaceInput({ company, ...input })).toBe(false);
    }
    expect(workspaceInput({ company: 'forged', action: 'settings' })).toBe(false);
});
it('posts historical negative-stock sales, partial cash purchases and exact retries atomically', async () => {
    const purchase = bill(), p = { action: 'bill', bill: purchase, paid: '100000', account: 'cash', roundoff: '0' };
    const first = await req(p);
    expect(first.due).toBe('100000');
    expect(await req(p)).toEqual(first);
    await expect(req({ ...p, paid: '50000' })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    const sale = { ...bill('sale'), date: '2026-10-10', lines: [{ ...purchase.lines[0], quantity: '3000000' }] };
    await req({ action: 'bill', bill: sale, paid: '0', account: 'bank', roundoff: '0' });
    const inventory = await demoRequest<InventoryReport>('inventory-report', range);
    expect(inventory.stocks[0].closing).toBe('-1000000');
    const r = await demoRequest<Report>('report', range);
    expect(r.balances.cash?.closing).toBe('-100000');
    expect(r.entries).toHaveLength(3);
    const invalid = { action: 'bill', bill: bill(), paid: '999999', account: 'cash', roundoff: '0' };
    await expect(req(invalid)).rejects.toThrow('SETTLEMENT_EXCEEDS_BILL');
    expect((await demoRequest<InventoryReport>('inventory-report', range)).documents).toHaveLength(2);
    await expect(req({ ...p, bill: bill(), account: 'missing' })).rejects.toThrow('PAYMENT_ACCOUNT_REQUIRED');
});
it('keeps numbering per company/kind, preserves retries and supports configured payment accounts', async () => {
    const id = crypto.randomUUID();
    expect(await req({ action: 'number', id, kind: 'sale' })).toBe('S-1');
    expect(await req({ action: 'number', id, kind: 'sale' })).toBe('S-1');
    expect(await req({ action: 'number', id: crypto.randomUUID(), kind: 'sale' })).toBe('S-2');
    const settings = defaultSettings();
    settings.accounts.push({ id: 'bank-two', name: 'Second bank', kind: 'bank', channel: 'GPay', active: true });
    settings.numbering.purchase = 'FY26/';
    settings.next.purchase = '101';
    await req({ action: 'settings-save', settings });
    expect((await req({ action: 'settings' })).accounts).toHaveLength(3);
    expect(await req({ action: 'number', id: crypto.randomUUID(), kind: 'purchase' })).toBe('FY26/101');
    const idp = crypto.randomUUID();
    await req({ action: 'payment', id: idp, party, kind: 'receipt', date: '2026-10-20', amount: '10000', account: 'bank-two', reference: 'R1', note: 'Advance' });
    const accounts = await req({ action: 'accounts' });
    expect(accounts.find((a: any) => a.id === 'bank-two').balance).toBe('10000');
    expect(accounts.find((a: any) => a.id === 'bank').balance).toBe('0');
    expect((await req({ action: 'detail', id: idp })).voucher.reference).toBe('R1');
});
it('reverses bill, linked settlement and stock once; edit replacement is atomic; preserves other records', async () => {
    const original = bill();
    await req({ action: 'bill', bill: original, paid: '100000', account: 'cash', roundoff: '0' });
    const detail = await req({ action: 'detail', id: original.id });
    expect(detail.bill.id).toBe(original.id);
    expect(detail.payments).toHaveLength(1);
    const replacement = { action: 'bill', company, bill: { ...bill(), lines: [{ ...original.lines[0], quantity: '1000000' }] }, paid: '50000', account: 'bank', roundoff: '0' };
    const correction = { action: 'correct', id: crypto.randomUUID(), target: original.id, type: 'voucher', reason: 'Edited', replacement };
    await req(correction);
    await req(correction);
    const r = await demoRequest<Report>('report', range);
    expect(r.balances.cash?.closing).toBe('0');
    expect(r.balances.bank?.closing).toBe('-50000');
    expect(r.balances.payable?.closing).toBe('-50000');
    const statement=ledgerRows(r,range.from);expect(statement.rows).toHaveLength(1);expect(statement).toMatchObject({bills:100000n,payments:50000n,closing:-50000n});
    const noCosts={balances:{},categories:[],bills:[],entries:[],count:0};expect(overviewAmount(r,noCosts,'payable')).toBe(50000n);expect(overviewAmount(r,noCosts,'receivable')).toBe(0n);expect((await demoRequest<InventoryReport>('inventory-report',range)).stocks[0].closing).toBe('1000000');expect(moneyRows(r,noCosts,'cash')).toHaveLength(0);expect(moneyRows(r,noCosts,'bank').map(row=>row.amount)).toEqual(['-50000']);
    await expect(req({ ...correction, id: crypto.randomUUID() })).rejects.toThrow('RECORD_ALREADY_CORRECTED');
    const target = replacement.bill.id;
    await expect(req({ action: 'correct', id: crypto.randomUUID(), target, type: 'voucher', reason: 'Bad edit', replacement: { ...replacement, bill: bill(), paid: '999999' } })).rejects.toThrow();
    expect((await req({ action: 'detail', id: target })).voucher.reversed).toBe(false);
    await req({ action: 'correct', id: crypto.randomUUID(), target, type: 'voucher', reason: 'Delete', replacement: null });
    const deleted=await demoRequest<Report>('report',range);expect(deleted.balances.payable?.closing).toBe('0');expect(ledgerRows(deleted,range.from)).toMatchObject({rows:[],bills:0n,payments:0n,closing:0n});
});
it('retires and restores companies without touching another tenant', async () => {
    await expect(req({ action: 'retire', name: 'wrong' })).rejects.toThrow();
    await req({ action: 'retire', name: 'ডেমো দোকান' });
    expect(await demoRequest('companies', {})).toEqual([]);
    expect((await demoRequest<any[]>('retired-companies', {}))[0].id).toBe(company);
    await req({ action: 'restore', name: 'ডেমো দোকান' });
    expect((await demoRequest<any[]>('companies', {}))).toHaveLength(1);
    await expect(demoRequest('workspace', { company: crypto.randomUUID(), action: 'settings' })).rejects.toThrow('COMPANY_NOT_ACCESSIBLE');
});
it('corrects expense bills and their linked payments atomically',async()=>{const id=crypto.randomUUID(),command={id,company,date:'2026-10-20',kind:'charge',amount:'10000',category:'Power',payee:'Power',method:null,parent:null,reference:'E1',note:''};await demoRequest('expense-post',command);await demoRequest('expense-post',{...command,id:crypto.randomUUID(),kind:'payment',amount:'4000',method:'bank',parent:id});const replacementId=crypto.randomUUID();const replacement={company,action:'expense',id:replacementId,command:{...command,id:replacementId,amount:'8000'},lines:[{description:'Power',quantity:'1000000',unit:'',rate:'8000',unit_rate:'80'}]};expect(workspaceInput(replacement)).toBe(true);await req({action:'correct',id:crypto.randomUUID(),target:id,type:'expense',reason:'Correct power',replacement});const expenses=await demoRequest<any>('expense-report',range);expect(expenses.bills).toHaveLength(1);expect(expenses.bills[0].due).toBe('8000');await expect(req({action:'correct',id:crypto.randomUUID(),target:id,type:'expense',reason:'Again',replacement:null})).rejects.toThrow('RECORD_ALREADY_CORRECTED');await expect(req({...replacement,id:crypto.randomUUID(),command:{...replacement.command,id:crypto.randomUUID(),amount:'1'}})).rejects.toThrow('INVALID_EXPENSE_TOTAL');});
it('rejects unsafe settings and mutation fields without changing valid settings',()=>{const s=defaultSettings();for(const bad of [{...s,accounts:[...s.accounts,{id:'x',name:'',kind:'bank',channel:'',active:true}]},{...s,accounts:[...s.accounts,{id:'x',name:'Name',kind:'other',channel:'',active:true}]},{...s,numbering:{...s.numbering,sale:'<unsafe>'}},{...s,next:{...s.next,sale:'100000000'}}])expect(validSettings(bad)).toBe(false);expect(workspaceInput({company,action:'payment',id:party,party,kind:'receipt',date:'bad',amount:'1',account:'cash',reference:'',note:''})).toBe(false);expect(workspaceInput({company,action:'accounts',from:'2026-10-01',to:'2026-10-28'})).toBe(true);});
it('edits a used party opening balance without losing bills, payments or changing account identity',async()=>{const original=bill();await req({action:'bill',bill:original,paid:'10000',account:'cash',roundoff:'0'});const {demoMasters}=await import('../demo/store');const partyRow=demoMasters(company).parties.find(p=>p.id===party)!;saveDemoParty({...partyRow,opening_side:'due',opening_amount:'650000',opening_date:'2026-10-01'});const report=await demoRequest<Report>('report',range);expect(report.entries.filter(v=>v.kind==='purchase')).toHaveLength(1);expect(report.parties.find(p=>p.id===party)?.receivable).toBe('650000');expect(report.parties.find(p=>p.id===party)?.payable).toBe('190000');expect(()=>saveDemoParty({...partyRow,kind:'supplier'})).toThrow('OPENING_ALREADY_USED');});
