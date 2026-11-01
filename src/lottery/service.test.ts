import {savePartyOpening} from './party-opening';
// @vitest-environment node
import {beforeEach,expect,it} from 'vitest';
import {runLottery,lotteryInput,type LotteryInput} from './service';
let state:unknown;const owner='11111111-1111-7111-8111-111111111111';
const now=()=>new Date('2026-10-30T10:00:00Z');
async function run(method:string,payload:Record<string,unknown>={}){
 const answer=await runLottery(state,{method,payload,operationId:crypto.randomUUID()},owner,now);
 const persisted=structuredClone(state) as Record<string,Record<string,unknown>[]>;
 for(const change of answer.changes){
  const rows=persisted[change.model]??=[];
  const index=rows.findIndex(row=>row.id===change.id);
  if(change.value===null){if(index>=0)rows.splice(index,1);}
  else if(index>=0)rows[index]=change.value;else rows.push(change.value);
 }
 const populated=(value:Record<string,unknown[]>)=>Object.fromEntries(Object.entries(value).filter(([,rows])=>rows.length));
 expect(populated(persisted)).toEqual(populated(answer.state));
 state=JSON.parse(JSON.stringify(persisted));return answer.result;
}
beforeEach(()=>{state={};});
async function fixture(){const organization=await run('createOrganization',{name:'Independent lottery'});const org=organization.id;const stockist=await run('createParty',{organizationId:org,name:'Stockist',partyType:'STOCKIST',ticketRatePaise:'900'});const seller=await run('createParty',{organizationId:org,name:'Seller',partyType:'SELLER',ticketRatePaise:'1000'});const customer=await run('createParty',{organizationId:org,name:'Customer',partyType:'CUSTOMER'});return {org,stockist,seller,customer};}
it('keeps exact Foundation formulas across independent durable snapshot round trips',async()=>{const {org,stockist,seller}=await fixture();await run('saveDailyStockistEntry',{organizationId:org,partyId:stockist.id,occurredAt:'2026-10-30',purchaseQuantity:'100',morningReturnQuantity:'0',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'4000'});const sale=await run('recordSale',{organizationId:org,partyId:seller.id,occurredAt:'2026-10-30',dispatchQuantity:'100',morningReturnQuantity:'5',dayReturnQuantity:'10',eveningReturnQuantity:'5',commissionPaise:'4000'});expect(sale.calculated).toMatchObject({grossSalesPaise:'80000',commissionPaise:'4000',tdsPaise:'80',netPayablePaise:'76080'});state=JSON.parse(JSON.stringify(state));const workspace=await run('getWorkspace',{organizationId:org});expect(workspace.sales).toHaveLength(1);expect(workspace.stockistEntries).toHaveLength(1);expect(workspace.summary.verified).toBe(true);expect(workspace.summary.netPayablePaise).toBe('76080');expect(await run('listOrganizations')).toHaveLength(1);});
it('supports seller drafts/version conflicts, posting, split payments and settlement',async()=>{const {org,seller,stockist}=await fixture();await run('saveDailyStockistEntry',{organizationId:org,partyId:stockist.id,occurredAt:'2026-10-30',purchaseQuantity:'20',morningReturnQuantity:'0',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'0'});const input={organizationId:org,partyId:seller.id,occurredAt:'2026-10-30',dispatchQuantity:'10',morningReturnQuantity:'0',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'0',operationId:'draft-create',expectedVersion:0};const ack=await run('createDailySellerDraft',input);expect(ack.sale.status).toBe('DRAFT');const changed=await run('updateDailySellerDraft',{...input,saleId:ack.sale.id,dispatchQuantity:'12',operationId:'draft-update',expectedVersion:ack.sale.syncVersion});expect(changed.sale.syncVersion).toBe(2);const before=JSON.stringify(state);await expect(run('updateDailySellerDraft',{...input,saleId:ack.sale.id,operationId:'conflict',expectedVersion:1})).rejects.toThrow('SELLER_DRAFT_CONFLICT');expect(JSON.stringify(state)).toBe(before);await run('postDailySellerDraft',{organizationId:org,saleId:ack.sale.id});const payment=await run('recordPayment',{organizationId:org,partyId:seller.id,occurredAt:'2026-10-30',direction:'RECEIPT',totalAmountPaise:'5000',methodSplit:{cashPaise:'2000',bankPaise:'2000',pwtPaise:'1000'}});await run('recordSettlement',{organizationId:org,saleId:ack.sale.id,paymentId:payment.payment.id,amountPaise:'5000'});const w=await run('getWorkspace',{organizationId:org});expect(w.sales[0].outstandingPaise).toBe('7000');expect(w.summary.methodBalances).toMatchObject({cashPaise:'2000',bankPaise:'2000',pwtPaise:'1000'});});
it('supports customer bills, recurring expense profiles and a fully separate organization',async()=>{const {org,customer}=await fixture();await run('recordCustomerBill',{organizationId:org,partyId:customer.id,occurredAt:'2026-10-30',quantity:'2',unitRatePaise:'1000',receivedPaise:'1000'});const category=await run('createExpenseCategory',{organizationId:org,name:'Salary'});await run('createExpenseProfile',{organizationId:org,categoryId:category.id,name:'Worker',usualAmountPaise:'500',scheduleType:'MONTHLY'});const w=await run('getWorkspace',{organizationId:org});expect(w.customerBills).toHaveLength(1);expect(w.expenseBills).toHaveLength(1);const other=await run('createOrganization',{name:'Other company'});expect((await run('getWorkspace',{organizationId:other.id})).sales).toEqual([]);await expect(run('createParty',{organizationId:'foreign',name:'Bad',partyType:'SELLER'})).rejects.toThrow('ORGANIZATION_NOT_FOUND');});
it('validates operation envelopes and preserves independent cloud/device storage preferences',async()=>{expect(lotteryInput({method:'listOrganizations',payload:{}})).toBe(true);for(const value of [{method:'deleteEverything',payload:{}},{method:'createOrganization',payload:{}},{method:'listOrganizations',payload:null},{method:'listOrganizations',payload:{},owner:'forged'}])expect(lotteryInput(value)).toBe(false);await expect(runLottery({}, {method:'badMethod',payload:{}} as LotteryInput,owner,now)).rejects.toThrow('LOTTERY_INPUT_INVALID');const org=await run('createOrganization',{name:'Storage preference'});await run('updateUserLedgerStorage',{organizationId:org.id,userLedgerStorage:'DEVICE'});expect((await run('getWorkspace',{organizationId:org.id})).organization.userLedgerStorage).toBe('DEVICE');});
it('keeps stockist corrections and double-confirmed void effects in independent audit history',async()=>{const {org,stockist}=await fixture();await run('saveDailyStockistEntry',{organizationId:org,partyId:stockist.id,occurredAt:'2026-10-30',purchaseQuantity:'100',morningReturnQuantity:'0',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'4000'});const w=await run('getWorkspace',{organizationId:org}),entry=w.stockistEntries[0];await run('correctAccountingTransaction',{organizationId:org,entityType:'STOCKIST_ENTRY',entityId:entry.id,operationId:'correct-stockist',expectedVersion:0,replacement:{purchaseQuantity:'120',commissionPaise:'3000'},reason:'Fix quantity'});const corrected=await run('getWorkspace',{organizationId:org});expect(corrected.stockistEntries[0].purchaseQuantity).toBe('120');const preview=await run('previewAccountingVoid',{organizationId:org,entityType:'STOCKIST_ENTRY',entityId:entry.id});expect(preview.effects.transactions).toBeGreaterThan(0);await run('voidAccountingTransaction',{organizationId:org,entityType:'STOCKIST_ENTRY',entityId:entry.id,operationId:'void-stockist',previewToken:preview.previewToken});const final=await run('getWorkspace',{organizationId:org});expect(final.stockistEntries).toEqual([]);expect(final.auditEvents.length).toBeGreaterThan(w.auditEvents.length);});
it('persists and edits opening balances with balanced reversal history, no invented cash or sales',async()=>{
 const {org,seller,stockist}=await fixture();
 async function opening(party:any,amount:string,date='2026-10-29'){return run('updatePartyProfile',{organizationId:org,partyId:party.id,name:party.name,ticketRatePaise:party.ticketRatePaise,openingBalancePaise:amount,openingBalanceDate:date});}
 expect(await opening(seller,'650000')).toMatchObject({openingBalancePaise:'650000',openingBalanceDate:'2026-10-29'});
 await opening(stockist,'250000');
 let w=await run('getWorkspace',{organizationId:org});expect(w.sales).toEqual([]);expect(w.payments).toEqual([]);expect(w.summary.methodBalances.cashPaise).toBe('0');
 const balanced=(rows:any[])=>rows.reduce((sum,row)=>sum+(row.side==='DEBIT'?1n:-1n)*BigInt(row.amountPaise),0n);
 expect(balanced(w.ledgerEntries)).toBe(0n);
 await opening(seller,'-10000','2026-10-28');
 w=await run('getWorkspace',{organizationId:org});expect(w.parties.find((p:any)=>p.id===seller.id)).toMatchObject({openingBalancePaise:'-10000',openingBalanceDate:'2026-10-28'});
 expect(balanced(w.ledgerEntries)).toBe(0n);
 expect(w.ledgerEntries.filter((r:any)=>r.accountCode==='PARTY_RECEIVABLE').reduce((sum:bigint,r:any)=>sum+(r.side==='DEBIT'?1n:-1n)*BigInt(r.amountPaise),0n)).toBe(-10000n);
 const count=w.ledgerEntries.length;await opening(seller,'-10000','2026-10-28');expect((await run('getWorkspace',{organizationId:org})).ledgerEntries).toHaveLength(count);
 await opening(seller,'0');expect((await run('getWorkspace',{organizationId:org})).parties.find((p:any)=>p.id===seller.id).openingBalancePaise).toBe('0');
 state=JSON.parse(JSON.stringify(state));expect((await run('getWorkspace',{organizationId:org})).parties.find((p:any)=>p.id===stockist.id).openingBalancePaise).toBe('250000');
});
it('rejects invalid or cross-company opening balances atomically and preserves old profiles',async()=>{
 const {org,seller}=await fixture();const before=JSON.stringify(state);
 for(const [amount,date] of [['1.50','2026-10-29'],['100','2026-02-30'],['100','bad'],['100',''],['1000000000000000','2026-10-29']]){
  await expect(run('createParty',{organizationId:org,name:'Invalid',partyType:'SELLER',openingBalancePaise:amount,openingBalanceDate:date})).rejects.toThrow('INVALID_OPENING_BALANCE');expect(JSON.stringify(state)).toBe(before);
 }
 const other=await run('createOrganization',{name:'Other'});const snapshot=JSON.stringify(state);
 await expect(run('updatePartyProfile',{organizationId:other.id,partyId:seller.id,name:'Wrong',openingBalancePaise:'100',openingBalanceDate:'2026-10-29'})).rejects.toThrow();expect(JSON.stringify(state)).toBe(snapshot);
});

