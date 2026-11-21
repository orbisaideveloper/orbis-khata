import { expect,it,vi } from 'vitest'
vi.mock('../../accounting/api',()=>({requestKhata:vi.fn(),readOnlineCompanyExport:vi.fn()}))
import { khataProjection, lotteryProjection, readSource, sourceChoices } from './source'
import { emptyDeviceLocalSnapshot } from '../../demo/store'
import { emptyPartyDetails } from '../../demo/master-model'
import { requestKhata, readOnlineCompanyExport } from '../../accounting/api'
import type { LotteryWorkspace } from '../../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes'
const scope={module:'khata' as const,company:'11111111-1111-4111-8111-111111111111',party:'22222222-2222-4222-8222-222222222222',companyName:'Books',partyName:'Party'}
function snapshot() {
 const s=emptyDeviceLocalSnapshot()
 s.companies=[{id:scope.company,name:'Books'}]
 s.parties=[{...emptyPartyDetails,id:scope.party,company:scope.company,name:'Party',kind:'both',receivable:'0',payable:'0',opening_side:'due',opening_date:'2026-01-01',opening_amount:'100'}]
 s.entries=[{id:'sale',company:scope.company,party_id:scope.party,party_name:'Party',kind:'sale',effective_date:'2026-11-21',amount_minor:'300',debit_account:'receivable',credit_account:'sales',reference:'S1',note:'PRIVATE NOTE',reversed:false},{id:'payment',company:scope.company,party_id:scope.party,party_name:'Party',kind:'payment',effective_date:'2026-11-21',amount_minor:'50',debit_account:'payable',credit_account:'cash',reference:'P1',note:'',reversed:false}]
 return s
}
it('projects only the selected party, with opening and separate receivable/payable signs',()=>{
 const s=snapshot();s.entries.push({...s.entries[0],id:'foreign',party_id:'other'})
 const p=khataProjection(s,scope)
 expect(p.rows).toHaveLength(3)
 expect(p.rows.find(r=>r.id==='sale:receivable')?.amount).toBe('300')
 expect(p.rows.find(r=>r.id==='payment:payable')?.amount).toBe('-50')
 expect(p.rows.find(r=>r.kind==='opening')?.amount).toBe('100')
 expect(JSON.stringify(p)).not.toContain('PRIVATE NOTE')
 expect(()=>khataProjection(s,{...scope,party:'missing'})).toThrow('SHARE_SOURCE_UNAVAILABLE')
})
it('includes exact expense payable and its reversal; ambiguous payee names fail closed',()=>{
 const s=snapshot();s.entries=[];s.parties[0].kind='expense';s.parties[0].opening_side='none'
 s.expenses=[{id:'charge',company:scope.company,date:'2026-11-21',kind:'charge',amount:'100',category:'Helper',payee:'Party',method:null,parent:null,reference:'E1',note:''},{id:'reverse',company:scope.company,date:'2026-11-21',kind:'reversal',amount:'100',category:'Helper',payee:'Party',method:null,parent:'charge',reference:'E2',note:'Correction'}]
 expect(khataProjection(s,scope).rows.map(r=>r.amount)).toEqual(['100','-100'])
 s.parties.push({...s.parties[0],id:'other'})
 expect(()=>khataProjection(s,scope)).toThrow('SHARE_AMBIGUOUS_PARTY')
})
it('keeps lottery draft, payment, opening and correction rows isolated to one party',async()=>{
 const workspace={organization:{id:scope.company,name:'Lottery'},parties:[{id:scope.party,name:'Seller',partyType:'SELLER',openingBalanceDate:'2026-01-01',openingBalancePaise:'50'}],sales:[{id:'sale',partyId:scope.party,occurredAt:'2026-11-21T08:00:00Z',reference:'S1',status:'POSTED',netPayablePaise:'120',dispatchQuantity:10,returnQuantity:0,netTickets:10,grossSalesPaise:'120',ticketRatePaise:'12',commissionPaise:'0',tdsPaise:'0'}],draftSales:[],payments:[{id:'p1',partyId:scope.party,direction:'RECEIPT',occurredAt:'2026-11-21T08:00:00Z',reference:'P1',totalAmountPaise:'20',methodSplit:{}}],customerBills:[],stockistEntries:[]} as unknown as LotteryWorkspace
 const lotteryScope={...scope,module:'lottery' as const}
 const p=lotteryProjection(workspace,lotteryScope)
 expect(p.rows.map(r=>r.amount)).toEqual(['50','-20','120'])
 expect(()=>lotteryProjection(workspace,{...lotteryScope,company:'foreign'})).toThrow('SHARE_SCOPE_CHANGED')
 vi.mocked(requestKhata).mockResolvedValueOnce(workspace)
 expect(await readSource('actor',lotteryScope)).toEqual(p)
 vi.mocked(requestKhata).mockResolvedValueOnce([{id:scope.company,name:'Books'}]).mockResolvedValueOnce({parties:snapshot().parties}).mockResolvedValueOnce([{id:scope.company,name:'Lottery'}]).mockResolvedValueOnce(workspace)
 expect((await sourceChoices()).map(c=>c.module)).toEqual(['khata','lottery'])
})

it('projects web company exports through strict validation without sending a whole company',async()=>{
 const s=snapshot()
 vi.mocked(readOnlineCompanyExport).mockResolvedValue({...s,version:1,actor:'actor',company:s.companies[0],unsupported:false,balances:{},settings:null,expenseProfiles:null,productionRoutes:{}})
 expect((await readSource('actor',scope)).rows).toHaveLength(3)
 expect(readOnlineCompanyExport).toHaveBeenCalledWith('actor',scope.company)
})

it('retains paid cash bills in customer history without inventing an outstanding balance',()=>{
 const s=snapshot();s.entries=[{...s.entries[0],debit_account:'cash',credit_account:'sales'}];s.parties[0].opening_side='none'
 const rows=khataProjection(s,scope).rows
 expect(rows).toHaveLength(1)
 expect(rows[0]).toMatchObject({kind:'cash_sale',amount:'0',value:'300'})
})
