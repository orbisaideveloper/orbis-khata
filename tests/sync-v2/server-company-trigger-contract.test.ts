import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { setup } from '../../scripts/sql-fixture.mjs'

// Read-only-in-memory contract audit: exact migration and review-only SQL.
// This checks that the capture mechanism can ADDRESS every row, not that every
// legacy mutation path has passed native PostgreSQL or snapshot acceptance.
const migrations = [
  '20261031075245_lottery_row_storage.sql',
  '20261031081126_continuous_production.sql',
  '20261101144338_expense_profile_schedules.sql',
  '20261105101338_safe_retired_company_purge.sql',
  '20261124173000_private_lottery_sync_payment.sql',
  '20261125100000_lottery_immutable_feed_recovery.sql',
  '20261125103000_sync_device_pairing.sql',
]

type TriggerRow = {
  table_name: string
  trigger_name: string
  has_company_id: boolean
  has_id: boolean
  definition: string
}

describe('Phase 2B disposable company trigger schema contract', () => {
  let db: PGlite
  let rows: TriggerRow[]
  beforeAll(async () => {
    db = await setup()
    for (const file of migrations) {
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
    }
    await db.exec(await readFile(
      'supabase/review-candidates/20261125_private_company_financial_capture.review.sql', 'utf8'))
    rows = (await db.query(`select c.relname as table_name, t.tgname as trigger_name,
      exists(select 1 from pg_attribute a where a.attrelid=c.oid
        and a.attname='company_id' and not a.attisdropped) as has_company_id,
      exists(select 1 from pg_attribute a where a.attrelid=c.oid
        and a.attname='id' and not a.attisdropped) as has_id,
      pg_get_triggerdef(t.oid) as definition
      from pg_trigger t join pg_class c on c.oid=t.tgrelid
      where t.tgfoid='sync_v2.capture_company_financial_row()'::regprocedure
      order by c.relname,t.tgname`)).rows as TriggerRow[]
  }, 60_000)
  afterAll(async () => { await db?.close() })

  it('captures all 20 reviewed company-row trigger registrations', () => {
    expect(rows).toHaveLength(20)
    expect(new Set(rows.map(row => row.trigger_name)).size).toBe(20)
  })
  it('every table has the company_id used to authenticate and sequence its events', () => {
    expect(rows.filter(row => !row.has_company_id).map(row => row.table_name)).toEqual([])
  })
  it('only tables with actual row IDs register the generic DELETE capture', () => {
    const broken = rows.filter(row => /\bDELETE\b/.test(row.definition) && !row.has_id)
    expect(broken.map(row => row.table_name)).toEqual([])
  })
  it('generic financial row-capture is not publicly executable', async () => {
    const grants = (await db.query(`select rolname,
      has_function_privilege(rolname,'sync_v2.capture_company_financial_row()','EXECUTE') as can_execute
      from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname`)).rows
    expect(grants).toEqual([
      { rolname: 'anon', can_execute: false },
      { rolname: 'authenticated', can_execute: false },
      { rolname: 'service_role', can_execute: false },
    ])
  })
})