it('defends the opening writer against absent or foreign party records',async()=>{
 const input={organizationId:'org',openingBalancePaise:'100',openingBalanceDate:'2026-10-30'};
 for(const party of [null,{organizationId:'foreign'}]){
  const client={foundationAccountingParty:{findUnique:()=>Promise.resolve(party)}};
  await expect(savePartyOpening(client,'missing',input,owner)).rejects.toThrow('PARTY_NOT_FOUND');
 }
});
it('applies scheduled TDS on seller and stockist dates while preserving prior saved snapshots',async()=>{const {org,stockist,seller}=await fixture();const row={organizationId:org,partyId:stockist.id,purchaseQuantity:'100',morningReturnQuantity:'0',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'10000'};await run('saveDailyStockistEntry',{...row,occurredAt:'2026-10-30'});await run('updateOrganizationTdsRate',{organizationId:org,tdsRateBps:300,effectiveFrom:'2026-10-31'});await run('saveDailyStockistEntry',{...row,occurredAt:'2026-10-31'});const sale={organizationId:org,partyId:seller.id,dispatchQuantity:'10',morningReturnQuantity:'0',dayReturnQuantity:'0',eveningReturnQuantity:'0',commissionPaise:'1000'};expect((await run('recordSale',{...sale,occurredAt:'2026-10-30'})).calculated.tdsPaise).toBe('20');expect((await run('recordSale',{...sale,occurredAt:'2026-10-31'})).calculated.tdsPaise).toBe('30');state=JSON.parse(JSON.stringify(state));const w=await run('getWorkspace',{organizationId:org});expect(w.stockistEntries.map((r:any)=>r.tdsRateBps).sort()).toEqual([200,300]);expect(w.organization.tdsRules).toEqual([{from:'2026-10-31',rateBps:300}]);const before=JSON.stringify(state);await expect(run('updateOrganizationTdsRate',{organizationId:org,effectiveFrom:'2026-02-30',tdsRateBps:200})).rejects.toThrow();expect(JSON.stringify(state)).toBe(before);await expect(run('updateOrganizationPreferences',{organizationId:'missing',paymentOptions:{upi:false,cheque:false,bankChannels:[]}})).rejects.toThrow();});
it('persists named bank receipt folders without double-counting balances and rejects unknown folders',async()=>{const {org,seller}=await fixture();await run('updateOrganizationPreferences',{organizationId:org,paymentOptions:{upi:false,cheque:false,bankChannels:['GPay']}});const input={organizationId:org,partyId:seller.id,occurredAt:'2026-10-30',direction:'RECEIPT',totalAmountPaise:'10000',methodSplit:{bankPaise:'10000'},bankChannel:'GPay'};await run('recordPayment',input);const w=await run('getWorkspace',{organizationId:org});expect(w.payments[0].bankChannel).toBe('GPay');expect(w.summary.methodBalances.bankPaise).toBe('10000');await expect(run('recordPayment',{...input,bankChannel:'Unknown'})).rejects.toThrow();await run('updateOrganizationPreferences',{organizationId:org,paymentOptions:{upi:false,cheque:false,bankChannels:[]}});expect((await run('getWorkspace',{organizationId:org})).payments[0].bankChannel).toBe('GPay');});
it('rejects missing organization settings and non-text bank folder metadata without changing records',async()=>{const {org,seller}=await fixture();const before=JSON.stringify(state);await expect(run('updateOrganizationPreferences',{paymentOptions:{upi:false,cheque:false,bankChannels:[]}})).rejects.toThrow('ORGANIZATION_NOT_FOUND');await expect(run('recordPayment',{organizationId:org,partyId:seller.id,direction:'RECEIPT',occurredAt:'2026-10-30',totalAmountPaise:'100',methodSplit:{bankPaise:'100'},bankChannel:123})).rejects.toThrow('INVALID_BANK_CHANNEL');expect(JSON.stringify(state)).toBe(before);});

