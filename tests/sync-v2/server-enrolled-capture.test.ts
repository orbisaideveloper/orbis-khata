import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { setup } from '../../scripts/sql-fixture.mjs'

const OWNER = '11111111-1111-7111-8111-111111111111'
const ACTOR = '22222222-2222-7222-8222-222222222222'
const COMPANY = '33333333-3333-7333-8333-333333333333'
const PARTY = '44444444-4444-7444-8444-444444444444'
const EPOCH = '2026-phase2b'

// Source-only disposable PostgreSQL acceptance. It never connects to Supabase.
describe('2B/2E legacy writer capture must fail closed for previously enrolled scopes', () => {
  let db: PGlite
  async function expense(id: string) {
    const p = { id, company: COMPANY, date: '2026-10-20', kind: 'charge', amount: '120', category: 'Feed', payee: '', method: 'cash', parent: null, reference: '', note: '' }
    return db.transaction(async tx => {
      await tx.query('select set_config($1,$2,true),set_config($3,$4,true)', ['request.jwt.claims', JSON.stringify({ sub: OWNER, role: 'authenticated' }), 'orbis.khata.gateway_verified', 'v1'])
      return tx.query('select public.khata_expense_post_v1($1::jsonb)::text as id', [JSON.stringify(p)])
    })
  }
  async function voucher(id: string) {
    return db.transaction(async tx => {
      await tx.query('select set_config($1,$2,true),set_config($3,$4,true)', ['request.jwt.claims', JSON.stringify({ sub: OWNER, role: 'authenticated' }), 'orbis.khata.gateway_verified', 'v1'])
      await tx.exec('set local role authenticated')
      return tx.query('select public.khata_post_v1($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$6,$7,$8,$9,$10::uuid)::text as id',
        [id, COMPANY, PARTY, 'purchase', '2026-10-20', '125', null, '', '', null])
    })
  }
  async function newParty(id: string) {
    return db.query('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)', [id, COMPANY, 'Another supplier', 'supplier'])
  }
  async function newInventory(id: string) {
    return db.query('insert into public.khata_inventory_documents(id,company_id,kind,effective_date,payload,total_minor,actor_id) values($1,$2,$3,$4,$5::jsonb,$6,$7)',
      [id, COMPANY, 'item', '2026-10-20', '{}', '0', OWNER])
  }
  async function head() { return Number((await db.query('select head from sync_v2.scope where actor_id=$1 and kind=$2 and scope_id=$3', [ACTOR, 'company', COMPANY])).rows[0]?.head) }
  async function count(table: string) { return Number((await db.query(`select count(*)::integer as n from ${table}`)).rows[0]?.n) }
  beforeAll(async () => {
    db = await setup()
    for (const f of [
      'supabase/migrations/20261031075245_lottery_row_storage.sql',
      'supabase/migrations/20261031081126_continuous_production.sql',
      'supabase/migrations/20261101144338_expense_profile_schedules.sql',
      'supabase/tests/sync-v2/kernel.sql',
      'supabase/tests/sync-v2/voucher-capture.sql',
      'supabase/tests/sync-v2/grouped-feed.sql',
      'supabase/tests/sync-v2/voucher-stock-order.sql',
      'supabase/tests/sync-v2/company-direct-write-fence.sql',
      'supabase/tests/sync-v2/settlement-expense-capture.sql',
      'supabase/tests/sync-v2/company-operational-capture.sql',
      'supabase/tests/sync-v2/khata-writer.sql',
      'supabase/tests/sync-v2/company-lifecycle-capture.sql',
      'supabase/migrations/20261105101338_safe_retired_company_purge.sql',
    ]) await db.exec(await readFile(f, 'utf8'))
    await db.exec('grant usage on schema auth to authenticated')
    await db.query('insert into auth.users(id) values ($1)', [OWNER])
    await db.query('insert into orbis_khata.ledger_owners(id,legacy) values ($1,false)', [OWNER])
    await db.query('insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values ($1,$2,$3)', [ACTOR, OWNER, 'fixture'])
    await db.query('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3)', [COMPANY, 'No silent feed gaps', OWNER])
    await db.query('insert into public.khata_parties(id,company_id,name,kind) values ($1,$2,$3,$4)', [PARTY, COMPANY, 'Supplier', 'supplier'])
  }, 60000)
  afterAll(async () => { await db?.close() })

  it('unenrolled legacy financial writers keep working without creating v2 events', async () => {
    await expense('55555555-5555-7555-8555-555555555555')
    expect(await count('public.khata_expense_events')).toBe(1)
    expect(await count('sync_v2.event')).toBe(0)
  })

  it('active enrolled scope captures the immutable expense once in the same financial commit', async () => {
    await db.query('insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values ($1,$2,$3,$4,$5)', [ACTOR, 'company', COMPANY, EPOCH, 'active'])
    await expense('66666666-6666-7666-8666-666666666666')
    expect(await head()).toBe(1)
    expect(await count('sync_v2.event')).toBe(1)
    const page = (await db.query("select sync_v2.read_grouped_feed($1,$2,$3,$4,0,10) as page", [ACTOR,'company',COMPANY,EPOCH])).rows[0]?.page as { groups: { events: { change: { entityType: string }[] }[] }[] }
    expect(page.groups.flatMap(g => g.events.flatMap(e => e.change.map(c => c.entityType)))).toEqual(['expense'])
  })

  it('the same active enrollment captures voucher, party and inventory writers with ordered feed', async () => {
    await voucher('88888888-8888-7888-8888-888888888888')
    // A lost ACK retry with the same immutable voucher ID must not emit twice.
    await voucher('88888888-8888-7888-8888-888888888888')
    await newParty('99999999-9999-7999-8999-999999999999')
    await newInventory('aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa')
    expect(await head()).toBe(4)
    const page = (await db.query('select sync_v2.read_grouped_feed($1,$2,$3,$4,0,10) as page', [ACTOR,'company',COMPANY,EPOCH])).rows[0]?.page as {
      next: string; groups: { events: { change: { entityType: string }[] }[] }[]
    }
    expect(page.next).toBe('4')
    expect(page.groups.flatMap(g => g.events.flatMap(e => e.change.map(c => c.entityType)))).toEqual([
      'expense', 'voucher', 'party', 'inventory-document',
    ])
  })

  it('retired enrolled scope rejects financial mutations instead of accepting unseen effects', async () => {
    await db.query("update sync_v2.scope set lifecycle='retired' where actor_id=$1 and scope_id=$2", [ACTOR,COMPANY])
    await expect(expense('77777777-7777-7777-8777-777777777777')).rejects.toThrow('SYNC_COMPANY_CAPTURE_UNAVAILABLE')
    const before = await head()
    await expect(voucher('bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb')).rejects.toThrow('SYNC_COMPANY_CAPTURE_UNAVAILABLE')
    await expect(newParty('cccccccc-cccc-7ccc-8ccc-cccccccccccc')).rejects.toThrow('SYNC_COMPANY_CAPTURE_UNAVAILABLE')
    await expect(newInventory('dddddddd-dddd-7ddd-8ddd-dddddddddddd')).rejects.toThrow('SYNC_COMPANY_CAPTURE_UNAVAILABLE')
    expect(await head()).toBe(before)
    expect(await count('public.khata_expense_events')).toBe(2)
    expect(await count('public.khata_vouchers')).toBe(1)
    expect(await count('public.khata_parties')).toBe(2)
    expect(await count('public.khata_inventory_documents')).toBe(1)
    expect(await count('sync_v2.event')).toBe(4)
  })

  it('an enrolled company with a missing Central owner binding cannot accept a silent legacy write', async () => {
    await db.query("update sync_v2.scope set lifecycle='active' where actor_id=$1 and scope_id=$2", [ACTOR, COMPANY])
    await db.query('delete from orbis_khata.principals where orbis_identity_id=$1', [ACTOR])
    await expect(expense('eeeeeeee-eeee-7eee-8eee-eeeeeeeeeeee')).rejects.toThrow('SYNC_COMPANY_CAPTURE_UNAVAILABLE')
    await expect(newParty('ffffffff-ffff-7fff-8fff-ffffffffffff')).rejects.toThrow('SYNC_COMPANY_CAPTURE_UNAVAILABLE')
    expect(await count('public.khata_expense_events')).toBe(2)
    expect(await count('public.khata_parties')).toBe(2)
    expect(await head()).toBe(4)
  })


  it('a retired enrolled company cannot block a different unenrolled legacy company', async () => {
    const separate = '12121212-1212-7121-8121-121212121212'
    const party = '34343434-3434-7343-8343-343434343434'
    await db.query('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3)', [separate, 'Unenrolled ledger', OWNER])
    await db.query('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)', [party,separate,'Separate party','both'])
    expect((await db.query('select count(*)::integer as n from public.khata_parties where company_id=$1', [separate])).rows[0]?.n).toBe(1)
    expect(await head()).toBe(4)
  })


  it('a trusted eligible retired-company purge may delete descendants and commit a scope tombstone', async () => {
    await db.query('insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values($1,$2,$3)', [ACTOR,OWNER,'fixture-restored'])
    await db.query("update public.khata_companies set deleted_at=now()-interval '40 days',purge_after=now()-interval '1 day' where id=$1", [COMPANY])
    const result = await db.query('select orbis_khata.purge_retired_companies() as purged')
    expect(result.rows[0]?.purged).toBe(1)
    expect((await db.query('select count(*)::int as n from public.khata_companies where id=$1', [COMPANY])).rows[0]?.n).toBe(0)
    const scope = (await db.query('select lifecycle,head::integer as head from sync_v2.scope where actor_id=$1 and scope_id=$2', [ACTOR,COMPANY])).rows[0]
    expect(scope?.lifecycle).toBe('purged')
    expect(scope?.head).toBeGreaterThan(4)
    expect((await db.query('select count(*)::int as n from public.khata_expense_events where company_id=$1', [COMPANY])).rows[0]?.n).toBe(0)
  })

})
