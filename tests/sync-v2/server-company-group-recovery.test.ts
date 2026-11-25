import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { setup } from '../../scripts/sql-fixture.mjs'

const BASE = [
  '20261031075245_lottery_row_storage.sql',
  '20261031081126_continuous_production.sql',
  '20261101144338_expense_profile_schedules.sql',
  '20261105101338_safe_retired_company_purge.sql',
  '20261124173000_private_lottery_sync_payment.sql',
  '20261125100000_lottery_immutable_feed_recovery.sql',
  '20261125103000_sync_device_pairing.sql',
]
const OWNER='11111111-1111-7111-8111-111111111111'
const ACTOR='22222222-2222-7222-8222-222222222222'
const COMPANY='33333333-3333-7333-8333-333333333333'
const EPOCH='safe-recovery-1'
const REGISTRATION='server-review-android'
const PROOF='a'.repeat(64)
const digest=(s:string)=>createHash('sha256').update(s).digest('hex')

describe('2B company committed-group recovery (review only)',()=>{
  let db:PGlite
  const recover = async(after:number,item:number|null,offset:number|null,actor=ACTOR,company=COMPANY,proof=PROOF)=>(
    await db.query('select sync_v2.read_trusted_company_group($1::uuid,$2,$3,$4,$5,$6::bigint,$7::integer,$8::integer) as v',
      [actor,REGISTRATION,proof,company,EPOCH,after,item,offset])).rows[0]?.v as Record<string,unknown>

  beforeAll(async()=>{
    db=await setup()
    for (const name of BASE) await db.exec(await readFile(`supabase/migrations/${name}`,'utf8'))
    await db.exec(await readFile('supabase/review-candidates/20261125_private_company_financial_capture.review.sql','utf8'))
    await db.exec(await readFile('supabase/review-candidates/20261125_private_company_group_recovery.review.sql','utf8'))
    await db.query('insert into auth.users(id) values($1)',[OWNER])
    await db.query('insert into orbis_khata.ledger_owners(id,legacy) values($1,false)',[OWNER])
    await db.query('insert into orbis_khata.principals(orbis_identity_id,ledger_owner_id,approval_reference) values($1,$2,$3)',
      [ACTOR,OWNER,'isolated-group-review'])
    await db.query('insert into public.khata_companies(id,name,owner_id) values($1,$2,$3)',[COMPANY,'Isolated company',OWNER])
    await db.query("insert into sync_v2.scope(actor_id,kind,scope_id,epoch,lifecycle) values($1,'company',$2,$3,'active')",
      [ACTOR,COMPANY,EPOCH])
    await db.query('insert into sync_v2.registered_device(actor,registration,credential_sha256,client,primary_android,expires_at) values($1,$2,$3,$4,$5,now()+interval \'3 days\')',
      [ACTOR,REGISTRATION,PROOF,'android',true])
    await db.query('insert into sync_v2.device_scope_grant(actor,registration,kind,scope_id,epoch,can_write) values($1,$2,$3,$4,$5,false)',
      [ACTOR,REGISTRATION,'company',COMPANY,EPOCH])
    await db.query("insert into sync_v2.sync_entitlement(actor,capability,expires_at) values($1,'sync.single-primary',now()+interval '3 days')",[ACTOR])
    // One PGlite fixture transaction with more than the grouped-feed 500-event limit.
    await db.transaction(async tx=>{
      await tx.query("update sync_v2.scope set head=510 where actor_id=$1 and kind='company' and scope_id=$2",[ACTOR,COMPANY])
      await tx.query(`insert into sync_v2.event(actor_id,kind,scope_id,epoch,seq,operation_id,change)
        select $1,'company',$2,$3,n,null,jsonb_build_array(jsonb_build_object('entityType','audit','n',n))
        from generate_series(1,510) n`,[ACTOR,COMPANY,EPOCH])
    })
  },60000)
  afterAll(async()=>db?.close())

  it('reports immutable transaction manifest without truncating a >500-event financial group',async()=>{
    await expect(db.query('select sync_v2.read_trusted_feed($1::uuid,$2,$3,$4,$5,$6,0,500)',
      [ACTOR,REGISTRATION,PROOF,'company',COMPANY,EPOCH])).rejects.toThrow('SYNC_FEED_GROUP_TOO_LARGE')
    const m=await recover(0,null,null)
    expect(m).toMatchObject({version:1,purpose:'group',scopeKind:'company',scopeId:COMPANY,
      epoch:EPOCH,transfer:'0:510',from:'0',next:'510',items:510})
    expect(Number(m.bytes)).toBeGreaterThan(0)
  })
  it('reads integrity-checked fragments and preserves exact immutable sequence',async()=>{
    const a=await recover(0,1,0)
    const data=Buffer.from(a.hex as string,'hex')
    expect(digest(data.toString())).toBe(a.sha256)
    expect(JSON.parse(data.toString())).toMatchObject({seq:'1',operationId:null})
    expect(a).toMatchObject({transfer:'0:510',item:1,offset:0,size:data.length,nextOffset:data.length})
    expect((await recover(0,510,0)).item).toBe(510)
  })
  it('fails closed on untrusted device, wrong company, invalid offset and split cursors',async()=>{
    await expect(recover(0,null,null,ACTOR,COMPANY,'bad')).rejects.toThrow('SYNC_TRUSTED_DEVICE_DENIED')
    await expect(recover(0,null,null,ACTOR,'55555555-5555-7555-8555-555555555555')).rejects.toThrow()
    await expect(recover(0,1,-1)).rejects.toThrow('SYNC_RECOVERY_FRAGMENT_CURSOR')
    await expect(recover(0,511,0)).rejects.toThrow('SYNC_RECOVERY_FRAGMENT_CURSOR')
    await expect(recover(1,null,null)).rejects.toThrow('SYNC_FEED_SPLIT_CURSOR')
    await expect(recover(510,null,null)).rejects.toThrow('SYNC_RECOVERY_GROUP_ABSENT')
  })
  it('revocation or scope-retirement immediately disables readback',async()=>{
    await db.query('update sync_v2.registered_device set revoked_at=now() where actor=$1 and registration=$2',
      [ACTOR,REGISTRATION])
    await expect(recover(0,null,null)).rejects.toThrow('SYNC_TRUSTED_DEVICE_DENIED')
    await db.query('update sync_v2.registered_device set revoked_at=null where actor=$1 and registration=$2',
      [ACTOR,REGISTRATION])
    await db.query("update sync_v2.scope set lifecycle='retired' where actor_id=$1 and scope_id=$2",[ACTOR,COMPANY])
    await expect(recover(0,null,null)).rejects.toThrow('SYNC_COMPANY_RECOVERY_DENIED')
  })
})
