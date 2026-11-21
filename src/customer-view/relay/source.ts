import { requestKhata, readOnlineCompanyExport } from '../../accounting/api'
import { androidLocalFirst } from '../../native-local/route'
import { parseCompanyExport } from '../../sync/company-transfer'
import { partyStatement } from '../statement'
import type { DeviceLocalSnapshot } from '../../demo/store'
import type { LotteryWorkspace } from '../../../vendor/foundation-lottery/src/admin/models/lotteryAccountingTypes'
import type { Company, Voucher } from '../../accounting/model'
import type { DemoParty } from '../../demo/master-model'
import { validPatch, type Scope, type Dataset, type Row } from './model'
const accounts = ['receivable','payable','expense_payable'] as const
function checked(scope: Scope,rows: Row[]): Dataset {
  if(!validPatch({reset:true,scope,upsert:rows,remove:[]})) throw new Error('SHARE_PROJECTION_INVALID')
  rows.sort((a,b)=>a.id.localeCompare(b.id))
  return {scope,rows}
}
/** Same minor-unit journal signs as the books; reversals remain explicit rows. */
export function khataProjection(snapshot: Pick<DeviceLocalSnapshot,'companies'|'parties'|'entries'|'expenses'>,scope: Scope): Dataset {
  const company=snapshot.companies.find(row=>row.id===scope.company)
  const party=snapshot.parties.find(row=>row.id===scope.party && row.company===scope.company)
  if(!company || !party) throw new Error('SHARE_SOURCE_UNAVAILABLE')
  const rows = snapshot.entries.filter(row=>row.company===scope.company && row.party_id===scope.party).flatMap(entry=>[...journalProjection(entry),...cashProjection(entry)])
  if(party.opening_side!=='none' && BigInt(party.opening_amount)!==0n) rows.push({id:'opening:'+party.id,date:party.opening_date,reference:'',kind:'opening',account:party.opening_account,amount:String(BigInt(party.opening_amount)*(party.opening_side==='due'?1n:-1n))})
  if(party.kind==='expense') addExpenses(snapshot,scope,party,rows)
  return checked({...scope,companyName:company.name,partyName:party.name},rows)
}
function journalProjection(entry: Voucher): Row[] {
  return accounts.flatMap(account=>{
    const sign=(entry.debit_account===account?1n:0n)-(entry.credit_account===account?1n:0n)
    if(!sign) return []
    return [{id:entry.id+':'+account,date:entry.effective_date,reference:entry.reference,kind:entry.kind,account,amount:String(BigInt(entry.amount_minor)*sign*(account==='receivable'?1n:-1n)),value:entry.amount_minor}]
  })
}
function cashProjection(entry: Voucher): Row[] {
  if(accounts.some(account=>entry.debit_account===account||entry.credit_account===account) || !['sale','purchase','reversal'].includes(entry.kind)) return []
  const account=entry.credit_account==='purchases'||entry.debit_account==='purchases'?'payable':'receivable'
  return [{id:entry.id+':cash',date:entry.effective_date,reference:entry.reference,kind:'cash_'+entry.kind,account,amount:'0',value:entry.amount_minor}]
}
function addExpenses(snapshot: Pick<DeviceLocalSnapshot,'parties'|'expenses'>,scope: Scope,party: DemoParty,rows: Row[]) {
  // The legacy expense journal stores payee text: ambiguous names must never leak another party.
  if(snapshot.parties.filter(p=>p.company===scope.company && p.kind==='expense' && p.name===party.name).length!==1) throw new Error('SHARE_AMBIGUOUS_PARTY')
  const expenses=snapshot.expenses.filter(row=>row.company===scope.company && row.payee===party.name)
  for(const entry of expenses) {
    const original=entry.kind==='reversal'?expenses.find(row=>row.id===entry.parent):entry
    if(!original) throw new Error('SHARE_SOURCE_INVALID')
    let sign=-1n
    if(original.kind==='charge') sign=original.method?0n:1n
    rows.push({id:'expense:'+entry.id,date:entry.date,reference:entry.reference,kind:sign?entry.kind:'cash_'+entry.kind,account:'expense_payable',value:entry.amount,amount:String(BigInt(entry.amount)*sign*(entry.kind==='reversal'?-1n:1n))})
  }
}
export function lotteryProjection(workspace: LotteryWorkspace,scope: Scope): Dataset {
  if(workspace.organization.id!==scope.company) throw new Error('SHARE_SCOPE_CHANGED')
  const statement=partyStatement(workspace,scope.party,'0001-01-01','9999-12-31',0)
  if(statement.total>5000) throw new Error('SHARE_LOCAL_LIMIT')
  const rows: Row[]=[]
  for(let offset=0;offset<statement.total;offset+=100) {
    const page=partyStatement(workspace,scope.party,'0001-01-01','9999-12-31',offset)
    rows.push(...page.rows.map(row=>({id:row.id,date:row.date,reference:row.reference,kind:row.kind,account:statement.direction==='pay'?'receivable' as const:'payable' as const,amount:String(BigInt(row.business)-BigInt(row.money)),value:row.business!=='0'?row.business:row.money})))
  }
  return checked({...scope,companyName:statement.source,partyName:statement.party},rows)
}
export async function readSource(actor: string,scope: Scope): Promise<Dataset> {
  if(scope.module==='lottery') return lotteryProjection(await requestKhata<LotteryWorkspace>('lottery',{method:'getWorkspace',payload:{organizationId:scope.company}}),scope)
  if(androidLocalFirst()) return (await import('../../native-local/runtime')).readNativeStatementSource(actor,scope)
  const data=parseCompanyExport(await readOnlineCompanyExport(actor,scope.company),scope.company,actor)
  return khataProjection({...data,companies:[data.company]},scope)
}
export async function sourceChoices(): Promise<Scope[]> {
  const choices: Scope[]=[]
  const companies=await requestKhata<Company[]>('companies',{})
  await companies.reduce(async(previous,company)=>{
    await previous
    const masters=await requestKhata<{parties:DemoParty[]}>('masters',{company:company.id})
    choices.push(...masters.parties.map(p=>({module:'khata' as const,company:company.id,party:p.id,companyName:company.name,partyName:p.name})))
  },Promise.resolve())
  const organizations=await requestKhata<Company[]>('lottery',{method:'listOrganizations',payload:{}})
  await organizations.reduce(async(previous,company)=>{
    await previous
    const workspace=await requestKhata<LotteryWorkspace>('lottery',{method:'getWorkspace',payload:{organizationId:company.id}})
    choices.push(...workspace.parties.filter(p=>['SELLER','CUSTOMER','STOCKIST','SERVICE_STOCKIST'].includes(p.partyType)).map(p=>({module:'lottery' as const,company:company.id,party:p.id,companyName:company.name,partyName:p.name})))
  },Promise.resolve())
  return choices
}