it('links historical expense dues to the profile and payment ledger without re-expensing them',async()=>{
 const {org,seller}=await fixture();
 const category=await run('createExpenseCategory',{organizationId:org,name:'Home'});
 const profile=await run('createExpenseProfile',{organizationId:org,categoryId:category.id,name:'Worker',usualAmountPaise:'0',scheduleType:'ONE_TIME',openingBalancePaise:'100000',openingBalanceDate:'2026-10-29'});
 expect(profile).toMatchObject({openingBalancePaise:'100000',openingBalanceDate:'2026-10-29'});
 const {lotteryExpenseOutstanding}=await import('../../vendor/foundation-lottery/src/admin/models/lotteryAccountingExpenseBalance');
 let w=await run('getWorkspace',{organizationId:org});
 expect(lotteryExpenseOutstanding(w,profile.id,'2026-10-28')).toBe(0n);
 expect(lotteryExpenseOutstanding(w,profile.id,'2026-10-30')).toBe(100000n);
 expect(w.summary).toMatchObject({expensePaise:'0',operatingResultPaise:'0',netCashFlowPaise:'0'});
 expect(w.expenseBills).toEqual([]);
 expect(w.ledgerEntries.filter((row:any)=>row.sourceType==='EXPENSE_OPENING')).toHaveLength(2);
 await run('recordPayment',{organizationId:org,partyId:seller.id,direction:'RECEIPT',occurredAt:'2026-10-30',totalAmountPaise:'200000',methodSplit:{cashPaise:'200000'}});
 await run('recordExpensePayment',{organizationId:org,profileId:profile.id,occurredAt:'2026-10-30',totalAmountPaise:'50000',cashPaise:'50000',bankPaise:'0'});
 w=await run('getWorkspace',{organizationId:org});
 expect(lotteryExpenseOutstanding(w,profile.id,'2026-10-30')).toBe(50000n);
 expect(w.summary).toMatchObject({expensePaise:'50000',operatingResultPaise:'-50000'});
 const update={organizationId:org,profileId:profile.id,categoryId:category.id,name:'Worker',usualAmountPaise:'0',scheduleType:'ONE_TIME',openingBalancePaise:'150000',openingBalanceDate:'2026-10-29'};
 await run('updateExpenseProfile',update);w=await run('getWorkspace',{organizationId:org});
 expect(lotteryExpenseOutstanding(w,profile.id,'2026-10-30')).toBe(100000n);
 const count=w.ledgerEntries.length;
 await run('updateExpenseProfile',update);w=await run('getWorkspace',{organizationId:org});expect(w.ledgerEntries).toHaveLength(count);
 expect(w.expensePayments).toHaveLength(1);
 const rows=w.ledgerEntries;
 expect(rows.reduce((sum:bigint,row:any)=>sum+(row.side==='DEBIT'?1n:-1n)*BigInt(row.amountPaise),0n)).toBe(0n);
 const withoutOpening={...update} as Record<string,unknown>;delete withoutOpening.openingBalancePaise;delete withoutOpening.openingBalanceDate;
 await run('updateExpenseProfile',withoutOpening);expect((await run('getWorkspace',{organizationId:org})).expenseProfiles[0].openingBalancePaise).toBe('150000');
 await expect(run('recordExpensePayment',{organizationId:org,profileId:profile.id,occurredAt:'2026-10-28',totalAmountPaise:'1',cashPaise:'1',bankPaise:'0'})).rejects.toThrow('INVALID_PAYMENT');
});

