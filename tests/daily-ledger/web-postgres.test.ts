// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, expect, it } from 'vitest'
import postgres from 'postgres'
import { createCentralVerifier, createKhataGateway } from '../../src/accounting/server-gateway'
import { createDailyLedgerDatabase } from '../../supabase/functions/orbis-khata-data/daily-ledger-db'
import { executeDailyLedgerWeb } from '../../src/daily-ledger/server-service'
import { webLedgerStore } from '../../src/daily-ledger/web-store'
import type { Command } from '../../src/daily-ledger/journal'
import type { Page } from '../../src/daily-ledger/web-contract'

const fixtureUrl = process.env.KHATA_DAILY_LEDGER_TEST_URL
const owner = '018d0000-0000-7000-8000-000000000101'
const other = '018d0000-0000-7000-8000-000000000102'
const when = '2026-11-28'
const grant = { version: 'orbis.daily-ledger.web.v1', tier: 'Plus', active: true, certified: true, capability: 'webLedger' }

function command(slot: number, amountMinor = '1000'): Command {
  return { version: 1, id: '018d0000-0000-7000-8000-' + String(slot).padStart(12, '0'),
    kind: 'income', wallet: 'cash', amountMinor, date: when, note: '' }
}

let admin: ReturnType<typeof postgres> | undefined
let db: ReturnType<typeof postgres> | undefined
let handler: ReturnType<typeof createKhataGateway>
beforeAll(async () => {
  if (!fixtureUrl) return
  const url = new URL(fixtureUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/khata_daily_ledger_test') {
    throw new Error('A new loopback database named khata_daily_ledger_test is required')
  }
  admin = postgres(url.href, { prepare: false, max: 1, onnotice: () => {} })
  await admin.unsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$`)
  await admin.unsafe(await readFile('supabase/migrations/20261128125000_daily_ledger_web.sql', 'utf8'))
  await admin.unsafe(await readFile('tests/daily-ledger/web-isolation.sql', 'utf8'))
  await admin.unsafe("CREATE ROLE orbis_daily_ledger_test_login LOGIN NOINHERIT PASSWORD 'disposable-fixture-only'; GRANT orbis_daily_ledger_gateway TO orbis_daily_ledger_test_login")
  const workerUrl = new URL(url)
  workerUrl.username = 'orbis_daily_ledger_test_login'
  workerUrl.password = 'disposable-fixture-only'
  db = postgres(workerUrl.href, { prepare: false, max: 4 })

  const database = createDailyLedgerDatabase(db)
  const verify = createCentralVerifier({
    baseUrl: 'https://central.example', verificationKey: 'disposable-fixture-verifier', dailyLedgerCapability: true,
    fetchImpl: async (url, init) => {
      if (!String(url).endsWith('/api/v1/service/customer/session?product=orbis-khata')) return new Response(null, { status: 404 })
      const token = new Headers(init?.headers).get('authorization')
      if (token === 'Bearer signed-out') return new Response(null, { status: 401 })
      const actor = token === 'Bearer other' ? other : owner
      const dailyLedger = token === 'Bearer no-grant' ? undefined : { ...grant, ownerId: actor }
      return Response.json({ version: 'orbis.customer.v1', customer: {
        orbisIdentityId: actor, displayId: 'ORB-U-23456789',
      }, dailyLedger })
    },
  })
  handler = createKhataGateway({
    origins: ['https://khata.example'], verify, admit: async () => ({ allowed: true, retryAfter: 0 }),
    execute: (principal, operation) => executeDailyLedgerWeb(database, principal, operation.input, () => when),
  })
})

afterAll(async () => {
  await db?.end()
  await admin?.end()
})

function call(token: string, input: unknown, gateway = handler) {
  return gateway(new Request('https://khata.example/gateway', {
    method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', origin: 'https://khata.example' },
    body: JSON.stringify({ version: 'orbis.khata.data.v1', operation: 'daily-ledger', input }),
  }))
}

function session(token: string, gateway = handler) {
  return webLedgerStore(async <T>(input: unknown) => {
    const response = await call(token, input, gateway)
    const body = await response.json()
    if (!response.ok) throw new Error(body.code)
    return body.data as T
  })
}

it.skipIf(!fixtureUrl)('persists and reopens across sessions, isolates owners, and handles concurrent retries without duplicating postings', async () => {
  const first = session('owner')
  const initial = command(201)
  const [saved, replay] = await Promise.all([first.save(initial), first.save(initial)])
  expect(saved).toEqual(replay)
  expect((await session('owner-new-session').list()).map(row => row.command.id)).toEqual([initial.id])
  expect(await session('other').list()).toEqual([])
  await session('other').save(command(201, '250'))
  expect((await session('other').list())[0].postings[0].delta).toBe('250')
  await expect(first.save(command(201, '1001'))).rejects.toThrow('DAILY_OPERATION_CONFLICT')
  expect(await first.list()).toHaveLength(1)
  expect(saved.postings.map(row => row.delta)).toEqual(['1000', '-1000'])
})

it.skipIf(!fixtureUrl)('denies inactive authority and spoofed input while leaving persisted rows untouched', async () => {
  expect((await call('signed-out', { action: 'list', after: '0' })).status).toBe(401)
  expect((await call('no-grant', { action: 'save', command: command(211) })).status).toBe(403)
  expect((await call('owner', { action: 'list', after: '0', ownerId: other })).status).toBe(400)
  expect((await call('owner', { action: 'save', command: { ...command(211), ownerId: other } })).status).toBe(400)
  expect((await call('owner', { action: 'save', command: { ...command(211), postings: [] } })).status).toBe(400)
  expect((await call('owner', { action: 'save', command: { ...command(211), date: '2026-12-01' } })).status).toBe(422)
  expect((await session('owner').list()).map(row => row.command.id)).not.toContain(command(211).id)
})

it.skipIf(!fixtureUrl)('pins paginated reads to a committed revision even while the owner writes', async () => {
  const client = session('owner')
  for (let slot = 301; slot <= 401; slot++) await client.save(command(slot, '1'))
  const chunk = await call('owner', { action: 'list', after: '0' })
  const { data: page } = await chunk.json() as { data: Page }
  expect(page.records).toHaveLength(100)
  expect(page.nextCursor).toBe('100')
  const fresh = await client.save(command(402, '1'))
  const continuation = await call('owner', { action: 'list', after: page.nextCursor, through: page.through })
  const { data: final } = await continuation.json() as { data: Page }
  expect(final.through).toBe(page.through)
  expect(final.nextCursor).toBeNull()
  expect(final.records.some(row => row.entry.command.id === fresh.command.id)).toBe(false)
  expect((await session('owner-new-session').list())[0].command.id).toBe(fresh.command.id)
})

it.skipIf(!fixtureUrl)('allows verified test accounts to save and reopen independent journals without a subscription grant', async () => {
  const database = createDailyLedgerDatabase(db!)
  const verify = createCentralVerifier({
    baseUrl: 'https://central.example', verificationKey: 'disposable-fixture-verifier', dailyLedgerWebTest: true,
    fetchImpl: async (url, init) => {
      const request = new Headers(init?.headers)
      if (String(url) !== 'https://central.example/api/v1/service/customer/session' ||
          request.get('x-orbis-verification-key') !== 'disposable-fixture-verifier') return new Response(null, { status: 403 })
      const token = request.get('authorization')
      if (token === 'Bearer expired') return new Response(null, { status: 401 })
      const actor = token === 'Bearer other' ? other : owner
      return Response.json({ version: 'orbis.customer.v1', customer: {
        orbisIdentityId: actor, displayId: 'ORB-U-23456789',
      } })
    },
  })
  const gateway = createKhataGateway({
    origins: ['https://khata.example'], verify, admit: async () => ({ allowed: true, retryAfter: 0 }),
    execute: (principal, operation) => executeDailyLedgerWeb(database, principal, operation.input, () => when),
  })
  const initial = command(801)
  const [saved, replay] = await Promise.all([session('owner', gateway).save(initial), session('owner', gateway).save(initial)])
  expect(saved).toEqual(replay)
  expect((await session('other', gateway).list()).some(row => row.command.id === initial.id)).toBe(false)
  await session('other', gateway).save(command(801, '240'))
  const reopening = (token: string) => session(token, gateway).list().then(rows => rows.find(row => row.command.id === initial.id))
  expect((await reopening('owner-new-session'))?.postings.map(row => row.delta)).toEqual(['1000', '-1000'])
  expect((await reopening('other'))?.postings.map(row => row.delta)).toEqual(['240', '-240'])
  expect((await call('expired', { action: 'list', after: '0' }, gateway)).status).toBe(401)
  expect((await call('other', { action: 'list', after: '0', ownerId: owner }, gateway)).status).toBe(400)
})
