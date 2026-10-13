import postgres from 'npm:postgres@3.4.7'
import { createCentralVerifier, createKhataGateway } from '../../../src/accounting/server-gateway.ts'

const env = (key: string) => Deno.env.get(key) ?? ''
const endpoint = new URL(env('KHATA_DATABASE_URL'))
const ref = 'gqyaxsczlmvppxuoqbox'
if (!((endpoint.hostname === `db.${ref}.supabase.co`) ||
  (endpoint.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(endpoint.username) === `postgres.${ref}`))) throw new Error('KHATA_DATABASE_TARGET_INVALID')
const sql = postgres(endpoint.href, { max: 3, prepare: false, ssl: { rejectUnauthorized: true }, connect_timeout: 8, idle_timeout: 10 })
const verificationKey = env('ORBIS_CUSTOMER_VERIFY_KEY')
if (verificationKey.length < 32) throw new Error('KHATA_VERIFICATION_KEY_REQUIRED')
const verify = createCentralVerifier({ baseUrl: env('ORBIS_CUSTOMER_API_URL'), verificationKey })
const handler = createKhataGateway({ origins: env('KHATA_ORIGINS').split(',').map(value => value.trim()).filter(Boolean), verify,
  execute: async (principal, operation) => sql.begin(async tx => {
    // Only this product's principal reference is written; no common profile is copied.
    await tx`insert into orbis_khata.principals(orbis_identity_id) values(${principal.orbisIdentityId}::uuid) on conflict do nothing`
    await tx`set local role authenticated`
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: principal.orbisIdentityId, role: 'authenticated' })},true)`
    const input = operation.input
    if (operation.operation === 'companies') {
      const rows = await tx`select id,name from public.khata_companies where owner_id=${principal.orbisIdentityId}::uuid order by created_at,id limit 10001`
      if (rows.length > 10000) throw new Error('KHATA_COMPANY_LIMIT')
      return rows
    }
    if (operation.operation === 'create') {
      const row = input.row as Record<string, string>
      const companies = input.table === 'khata_companies'
      const created = companies
        ? await tx`insert into public.khata_companies(id,name,owner_id) values(${row.id}::uuid,${row.name},${principal.orbisIdentityId}::uuid) on conflict(id) do nothing returning id,name`
        : await tx`insert into public.khata_parties(id,name,company_id,kind) values(${row.id}::uuid,${row.name},${row.company_id}::uuid,${row.kind}) on conflict(id) do nothing returning id,name`
      if (created.length) return created[0]
      const existing = companies
        ? await tx`select id,name,owner_id from public.khata_companies where id=${row.id}::uuid`
        : await tx`select id,name,company_id,kind from public.khata_parties where id=${row.id}::uuid`
      const expected = companies ? { ...row, owner_id: principal.orbisIdentityId } : row
      if (!existing.length || Object.entries(expected).some(([key,value]) => existing[0][key] !== value)) throw new Error('KHATA_IDEMPOTENCY_CONFLICT')
      return { id: existing[0].id, name: existing[0].name }
    }
    if (operation.operation === 'report') {
      const result = await tx`select public.khata_report_v1(${String(input.company)}::uuid,${String(input.from)}::date,${String(input.to)}::date,${input.party as string | null}::uuid,${Number(input.offset)}::integer) as data`
      return result[0].data
    }
    const result = await tx`select public.khata_post_v1(${String(input.id)}::uuid,${String(input.company)}::uuid,${String(input.party)}::uuid,${String(input.kind)},${String(input.date)}::date,${String(input.amount)},${String(input.method)},${String(input.reference)},${String(input.note)},${input.reverses as string | null}::uuid) as data`
    return result[0].data
  }),
})
Deno.serve(handler)