it('carries historical expense advances into future bills, preserves zero/legacy and rejects invalid or foreign openings',async()=>{
 const {org,seller}=await fixture();
 const category=await run('createExpenseCategory',{organizationId:org,name:'Other'});
 const input={organizationId:org,categoryId:category.id,name:'Advance',usualAmountPaise:'0',scheduleType:'ONE_TIME'};
 const before=JSON.stringify(state);
 for(const extra of [{openingBalancePaise:'1.50',openingBalanceDate:'2026-10-29'},{openingBalancePaise:'1',openingBalanceDate:'2026-02-30'}]){
  await expect(run('createExpenseProfile',{...input,...extra})).rejects.toThrow('INVALID_OPENING_BALANCE');expect(JSON.stringify(state)).toBe(before);
 }
 const p=await run('createExpenseProfile',{...input,openingBalancePaise:'-10000',openingBalanceDate:'2026-10-29'});
 await run('recordExpenseBill',{organizationId:org,profileId:p.id,amountPaise:'25000',occurredAt:'2026-10-30'});
 const {lotteryExpenseOutstanding}=await import('../../vendor/foundation-lottery/src/admin/models/lotteryAccountingExpenseBalance');
 let w=await run('getWorkspace',{organizationId:org});expect(lotteryExpenseOutstanding(w,p.id,'2026-10-30')).toBe(15000n);
 expect(w.summary.expensePaise).toBe('0');
 await run('recordPayment',{organizationId:org,partyId:seller.id,direction:'RECEIPT',occurredAt:'2026-10-30',totalAmountPaise:'50000',methodSplit:{cashPaise:'50000'}});
 await expect(run('recordExpensePayment',{organizationId:org,profileId:p.id,occurredAt:'2026-10-30',totalAmountPaise:'20000',cashPaise:'20000',bankPaise:'0'})).rejects.toThrow('INVALID_PAYMENT');
 await run('updateExpenseProfile',{...input,profileId:p.id,openingBalancePaise:'0',openingBalanceDate:'2026-10-29'});
 w=await run('getWorkspace',{organizationId:org});expect(lotteryExpenseOutstanding(w,p.id,'2026-10-30')).toBe(25000n);
 const other=await run('createOrganization',{name:'Foreign'}),snapshot=JSON.stringify(state);
 await expect(run('updateExpenseProfile',{...input,organizationId:other.id,profileId:p.id,openingBalancePaise:'100',openingBalanceDate:'2026-10-29'})).rejects.toThrow();expect(JSON.stringify(state)).toBe(snapshot);
 const {saveExpenseOpening}=await import('./party-opening');
 for(const profile of [null,{organizationId:'foreign'}])await expect(saveExpenseOpening({foundationAccountingExpenseProfile:{findUnique:async()=>profile}},'bad',{organizationId:org,openingBalancePaise:'1',openingBalanceDate:'2026-10-29'},owner)).rejects.toThrow('EXPENSE_PROFILE_NOT_FOUND');
});

