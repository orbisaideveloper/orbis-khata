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
function edgeHarness() {
  const received: unknown[] = []
  let handler: (request: Request) => Promise<Response> = async () => new Response(null, { status: 500 })
  const tx = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join('?')
    if (query.includes('resolve_ledger_owner')) return [{ id }]
    if (query.includes('::jsonb')) {
      const payloads = values.slice(query.includes('khata_master_save_v2') ? 1 : 0).map(decodeJson)
      received.push(...payloads)
      if (!payloads.every(p => typeof p === 'object' && p !== null)) throw Object.assign(new Error('Invalid JSON shape'), { code: 'P0001' })
      return [{ data: id }]
    }
    return [{ ready: 1 }]
  }, { json: (jsonValue: unknown): JsonParameter => ({ jsonValue }) })
  const sql = Object.assign(tx, { begin: async (callback: (transaction: typeof tx) => unknown) => callback(tx) })
  const source = readFileSync('supabase/functions/orbis-khata-data/index.ts', 'utf8')
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  runInNewContext(compiled, {
    exports: {}, URL, console: { info() {}, warn() {} },
    require: (name: string) => name.startsWith('npm:postgres') ? { __esModule: true, default: () => sql } : {
      createCentralVerifier: () => async () => principal, createKhataGateway,
    },
    Deno: { env: { get: (name: string) => name === 'KHATA_DATABASE_URL' ? 'postgres://postgres@db.gqyaxsczlmvppxuoqbox.supabase.co/postgres' : '' }, serve: (value: typeof handler) => { handler = value } },
  })
  return { received, request: (operation: string, input: unknown) => handler(new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer test' }, body: JSON.stringify({ version: 'orbis.khata.data.v1', operation, input }) })) }
}
it('passes optional item fields and party details through the actual Edge entrypoint as JSON objects', async () => {
  const edge = edgeHarness()
  const item = { id, company: id, name: 'Milk', unit: 'litre', code: '', default_rate: null }
  const party = { id, company: id, name: 'Trader', kind: 'customer', receivable: '0', payable: '0', ...emptyPartyDetails }
  expect((await edge.request('item-save', item)).status).toBe(200)
  expect((await edge.request('party-save', party)).status).toBe(200)
  expect(edge.received).toEqual([item, party])
})
it('preserves expense command objects and line arrays across the SQL boundary', async () => {
  const edge = edgeHarness()
  const command = { id, company: id, date: '2026-10-25', kind: 'charge', amount: '10000', category: 'Rent', payee: 'Landlord', method: null, parent: null, reference: '', note: '' }
  const lines = [{ description: 'Rent', quantity: '1000000', unit: '', rate: '10000' }]
  expect((await edge.request('expense-bill', { command, lines })).status).toBe(200)
  expect((await edge.request('expense-post', command)).status).toBe(200)
  expect(edge.received).toEqual([command, lines, command])
})
