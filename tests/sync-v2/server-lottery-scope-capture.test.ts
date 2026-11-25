import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { setup } from '../../scripts/sql-fixture.mjs'

const OWNER = '11111111-1111-7111-8111-111111111111'
const ACTOR = '22222222-2222-7222-8222-222222222222'
const ORG = 'org-a'
const EPOCH = 'fixture-v1'

describe.each([
  {
    name: 'disposable capture fixture',
    files: [
      'supabase/migrations/20261031075245_lottery_row_storage.sql',
      'supabase/tests/sync-v2/kernel.sql',
      'supabase/tests/sync-v2/grouped-feed.sql',
      'supabase/tests/sync-v2/lottery-capture.sql',
    ],
  },
  {
    name: 'checked-in unapplied SQL migration sequence',
    files: [
      'supabase/migrations/20261031075245_lottery_row_storage.sql',
      'supabase/migrations/20261124173000_private_lottery_sync_payment.sql',
      'supabase/migrations/20261125100000_lottery_immutable_feed_recovery.sql',
      'supabase/migrations/20261125103000_sync_device_pairing.sql',
    ],
  },
])('2B/2E Lottery capture — $name', ({ files }) => {
  let db: PGlite
  async function row(id: string) {
    return db.query('insert into public.khata_lottery_records(owner_id,model,id,value) values($1,$2,$3,$4::jsonb)',
      [OWNER, 'foundationAccountingParty', id, JSON.stringify({ id, organizationId: ORG, name: 'Test seller' })])
  }
  async function count() {
    return Number((await db.query("select count(*)::int as n from public.khata_lottery_records where model='foundationAccountingParty'")).rows[0]?.n)
  }
  beforeAll(async () => {
    db = await setup()
    for (const f of files) await db.exec(await readFile(f, 'utf8'))
    await db.query('insert into auth.users(id) values($1)', [OWNER])
    await db.query('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)', [OWNER])
    await db.query('insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values($1,$2,$3)', [ACTOR, OWNER, 'fixture'])
    await db.query('insert into public.khata_lottery_state(owner_id) values($1)', [OWNER])
    await db.query('insert into public.khata_lottery_records(owner_id,model,id,value) values($1,$2,$3,$4::jsonb)',
      [OWNER,'foundationAccountingOrganization',ORG,JSON.stringify({id:ORG,status:'ACTIVE'})])
  },60000)
  afterAll(async () => { await db?.close() })

  it('allows unenrolled legacy Lottery records without falsely reporting server sync', async () => {
    await row('legacy-1')
    expect(await count()).toBe(1)
    expect((await db.query('select count(*)::int as n from sync_v2.event')).rows[0]?.n).toBe(0)
  })
  it('active enrolled organization rejects direct writes without authoritative operation receipt', async () => {
    await db.query('insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values($1,$2,$3,$4,$5)',
      [ACTOR,'lottery-organization',ORG,EPOCH,'active'])
    await expect(row('unauthenticated-1')).rejects.toThrow('SYNC_LOTTERY_NATIVE_WRITER_REQUIRED')
    expect(await count()).toBe(1)
  })
  it('trusted legacy v2 Lottery RPC captures the native receipt and same-row feed exactly once', async () => {
    const command = {
      action: 'commit',
      operationId: 'aaaa1111-aaaa-7111-8111-aaaaaaaaaaaa',
      version: '0',
      request: { payload: { organizationId: ORG } },
      result: { organizationId: ORG, accepted: true },
      changes: [{ model: 'foundationAccountingParty', id: 'saved-rpc', value: { id: 'saved-rpc', organizationId: ORG, name: 'Authoritative seller' } }],
    }
    async function commit() {
      return db.transaction(async tx => {
        await tx.query('select set_config($1,$2,true),set_config($3,$4,true)', [
          'request.jwt.claims', JSON.stringify({ sub: OWNER, role: 'authenticated' }),
          'orbis.khata.gateway_verified', 'v1',
        ])
        return tx.query('select public.khata_lottery_store_v2($1::jsonb) as result', [JSON.stringify(command)])
      })
    }
    expect((await commit()).rows[0]?.result).toEqual(command.result)
    expect((await commit()).rows[0]?.result).toEqual(command.result)
    expect(await count()).toBe(2)
    const grouped = (await db.query('select sync_v2.read_grouped_feed($1,$2,$3,$4,0,10) as page',
      [ACTOR,'lottery-organization',ORG,EPOCH])).rows[0]?.page as { next: string; groups: unknown[] }
    expect(grouped.next).toBe('1')
    expect(grouped.groups).toHaveLength(1)
    expect((await db.query('select count(*)::int as n from sync_v2.lottery_operation_feed')).rows[0]?.n).toBe(1)
  })

  it('retired enrolled organization rejects writes instead of committing invisible seller records', async () => {
    await db.query("update sync_v2.scope set lifecycle='retired' where actor_id=$1 and kind='lottery-organization' and scope_id=$2", [ACTOR,ORG])
    await expect(row('invisible-2')).rejects.toThrow('SYNC_LOTTERY_CAPTURE_UNAVAILABLE')
    expect(await count()).toBe(2)
    expect((await db.query('select count(*)::int as n from sync_v2.event')).rows[0]?.n).toBe(1)
  })

  it('enrollment/retirement of one organization does not freeze a distinct unenrolled organization', async () => {
    const another = 'org-b'
    await db.query('insert into public.khata_lottery_records(owner_id,model,id,value) values($1,$2,$3,$4::jsonb)',
      [OWNER, 'foundationAccountingOrganization', another, JSON.stringify({ id: another, status: 'ACTIVE' })])
    await db.query('insert into public.khata_lottery_records(owner_id,model,id,value) values($1,$2,$3,$4::jsonb)',
      [OWNER, 'foundationAccountingParty', 'other-seller', JSON.stringify({ id: 'other-seller', organizationId: another })])
    expect(await count()).toBe(3)
    expect((await db.query('select count(*)::int as n from sync_v2.event')).rows[0]?.n).toBe(1)
  })

})