it('accrues date-cycle salary only on active days, settles it separately and preserves immutable leave history',async()=>{
 const {org,seller}=await fixture();
 const c=await run('createExpenseCategory',{organizationId:org,name:'Salary'});
 const schedule={kind:'SALARY',mode:'CALENDAR',start:'2026-10-01',amount:'310000',changes:[]};
 const input={organizationId:org,categoryId:c.id,name:'Worker',usualAmountPaise:'310000',scheduleType:'MONTHLY',schedule};
 const p=await run('createExpenseProfile',input);
 const {changeWork}=await import('../expense-profiles/schedule');
 const next=changeWork(changeWork(schedule as any,'2026-10-10',false),'2026-10-21',true);
 await run('updateExpenseProfile',{...input,profileId:p.id,schedule:next});
 const {lotteryExpenseOutstanding}=await import('../../vendor/foundation-lottery/src/admin/models/lotteryAccountingExpenseBalance');
 let w=await run('getWorkspace',{organizationId:org});
 expect(lotteryExpenseOutstanding(w,p.id,'2026-10-30')).toBe(200000n);
 expect(w.summary.expensePaise).toBe('0');
 await run('recordPayment',{organizationId:org,partyId:seller.id,direction:'RECEIPT',occurredAt:'2026-10-30',totalAmountPaise:'300000',methodSplit:{cashPaise:'300000'}});
 await run('recordExpensePayment',{organizationId:org,profileId:p.id,occurredAt:'2026-10-30',totalAmountPaise:'100000',cashPaise:'100000',bankPaise:'0'});
 w=await run('getWorkspace',{organizationId:org});
 expect(lotteryExpenseOutstanding(w,p.id,'2026-10-30')).toBe(100000n);
 expect(w.summary.expensePaise).toBe('100000');
 const before=JSON.stringify(state);
 await expect(run('updateExpenseProfile',{...input,profileId:p.id})).rejects.toThrow('WORK_HISTORY_IMMUTABLE');
 expect(JSON.stringify(state)).toBe(before);
 await expect(run('deleteExpenseCategory',{organizationId:org,categoryId:c.id})).rejects.toThrow('EXPENSE_CATEGORY_IN_USE');
 const spare=await run('createExpenseCategory',{organizationId:org,name:'Spare'});
 await run('deleteExpenseCategory',{organizationId:org,categoryId:spare.id});
 expect((await run('getWorkspace',{organizationId:org})).expenseCategories.map((c:any)=>c.id)).not.toContain(spare.id);
});

