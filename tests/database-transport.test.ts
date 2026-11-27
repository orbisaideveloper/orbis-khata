import {identicalParty} from '../src/demo/party-match'
import {runLottery} from '../src/lottery/service'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transpileModule, ModuleKind } from 'typescript'
import { expect, it } from 'vitest'
import { createKhataGateway } from '../src/accounting/server-gateway'
import { emptyPartyDetails } from '../src/demo/master-model'

const id = '11111111-1111-4111-8111-111111111111'
const principal = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
type JsonParameter = { jsonValue: unknown }
function decodeJson(value: unknown) {
  // Postgres.js 3.4.7 infers OID 3802 for an untyped ::jsonb argument,
  // then applies JSON.stringify. A pre-stringified object becomes JSON text.
  if (value && typeof value === 'object' && 'jsonValue' in value) return JSON.parse(JSON.stringify((value as JsonParameter).jsonValue))
  return JSON.parse(JSON.stringify(value))
}
function edgeHarness(existingParties: {id:string;name:string;phone:string}[] = [], admissionDecision:unknown = {allowed:true,retryAfter:0}) {
  const received: unknown[] = []
  let inTransaction=false;const admittedIdentities:unknown[]=[]
  let lotteryState:Record<string,Record<string,unknown>[]>={},lotteryVersion=0;const lotteryOperations=new Map<string,unknown>();
  let handler: (request: Request) => Promise<Response> = async () => new Response(null, { status: 500 })
  const tx = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join('?')
    if(query.includes('admit_gateway_request')){expect(inTransaction).toBe(false);admittedIdentities.push(values[0]);return [{decision:admissionDecision}]}
    if (query.includes('resolve_ledger_owner')) return [{ id }]
    if(query.includes('select id,name,phone from public.khata_parties'))return existingParties
    if(query.includes('khata_report_revision_v1'))return [{version:'1'}]
    if (query.includes('::jsonb')) {
      const payloads = values.slice(query.includes('khata_master_save_v2') ? 1 : 0).map(decodeJson)
      if(query.includes('khata_lottery_store_v2')){
        const p=payloads[0] as Record<string,any>;
        if(p.action==='load')return [{data:lotteryOperations.has(p.operationId)?{replay:true,result:lotteryOperations.get(p.operationId)}:{state:lotteryState,version:lotteryVersion}}];
        for(const change of p.changes){const rows=lotteryState[change.model]??=[];const index=rows.findIndex(row=>row.id===change.id);if(change.value===null){if(index>=0)rows.splice(index,1);}else if(index>=0)rows[index]=change.value;else rows.push(change.value);}
        lotteryVersion++;if(p.operationId)lotteryOperations.set(p.operationId,p.result);return [{data:p.result}];
      }
      received.push(...payloads)
      if (!payloads.every(p => typeof p === 'object' && p !== null)) throw Object.assign(new Error('Invalid JSON shape'), { code: 'P0001' })
      return [{ data: id }]
    }
    return [{ ready: 1 }]
  }, { json: (jsonValue: unknown): JsonParameter => ({ jsonValue }) })
  const sql = Object.assign(tx, { begin: async (callback: (transaction: typeof tx) => unknown) => {inTransaction=true;try{return await callback(tx)}finally{inTransaction=false}} })
  const source = readFileSync('supabase/functions/orbis-khata-data/index.ts', 'utf8')
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  runInNewContext(compiled, {
    exports: {}, URL, crypto, console: { info() {}, warn() {} },
    require: (name: string) => name.includes('/demo/party-match') ? {identicalParty} : name.includes('/lottery/service') ? {runLottery} : name.startsWith('npm:postgres') ? { __esModule: true, default: () => sql } : {
      createCentralVerifier: () => async () => principal, createKhataGateway,
    },
    Deno: { env: { get: (name: string) => name === 'KHATA_DATABASE_URL' ? 'postgres://postgres@db.gqyaxsczlmvppxuoqbox.supabase.co/postgres' : '' }, serve: (value: typeof handler) => { handler = value } },
  })
  return { received, admittedIdentities, request: (operation: string, input: unknown) => handler(new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer test' }, body: JSON.stringify({ version: 'orbis.khata.data.v1', operation, input }) })) }
}
it('passes optional item fields and party details through the actual Edge entrypoint as JSON objects', async () => {
  const edge = edgeHarness()
  const item = { id, company: id, name: 'Milk', unit: 'litre', code: '', default_rate: null }
  const party = { id, company: id, name: 'Trader', kind: 'customer', receivable: '0', payable: '0', ...emptyPartyDetails }
  expect((await edge.request('item-save', item)).status).toBe(200)
  expect((await edge.request('party-save', party)).status).toBe(200)
  expect(edge.received).toEqual([item, party])
  expect(edge.admittedIdentities).toEqual([principal.orbisIdentityId,principal.orbisIdentityId])
})
it('preserves expense command objects and line arrays across the SQL boundary', async () => {
  const edge = edgeHarness()
  const command = { id, company: id, date: '2026-10-25', kind: 'charge', amount: '10000', category: 'Rent', payee: 'Landlord', method: null, parent: null, reference: '', note: '' }
  const lines = [{ description: 'Rent', quantity: '1000000', unit: '', rate: '10000' }]
  expect((await edge.request('expense-bill', { command, lines })).status).toBe(200)
  expect((await edge.request('expense-post', command)).status).toBe(200)
  expect(edge.received).toEqual([command, lines, command])
})

it('rejects an identical party through the authenticated Edge entrypoint without posting it', async () => {
  const edge = edgeHarness([{ id: '22222222-2222-4222-8222-222222222222', name: 'Trader', phone: '5550123001' }])
  const response = await edge.request('party-save', { id, company: id, name: 'Trader', kind: 'customer', receivable: '0', payable: '0', ...emptyPartyDetails, phone: '5550123001' })
  expect(response.status).toBe(422)
  expect(JSON.stringify(await response.json())).toContain('PARTY_ALREADY_EXISTS')
  expect(edge.received).toEqual([])
})

it('runs independent lottery operations through the actual authenticated Edge entrypoint without touching ordinary tables',async()=>{
 const edge=edgeHarness(),input={method:'createOrganization',payload:{name:'Lottery only'},operationId:crypto.randomUUID()};
 const first=await edge.request('lottery',input),body=await first.json();expect(first.status).toBe(200);expect(body.data.name).toBe('Lottery only');
 expect(await (await edge.request('lottery',input)).json()).toEqual(body);
 const list=await (await edge.request('lottery',{method:'listOrganizations',payload:{}})).json();expect(list.data).toHaveLength(1);expect(edge.received).toEqual([]);
 expect((await edge.request('lottery',{method:'arbitrarySql',payload:{query:'drop table'}})).status).toBe(400);
});

it.each([
 {decision:{allowed:false,retryAfter:10},status:429,code:'KHATA_RATE_LIMITED'},
 {decision:null,status:503,code:'KHATA_DATA_UNAVAILABLE'},
 {decision:{allowed:true,retryAfter:-1},status:503,code:'KHATA_DATA_UNAVAILABLE'},
])('rejects posting through the actual Edge when admission is $decision',async({decision,status,code})=>{
 const edge=edgeHarness([],decision);
 const response=await edge.request('item-save',{id,company:id,name:'Milk',unit:'litre',code:'',default_rate:null});
 expect(response.status).toBe(status);expect(await response.json()).toEqual({code});expect(edge.received).toEqual([]);
 if(status===429){expect(response.headers.get('retry-after')).toBe('10');}
});
