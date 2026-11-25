import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { setup } from '../../scripts/sql-fixture.mjs'

// REAL checked-in (unapplied) v2 migrations + review-only company candidate,
// not a synthetic kernel or a production Supabase connection.
const MIGRATIONS = [
  '20261031075245_lottery_row_storage.sql',
  '20261031081126_continuous_production.sql',
  '20261101144338_expense_profile_schedules.sql',
  '20261105101338_safe_retired_company_purge.sql',
  '20261124173000_private_lottery_sync_payment.sql',
  '20261125100000_lottery_immutable_feed_recovery.sql',
  '20261125103000_sync_device_pairing.sql',
]
const REVIEW = 'supabase/review-candidates/20261125_private_company_financial_capture.review.sql'
const OWNER = '11111111-1111-7111-8111-111111111111'
const ACTOR = '22222222-2222-7222-8222-222222222222'
const COMPANY = '33333333-3333-7333-8333-333333333333'
const PARTY = '44444444-4444-7444-8444-444444444444'
const EPOCH = 'review-epoch-1'
const COMPANY_TWO = '55555555-5555-7555-8555-555555555555'
const id = (n: string) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-7${n}${n}${n}-8${n}${n}${n}-${n.repeat(12)}`

describe('2B + 2E guarded company capture: actual unapplied base migrations + review SQL', () => {
  let db: PGlite
  const count = async (table: string) => Number((await db.query(`select count(*)::int n from ${table}`)).rows[0]?.n)
  const head = async (company=COMPANY) => Number((await db.query(
    'select head::integer as n from sync_v2.scope where kind=$1 and scope_id=$2', ['company',company]
  )).rows[0]?.n)
  const addParty = async (item: string, company=COMPANY) => db.query(
    'insert into public.khata_parties(id,company_id,name,kind) values($1::uuid,$2::uuid,$3,$4)',
    [item,company,'Itemized supplier','both'])
  const voucher = async (item: string, company=COMPANY) => db.transaction(async tx => {
    await tx.query('select set_config($1,$2,true),set_config($3,$4,true)', [
      'request.jwt.claims',JSON.stringify({sub:OWNER,role:'authenticated'}),
      'orbis.khata.gateway_verified','v1',
    ])
    await tx.exec('set local role authenticated')
    return tx.query('select public.khata_post_v1($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$6,$7,$8,$9,$10::uuid)',
      [item,company,PARTY,'receipt','2026-11-25','120','cash','','Migration rehearsal',null])
  })
  const expense = async (item: string, company=COMPANY) => db.transaction(async tx => {
    await tx.query('select set_config($1,$2,true),set_config($3,$4,true)', [
      'request.jwt.claims',JSON.stringify({sub:OWNER,role:'authenticated'}),
      'orbis.khata.gateway_verified','v1',
    ])
    return tx.query('select public.khata_expense_post_v1($1::jsonb)',[
      JSON.stringify({id:item,company,date:'2026-11-25',kind:'charge',amount:'101',category:'Feed',payee:'',method:'cash',parent:null,reference:'',note:''}),
    ])
  })

  beforeAll(async () => {
    db = await setup()
    for (const file of MIGRATIONS) await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'))
    await db.exec(await readFile(REVIEW,'utf8'))
    await db.exec('grant usage on schema auth to authenticated')
    await db.query('insert into auth.users(id) values($1)', [OWNER])
    await db.query('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[OWNER])
    await db.query('insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values($1,$2,$3)',[ACTOR,OWNER,'isolated-review'])
    await db.query('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3)',[COMPANY,'Review only',OWNER])
    await addParty(PARTY)
  },60000)
  afterAll(async () => { await db?.close() })

  it('a drifted legacy RPC aborts the candidate SQL atomically instead of leaving partial triggers', async () => {
    const isolated=await setup()
    try {
      for (const file of MIGRATIONS) await isolated.exec(await readFile(`supabase/migrations/${file}`,'utf8'))
      await isolated.exec(`do $drift$
      declare code text := pg_get_functiondef('public.khata_post_v1(uuid,uuid,uuid,text,date,text,text,text,text,uuid)'::regprocedure);
      begin
        execute replace(code,'Same ID + exact payload is a retry','Changed source comment to invalidate reviewed anchor');
      end $drift$;`)
      await expect(isolated.exec(await readFile(REVIEW,'utf8'))).rejects.toThrow('SYNC_VOUCHER_FIXTURE_SOURCE_CHANGED')
      await isolated.exec('rollback')
      const present=(await isolated.query(`select
        to_regclass('sync_v2.voucher_event')::text as ledger,
        to_regprocedure('sync_v2.assert_unenrolled_company(uuid,boolean)')::text as guard`)).rows[0]
      expect(present?.ledger).toBeNull()
      expect(present?.guard).toBeNull()
    } finally {await isolated.close()}
  },60000)

  it('installs one capture producer per domain table, no accidental duplicate financial triggers', async () => {
    const triggers = (await db.query(`select c.relname as table_name,t.tgname as name
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and not t.tgisinternal
      order by c.relname,t.tgname`)).rows as {table_name:string,name:string}[]
    for (const name of ['zz_sync_v2_capture_voucher','sync_financial_expense','sync_financial_inventory',
      'sync_financial_stock','sync_master_party','sync_production_post','sync_workspace_settings',
      'sync_direct_party_create','sync_company_id_delete','zz_sync_v2_company_purge']) {
      expect(triggers.filter(t => t.name===name),name).toHaveLength(1)
    }
  })

  it('keeps an unenrolled legacy company writable without falsely claiming a v2 event', async () => {
    await voucher(id('6'))
    await expense(id('7'))
    expect(await count('sync_v2.event')).toBe(0)
    expect(await count('public.khata_vouchers')).toBe(1)
    expect(await count('public.khata_expense_events')).toBe(1)
  })

  it('captures legacy voucher, same-ID retry, expense and new party exactly once when enrolled', async () => {
    await db.query('insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values($1,$2,$3,$4,$5)',
      [ACTOR,'company',COMPANY,EPOCH,'active'])
    await voucher(id('8'))
    // Lost response / at-least-once legacy replay: no second financial effect.
    for (let attempt = 0; attempt < 100; attempt++) await voucher(id('8'))
    await expense(id('9'))
    await addParty(id('a'))
    expect(await head()).toBe(3)
    expect(await count('sync_v2.event')).toBe(3)
    const page = (await db.query('select sync_v2.read_grouped_feed($1,$2,$3,$4,0,10) as page',
      [ACTOR,'company',COMPANY,EPOCH])).rows[0]?.page as {
      next:string; groups:{ events:{change:{entityType:string}[]}[] }[]
    }
    expect(page.next).toBe('3')
    expect(page.groups.flatMap(g=>g.events.flatMap(e=>e.change.map(c=>c.entityType)))).toEqual(['voucher','expense','party'])
  })

  it('binds an immutable receipt to an existing legacy voucher event without a duplicate feed entry', async () => {
    const voucherId = 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbc'
    const operationId = 'cccccccc-cccc-7ccc-8ccc-cccccccccccc'
    await voucher(voucherId)
    const prior = await head()
    const result = {entityId:voucherId}
    const receipt = (await db.query('select sync_v2.finish_voucher($1,$2,$3,$4,$5,$6::jsonb)::text as seq',[
      ACTOR,COMPANY,EPOCH,operationId,'a'.repeat(64),JSON.stringify(result),
    ])).rows[0]?.seq as string
    expect(Number(receipt)).toBe(prior)
    expect(await head()).toBe(prior)
    const saved = (await db.query('select result,seq::text from sync_v2.receipt where operation_id=$1',[operationId])).rows[0]
    expect(saved?.result).toEqual(result)
    expect(saved?.seq).toBe(receipt)
    await expect(db.query('select sync_v2.finish_voucher($1,$2,$3,$4,$5,$6::jsonb)',[
      ACTOR,COMPANY,EPOCH,operationId,'b'.repeat(64),JSON.stringify(result),
    ])).rejects.toThrow()
    expect(await head()).toBe(prior)
  })

  it('master party save, update and delete capture immutable audit and deletion marker', async () => {
    const masterId = 'abababab-abab-7aba-8aba-abababababab'
    const signed = (command: () => {sql:string;parameters:unknown[]}) => db.transaction(async tx => {
      await tx.query('select set_config($1,$2,true),set_config($3,$4,true)',[
        'request.jwt.claims',JSON.stringify({sub:OWNER,role:'authenticated'}),
        'orbis.khata.gateway_verified','v1',
      ])
      await tx.exec('set local role authenticated')
      const {sql,parameters} = command()
      return tx.query(sql,parameters)
    })
    const modify = (name: string) => signed(() => ({
      sql: 'select public.khata_master_save_v2($1,$2::jsonb)',
      parameters: ['party',JSON.stringify({id:masterId,company:COMPANY,name,kind:'customer',opening_amount:'0',opening_side:'none'})],
    }))
    const start = await head()
    await modify('First master name')
    await modify('Updated master name')
    await signed(() => ({
      sql:'select public.khata_master_delete_v2($1,$2::uuid,$3::uuid)',
      parameters:['party',COMPANY,masterId],
    }))
    const page = (await db.query('select sync_v2.read_grouped_feed($1,$2,$3,$4,$5,100) as page',
      [ACTOR,'company',COMPANY,EPOCH,start])).rows[0]?.page as {
      next:string; groups:{events:{change:{entityType:string;projectionJson:string}[]}[]}[]
    }
    const changes=page.groups.flatMap(g=>g.events.flatMap(e=>e.change))
    expect(changes.filter(c=>c.entityType==='party')).toHaveLength(3)
    expect(changes.filter(c=>c.entityType==='master-audit').length).toBeGreaterThan(0)
    expect(JSON.parse(changes.filter(c=>c.entityType==='party').at(-1)?.projectionJson??'{}')).toEqual({id:masterId,company_id:COMPANY,deleted:true})
    expect(Number(page.next)).toBeGreaterThan(start)
  })

  it('real paid purchase captures invoice, settlement, inventory and fiscal child rows in one group', async () => {
    const item = 'edededed-eded-7ede-8ede-edededededed'
    const warehouse = 'fdfdfdfd-fdfd-7fdf-8fdf-fdfdfdfdfdfd'
    const invoice = 'adadadad-adad-7ada-8ada-adadadadadad'
    const date = '2026-11-25'
    const input = (entityId: string,kind: string) => ({id:entityId,company:COMPANY,date,kind,name:'Fixture',code:kind,
      unit:kind==='item'?'kg':'',party:null,reference:'',note:'',lines:[]})
    const signed = (sql: string,payload: object) => db.transaction(async tx => {
      await tx.query('select set_config($1,$2,true),set_config($3,$4,true)',[
        'request.jwt.claims',JSON.stringify({sub:OWNER,role:'authenticated'}),
        'orbis.khata.gateway_verified','v1',
      ])
      await tx.exec('set local role authenticated')
      return (await tx.query(sql,[JSON.stringify(payload)])).rows[0] as {result:unknown}
    })
    await signed('select public.khata_inventory_post_v1($1::jsonb) as result',input(item,'item'))
    await signed('select public.khata_inventory_post_v1($1::jsonb) as result',input(warehouse,'warehouse'))
    const bill = {...input(invoice,'purchase'),code:'',name:'',unit:'',party:PARTY,
      lines:[{item,warehouse,to:null,quantity:'2000000',rate:'5000'}]}
    const request = {company:COMPANY,action:'invoice-save',command:{company:COMPANY,action:'bill',bill,
      paid:'2500',account:'cash',roundoff:'0'}}
    const start=await head()
    await expect(db.transaction(async tx => {
      await tx.query('select set_config($1,$2,true),set_config($3,$4,true)',[
        'request.jwt.claims',JSON.stringify({sub:OWNER,role:'authenticated'}),
        'orbis.khata.gateway_verified','v1',
      ])
      await tx.exec('set local role authenticated')
      await tx.query('select public.khata_workspace_v3($1::jsonb)',[JSON.stringify(request)])
      throw new Error('INVOICE_ROLLBACK_PROBE')
    })).rejects.toThrow('INVOICE_ROLLBACK_PROBE')
    expect(await head()).toBe(start)
    const result = (await signed('select public.khata_workspace_v3($1::jsonb) as result',request)).result as {
      total:string;paid:string;due:string;payment:string;reference:string
    }
    expect({total:result.total,paid:result.paid,due:result.due}).toEqual({total:'10000',paid:'2500',due:'7500'})
    expect((await signed('select public.khata_workspace_v3($1::jsonb) as result',request)).result).toEqual(result)
    const page = (await db.query('select sync_v2.read_grouped_feed($1,$2,$3,$4,$5,100) as page',[
      ACTOR,'company',COMPANY,EPOCH,start])).rows[0]?.page as {
      next:string;groups:{events:{change:{entityType:string;projectionJson:string}[]}[]}[]
    }
    expect(page.groups).toHaveLength(1)
    const changed=page.groups.flatMap(g=>g.events.flatMap(e=>e.change))
    for (const entityType of ['voucher','invoice','payment-link','inventory-document','stock-movement','fiscal-number']) {
      expect(changed.filter(c=>c.entityType===entityType).length,entityType).toBeGreaterThan(0)
    }
    expect(changed.filter(c=>c.entityType==='voucher')).toHaveLength(2)
    const payment = changed.find(c=>c.entityType==='payment-link')
    expect(JSON.parse(payment?.projectionJson??'{}').id).toBe(result.payment)
    expect((await db.query('select sum(quantity)::text as stock from public.khata_stock_journal where company_id=$1',[COMPANY])).rows[0]?.stock).toBe('2000000')
  })

  it('actual workspace settings and production output emit their own ordered company changes', async () => {
    const signedWorkspace = (payload: object) => db.transaction(async tx => {
      await tx.query('select set_config($1,$2,true),set_config($3,$4,true)',[
        'request.jwt.claims',JSON.stringify({sub:OWNER,role:'authenticated'}),
        'orbis.khata.gateway_verified','v1',
      ])
      await tx.exec('set local role authenticated')
      return (await tx.query('select public.khata_workspace_v3($1::jsonb) as result',[
        JSON.stringify(payload)])).rows[0]?.result as Record<string,unknown>
    })
    const current = await signedWorkspace({company:COMPANY,action:'settings'})
    const start = await head()
    await signedWorkspace({company:COMPANY,action:'settings-save',settings:{...current,production:true}})
    const page = (await db.query('select sync_v2.read_grouped_feed($1,$2,$3,$4,$5,100) as page',[
      ACTOR,'company',COMPANY,EPOCH,start])).rows[0]?.page as {
      next:string;groups:{events:{change:{entityType:string;projectionJson:string}[]}[]}[]
    }
    expect(page.groups.flatMap(g=>g.events.flatMap(e=>e.change.map(c=>c.entityType)))).toContain('workspace-settings')
    const outputId = 'dededede-dede-7ded-8ded-dededededede'
    const beforeOutput = await head()
    await signedWorkspace({company:COMPANY,action:'production',id:outputId,date:'2026-11-25',
      kind:'output',item:'edededed-eded-7ede-8ede-edededededed',
      warehouse:'fdfdfdfd-fdfd-7fdf-8fdf-fdfdfdfdfdfd',quantity:'1500',note:'Output rehearsal'})
    const output = (await db.query('select sync_v2.read_grouped_feed($1,$2,$3,$4,$5,100) as page',[
      ACTOR,'company',COMPANY,EPOCH,beforeOutput])).rows[0]?.page as {
      next:string;groups:{events:{change:{entityType:string;projectionJson:string}[]}[]}[]
    }
    const changes = output.groups.flatMap(g=>g.events.flatMap(e=>e.change))
    expect(changes.map(c=>c.entityType)).toContain('production-post')
    expect(changes.map(c=>c.entityType)).toContain('stock-movement')
    expect(JSON.parse(changes.find(c=>c.entityType==='production-post')?.projectionJson??'{}').id).toBe(outputId)
  })

  it('anon and authenticated roles cannot call private capture or modify sync ledger tables', async () => {
    for (const role of ['anon','authenticated']) {
      await expect(db.transaction(async tx => {
        await tx.exec(`set local role ${role}`)
        await tx.query("insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values('attacker','company','stolen','1','active')")
      })).rejects.toThrow(/permission denied/)
      await expect(db.transaction(async tx => {
        await tx.exec(`set local role ${role}`)
        await tx.query('select sync_v2.assert_unenrolled_company($1::uuid)',[COMPANY])
      })).rejects.toThrow(/permission denied/)
    }
  })

  it('verified gateway claims for the wrong owner cannot create a party in another company', async () => {
    const stranger = '12121212-1212-7121-8121-121212121212'
    const before = await head()
    await expect(db.transaction(async tx => {
      await tx.query('select set_config($1,$2,true),set_config($3,$4,true)',[
        'request.jwt.claims',JSON.stringify({sub:stranger,role:'authenticated'}),
        'orbis.khata.gateway_verified','v1',
      ])
      await tx.exec('set local role authenticated')
      await tx.query('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',[
        '23232323-2323-7323-8323-232323232323',COMPANY,'Foreign party','both',
      ])
    })).rejects.toThrow(/COMPANY_NOT_ACCESSIBLE|permission denied/)
    expect(await head()).toBe(before)
  })

  it('rolls back financial state and feed cursor together on an aborted write', async () => {
    const before = await head()
    await expect(db.transaction(async tx => {
      await tx.query('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',
        [id('b'),COMPANY,'Must roll back','both'])
      throw new Error('ABORT_TRANSACTION_AFTER_CAPTURE')
    })).rejects.toThrow('ABORT_TRANSACTION_AFTER_CAPTURE')
    expect(await head()).toBe(before)
    expect((await db.query('select count(*)::int n from public.khata_parties where id=$1',[id('b')])).rows[0]?.n).toBe(0)
  })

  it('retirement refuses any later silent financial write, preserving confirmed events', async () => {
    await db.query("update sync_v2.scope set lifecycle='retired' where kind='company' and scope_id=$1",[COMPANY])
    const before=await head()
    const confirmed=await count('sync_v2.event')
    await expect(voucher(id('c'))).rejects.toThrow('SYNC_COMPANY_CAPTURE_UNAVAILABLE')
    await expect(expense(id('d'))).rejects.toThrow('SYNC_COMPANY_CAPTURE_UNAVAILABLE')
    await expect(addParty(id('e'))).rejects.toThrow('SYNC_COMPANY_CAPTURE_UNAVAILABLE')
    expect(await head()).toBe(before)
    expect(await count('sync_v2.event')).toBe(confirmed)
  })

  it('trusted scheduled purge produces permanent scope tombstone and reserves the company UUID', async () => {
    await db.query("update public.khata_companies set deleted_at=now()-interval '40 days',purge_after=now()-interval '1 day' where id=$1",[COMPANY])
    const purged = await db.query('select orbis_khata.purge_retired_companies() as total')
    expect(purged.rows[0]?.total).toBe(1)
    expect((await db.query('select lifecycle from sync_v2.scope where kind=$1 and scope_id=$2',['company',COMPANY])).rows[0]?.lifecycle).toBe('purged')
    expect((await db.query('select purged from sync_v2.company_identity where id=$1',[COMPANY])).rows[0]?.purged).toBe(true)
    await expect(db.query('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3)',
      [COMPANY,'Replay stale local company',OWNER])).rejects.toThrow('SYNC_COMPANY_ID_PURGED')
  })

  it('denies a direct non-purge DELETE of an enrolled company before any tombstone', async () => {
    const other = '66666666-6666-7666-8666-666666666666'
    await db.query('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3)',
      [other,'No direct delete',OWNER])
    await db.query('insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values ($1,$2,$3,$4,$5)',
      [ACTOR,'company',other,'another-epoch','active'])
    await expect(db.query('delete from public.khata_companies where id=$1',[other])).rejects.toThrow('SYNC_COMPANY_PURGE_AUTHORITY_REQUIRED')
    expect((await db.query('select count(*)::int as n from public.khata_companies where id=$1',[other])).rows[0]?.n).toBe(1)
  })

  it('denies enrolled purge when the Central owner binding disappeared, preserving the company', async () => {
    const missingBindingCompany = '77777777-7777-7777-8777-777777777777'
    await db.query(`insert into public.khata_companies(id,name,owner_id,deleted_at,purge_after) values($1,$2,$3,now()-interval '40 days',now()-interval '1 day')`,
      [missingBindingCompany,'Orphaned enrollment',OWNER])
    await db.query('insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values ($1,$2,$3,$4,$5)',
      [ACTOR,'company',missingBindingCompany,'orphaned-epoch','retired'])
    await db.query('delete from orbis_khata.principals where orbis_identity_id=$1',[ACTOR])
    await expect(db.query('select orbis_khata.purge_retired_companies()')).rejects.toThrow('SYNC_COMPANY_PURGE_AUTHORITY_REQUIRED')
    expect((await db.query('select count(*)::int as n from public.khata_companies where id=$1',[missingBindingCompany])).rows[0]?.n).toBe(1)
    expect((await db.query('select lifecycle from sync_v2.scope where scope_id=$1',[missingBindingCompany])).rows[0]?.lifecycle).toBe('retired')
  })

  it('separate never-enrolled legacy company remains active after the other company purge', async () => {
    await db.query('insert into public.khata_companies(id,name,owner_id) values ($1,$2,$3)',
      [COMPANY_TWO,'Unrelated legacy',OWNER])
    await addParty(id('f'),COMPANY_TWO)
    expect((await db.query('select count(*)::int as n from public.khata_parties where company_id=$1', [COMPANY_TWO])).rows[0]?.n).toBe(1)
  })
})
