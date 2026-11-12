import { describe, expect, it } from 'vitest'
import { createIsolatedAccountingDraft } from './b-accounting-command'
import { enqueueUnique } from '../sync/outbox-state'
import type { VerifiedOfflineGrant } from './offline-authority'
const now=1_730_000_000_000
const grant:VerifiedOfflineGrant={actorId:'actor-a',allowedCompanyIds:['company-a'],verifiedOnline:true,
  localUnlockVerified:true,revoked:false,validFromMs:now-5000,validUntilMs:now+5000}
const input={id:'voucher-1',company:'company-a',party:'party-1',kind:'sale',date:'2026-11-12',amount:'12345',
  method:'cash',reference:'INV-1',note:'fixture only',reverses:null}
const args={rawCommand:input,actorId:'actor-a',companyId:'company-a',operationId:'90fd78c8-9696-4f41-b327-83990f08fc01',
  baseVersion:null,createdAt:'2026-11-12T09:00:00Z',verifiedGrant:grant,nowMs:now}
describe('Step 06 Batch B: existing production Command schema -> isolated queue draft',()=>{
  it('reuses legacy bounded Command validator',()=>{
    const row=createIsolatedAccountingDraft(args)
    expect(row.state).toBe('queued');expect(row.envelope.commandType).toBe('accounting-post-draft')
    expect(row.envelope.payload).toMatchObject({id:'voucher-1',amount:'12345',kind:'sale',company:'company-a'})
  })
  it('stable operation id is safe for retries',()=>{
    const first=createIsolatedAccountingDraft(args)
    const second=createIsolatedAccountingDraft(args)
    expect(enqueueUnique([first],second)).toHaveLength(1)
  })
  it('conflicting payload under same operation id rejected',()=>{
    const first=createIsolatedAccountingDraft(args)
    const modified=createIsolatedAccountingDraft({...args,rawCommand:{...input,amount:'9999'}})
    expect(()=>enqueueUnique([first],modified)).toThrow('IDEMPOTENCY_CONFLICT')
  })
  it('foreign company denied before queueing',()=>{
    expect(()=>createIsolatedAccountingDraft({...args,rawCommand:{...input,company:'company-b'}})).toThrow('ACCOUNTING_COMPANY_MISMATCH')
  })
  it('missing grant denied',()=>{
    expect(()=>createIsolatedAccountingDraft({...args,verifiedGrant:null})).toThrow('OFFLINE_ACCESS_INVALID')
  })
  it('locked session denied',()=>{
    expect(()=>createIsolatedAccountingDraft({...args,verifiedGrant:{...grant,localUnlockVerified:false}})).toThrow()
  })
  it('invalid UUID cannot become a new offline operation',()=>{
    expect(()=>createIsolatedAccountingDraft({...args,operationId:'voucher-1'})).toThrow('ACCOUNTING_OPERATION_ID_INVALID')
  })
  it('zero financial amount rejected',()=>{
    expect(()=>createIsolatedAccountingDraft({...args,rawCommand:{...input,amount:'0'}})).toThrow('ACCOUNTING_COMMAND_INVALID')
  })
  it('unsafe amount over domain limit rejected',()=>{
    expect(()=>createIsolatedAccountingDraft({...args,rawCommand:{...input,amount:'999999999999'}})).not.toThrow()
    expect(()=>createIsolatedAccountingDraft({...args,rawCommand:{...input,amount:'1000000000000'}})).toThrow('ACCOUNTING_COMMAND_INVALID')
  })
  it('reversal without original voucher rejected',()=>{
    expect(()=>createIsolatedAccountingDraft({...args,rawCommand:{...input,kind:'reversal'}})).toThrow('ACCOUNTING_REVERSAL_TARGET_REQUIRED')
  })
  it('reversal with target permitted only as queued draft',()=>{
    const item=createIsolatedAccountingDraft({...args,rawCommand:{...input,kind:'reversal',reverses:'voucher-previous'}})
    expect(item.envelope.payload).toMatchObject({kind:'reversal',reverses:'voucher-previous'})
  })
  it('nonreversal may not target an earlier voucher',()=>{
    expect(()=>createIsolatedAccountingDraft({...args,rawCommand:{...input,reverses:'voucher-previous'}})).toThrow('ACCOUNTING_REVERSAL_ONLY')
  })
  it('pending command with malicious unexpected fields is reduced to permitted fields',()=>{
    const draft=createIsolatedAccountingDraft({...args,rawCommand:{...input,secret:'leak'}})
    expect(draft.envelope.payload).not.toHaveProperty('secret')
  })
  it('malformed date denied',()=>{
    expect(()=>createIsolatedAccountingDraft({...args,rawCommand:{...input,date:'2026-02-30'}})).toThrow('ACCOUNTING_COMMAND_INVALID')
  })
})