it('allows negative cash/bank, spends PWD, and never overdraws PWD or rewrites the original receipts',async()=>{
 const {org,seller,stockist}=await fixture();
 await run('recordPayment',{organizationId:org,partyId:seller.id,direction:'RECEIPT',occurredAt:'2026-10-29',totalAmountPaise:'3222400',methodSplit:{cashPaise:'1255100',bankPaise:'867300',pwtPaise:'1100000'}});
 const before=await run('getWorkspace',{organizationId:org}),receipt=structuredClone(before.payments[0]);
 await run('recordPayment',{organizationId:org,partyId:stockist.id,direction:'PAYMENT',occurredAt:'2026-10-30',totalAmountPaise:'2831000',methodSplit:{cashPaise:'1261000',bankPaise:'470000',pwtPaise:'1100000'}});
 let w=await run('getWorkspace',{organizationId:org});
 expect(w.summary.methodBalances).toMatchObject({cashPaise:'-5900',bankPaise:'397300',pwtPaise:'0'});
 expect(w.payments.find((p:any)=>p.id===receipt.id)).toEqual(receipt);
 await run('recordPayment',{organizationId:org,partyId:stockist.id,direction:'PAYMENT',occurredAt:'2026-10-30',totalAmountPaise:'500000',methodSplit:{bankPaise:'500000'}});
 w=await run('getWorkspace',{organizationId:org});expect(w.summary.methodBalances.bankPaise).toBe('-102700');
 const snapshot=JSON.stringify(state);
 await expect(run('recordPayment',{organizationId:org,partyId:stockist.id,direction:'PAYMENT',occurredAt:'2026-10-30',totalAmountPaise:'1',methodSplit:{pwtPaise:'1'}})).rejects.toThrow('INVALID_PAYMENT');
 // A backdated second PWD spend cannot consume tokens already committed on the next day.
 await expect(run('recordPayment',{organizationId:org,partyId:stockist.id,direction:'PAYMENT',occurredAt:'2026-10-29',totalAmountPaise:'1',methodSplit:{pwtPaise:'1'}})).rejects.toThrow('INVALID_PAYMENT');
 await expect(run('correctAccountingTransaction',{organizationId:org,entityType:'PAYMENT',entityId:receipt.id,expectedVersion:0,operationId:'pwd-receipt-correction',replacement:{totalAmountPaise:'3222399',methodSplit:{cashPaise:'1255100',bankPaise:'867300',pwtPaise:'1099999'}}})).rejects.toThrow('INVALID_PAYMENT');
 expect(JSON.stringify(state)).toBe(snapshot);
});
it('permits expense cash/bank overdrafts while retaining the unpaid-profile limit',async()=>{
 const {org}=await fixture(),c=await run('createExpenseCategory',{organizationId:org,name:'Bills'});
 const p=await run('createExpenseProfile',{organizationId:org,categoryId:c.id,name:'Payee',usualAmountPaise:'0',scheduleType:'ONE_TIME',openingBalancePaise:'30000',openingBalanceDate:'2026-10-29'});
 await run('recordExpensePayment',{organizationId:org,profileId:p.id,occurredAt:'2026-10-30',totalAmountPaise:'20000',cashPaise:'10000',bankPaise:'10000'});
 const w=await run('getWorkspace',{organizationId:org});expect(w.summary.methodBalances).toMatchObject({cashPaise:'-10000',bankPaise:'-10000'});
 await expect(run('recordExpensePayment',{organizationId:org,profileId:p.id,occurredAt:'2026-10-30',totalAmountPaise:'10001',cashPaise:'10001',bankPaise:'0'})).rejects.toThrow('INVALID_PAYMENT');
});
