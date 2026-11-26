import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { setup } from '../../scripts/sql-fixture.mjs'

const migrations = [
  '20261031075245_lottery_row_storage.sql',
  '20261031081126_continuous_production.sql',
  '20261101144338_expense_profile_schedules.sql',
  '20261105101338_safe_retired_company_purge.sql',
  '20261124173000_private_lottery_sync_payment.sql',
  '20261125100000_lottery_immutable_feed_recovery.sql',
  '20261125103000_sync_device_pairing.sql',
]
const owner='11111111-1111-7111-8111-111111111111'
const actor='22222222-2222-7222-8222-222222222222'
const company='33333333-3333-7333-8333-333333333333'
const another='55555555-5555-7555-8555-555555555555'
const party1='44444444-4444-7444-8444-444444444444'
const party2='66666666-6666-7666-8666-666666666666'
const epoch='historical-snapshot-review'
const cred='a'.repeat(64)

type Row={model:string,key:string,projectionJson:string}
type Page={scopeId:string;epoch:string;highWater:string;nextModel:string|null;nextKey:string|null;done:boolean;rows:Row[]}

describe('Phase 2B: full-company historical snapshot, review-only SQL',()=>{
 let db:PGlite
 const read=async({afterModel=null,afterKey=null,expectedHead=null,registration='test-device',digest=cred,scope=company,limit=10,maxBytes=262144}:
  {afterModel?:string|null,afterKey?:string|null,expectedHead?:string|null,registration?:string,digest?:string,scope?:string,limit?:number,maxBytes?:number}={}):Promise<Page>=>{
  const r=await db.query(`select sync_v2.read_trusted_company_snapshot(
    $1::uuid,$2,$3,$4::uuid,$5,$6::bigint,$7,$8,$9,$10) as result`,
    [actor,registration,digest,scope,epoch,expectedHead,afterModel,afterKey,limit,maxBytes])
  return r.rows[0]?.result as Page
 }
 beforeAll(async()=>{
  db=await setup()
  for(const f of migrations)await db.exec(await readFile('supabase/migrations/'+f,'utf8'))
  for(const f of ['20261125_private_company_financial_capture.review.sql',
    '20261125_private_company_group_recovery.review.sql',
    '20261126_private_company_historical_snapshot.review.sql'])
   await db.exec(await readFile('supabase/review-candidates/'+f,'utf8'))
  await db.exec('grant usage on schema auth to authenticated')
  await db.query('insert into auth.users(id) values($1)',[owner])
  await db.query('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[owner])
  await db.query('insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values($1,$2,$3)',[actor,owner,'isolated-test'])
  await db.query('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3)',[company,'Safe old company',owner])
  await db.query('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3)',[another,'Other private company',owner])
  await db.query("insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values($1,'company',$2,$3,'active')",[actor,company,epoch])
  await db.query('insert into sync_v2.registered_device(actor,registration,credential_sha256,client,primary_android,expires_at) values($1,$2,$3,$4,true,now()+interval \'1 day\')',[actor,'test-device',cred,'android'])
  await db.query("insert into sync_v2.sync_entitlement(actor,capability,expires_at) values($1,'sync.single-primary',now()+interval '1 day')",[actor])
  await db.query("insert into sync_v2.device_scope_grant(actor,registration,kind,scope_id,epoch,can_write) values($1,$2,'company',$3,$4,false)",[actor,'test-device',company,epoch])
  await db.query('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',[party1,company,'Old customer','both'])
  await db.query('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',[party2,another,'Other company private','both'])
 },60_000)
 afterAll(async()=>{await db?.close()})

 it('includes every actual company_id relation using its real composite primary key',async()=>{
  const tables = (await db.query(`select c.relname as name,
    array_agg(a.attname order by ord.n) as pk
    from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    join pg_attribute scope on scope.attrelid=c.oid and scope.attname='company_id' and not scope.attisdropped
    join pg_constraint co on co.conrelid=c.oid and co.contype='p'
    join unnest(co.conkey) with ordinality ord(attnum,n) on true
    join pg_attribute a on a.attrelid=c.oid and a.attnum=ord.attnum
    where ns.nspname='public' and c.relkind in ('r','p')
    group by c.relname order by c.relname`)).rows as {name:string,pk:string[]}[]
  const sql = await readFile('supabase/review-candidates/20261126_private_company_historical_snapshot.review.sql','utf8')
  expect(tables).toHaveLength(22)
  for(const {name,pk} of tables){
   const fields=pk.map(field=>`r.${field}`).join(',')
   expect(sql).toContain(`select '${name}'::text, jsonb_build_array(${fields})::text`)
   expect(sql).toContain(`from public.${name} r where r.company_id=c`)
  }
 })
 it('returns the company itself plus existing historical company rows, excluding another tenant',async()=>{
  const p=await read()
  expect(p.scopeId).toBe(company)
  expect(p.highWater).toBe('1')
  expect(p.rows.map(row=>row.model)).toContain('khata_companies')
  expect(p.rows.map(row=>row.model)).toContain('khata_parties')
  expect(p.rows.some(row=>row.projectionJson.includes(party1))).toBe(true)
  expect(p.rows.some(row=>row.projectionJson.includes(party2))).toBe(false)
 })
 it('paginates by stable (model, composite primary key) with no duplicates',async()=>{
  let p=await read({limit:1}); const high=p.highWater; const keys:string[]=[]
  for(let i=0;i<10;i++){
   keys.push(...p.rows.map(r=>`${r.model}:${r.key}`))
   if(p.done)break
   p=await read({afterModel:p.nextModel,afterKey:p.nextKey,expectedHead:high,limit:1})
  }
  expect(keys).toHaveLength(2)
  expect(new Set(keys).size).toBe(keys.length)
 })
 it('refuses unknown device, missing company scope, and oversized cursor',async()=>{
  await expect(read({digest:'bad'})).rejects.toThrow('SYNC_TRUSTED_DEVICE_DENIED')
  await expect(read({scope:another})).rejects.toThrow()
  await expect(read({limit:101})).rejects.toThrow('SYNC_COMPANY_SNAPSHOT_CURSOR_OR_LIMIT')
  await expect(read({maxBytes:512})).rejects.toThrow('SYNC_COMPANY_SNAPSHOT_PAGE_TOO_LARGE')
 })
 it('rejects fabricated continuation keys instead of silently skipping records',async()=>{
  const p=await read({limit:1})
  await expect(read({afterModel:'khata_parties',afterKey:'["nonexistent"]',expectedHead:p.highWater,limit:1}))
    .rejects.toThrow('SYNC_COMPANY_SNAPSHOT_CURSOR_OR_LIMIT')
  await expect(read({afterModel:'zz-fake-model',afterKey:'[]',expectedHead:p.highWater,limit:1}))
    .rejects.toThrow('SYNC_COMPANY_SNAPSHOT_CURSOR_OR_LIMIT')
 })
 it('refuses a stitched historical snapshot after the company head changes',async()=>{
  const old=await read({limit:1})
  await db.query('insert into public.khata_parties(id,company_id,name,kind) values($1,$2,$3,$4)',
    ['77777777-7777-7777-8777-777777777777',company,'Later customer','both'])
  await expect(read({afterModel:old.nextModel,afterKey:old.nextKey,expectedHead:old.highWater,limit:1}))
    .rejects.toThrow('SYNC_COMPANY_SNAPSHOT_STALE')
 })
 it('includes old voucher accounting events in a trusted complete-company snapshot',async()=>{
  const id='88888888-8888-7888-8888-888888888888'
  await db.transaction(async tx=>{
   await tx.query('select set_config($1,$2,true),set_config($3,$4,true)',[
    'request.jwt.claims',JSON.stringify({sub:owner,role:'authenticated'}),
    'orbis.khata.gateway_verified','v1'])
   await tx.exec('set local role authenticated')
   await tx.query('select public.khata_post_v1($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$6,$7,$8,$9,$10::uuid)',[
    id,company,party1,'receipt','2026-11-25','120','cash','','Old posted receipt',null])
  })
  const p=await read()
  const voucher=p.rows.find(row=>row.model==='khata_vouchers' && row.projectionJson.includes(id))
  expect(voucher).toBeTruthy()
 })

 it('includes fiscal counters with composite company-kind-year identity',async()=>{
  await db.query('insert into public.khata_fiscal_counters(company_id,kind,fiscal_year,next_serial) values($1,$2,$3,$4)',
    [company,'sale',2026,'7'])
  const p=await read({limit:100})
  const counter=p.rows.find(row=>row.model==='khata_fiscal_counters')
  expect(counter).toBeTruthy()
  expect(JSON.parse(counter?.key ?? '[]')).toEqual([company,'sale',2026])
  expect(JSON.parse(counter?.projectionJson ?? '{}').next_serial).toBe(7)
 })

 it('immediately rejects a revoked device even if it holds a previously valid page cursor',async()=>{
  const p=await read({limit:1})
  await db.query('update sync_v2.registered_device set revoked_at=now() where actor=$1 and registration=$2',
   [actor,'test-device'])
  await expect(read({afterModel:p.nextModel,afterKey:p.nextKey,expectedHead:p.highWater,limit:1}))
   .rejects.toThrow('SYNC_TRUSTED_DEVICE_DENIED')
 })

})
