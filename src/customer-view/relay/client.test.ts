import { afterEach,expect,it,vi } from 'vitest'
import { syncStatements } from './client'
import { readRelayCache,saveRelayCache } from './storage'
import { requestStatementRelay } from '../../accounting/api'
import { readSource } from './source'
vi.mock('./storage',()=>({readRelayCache:vi.fn(),saveRelayCache:vi.fn()}))
vi.mock('../../accounting/api',()=>({requestStatementRelay:vi.fn()}))
vi.mock('./source',()=>({readSource:vi.fn()}))
afterEach(()=>vi.resetAllMocks())
it('coalesces concurrent foreground requests and releases failed exchanges for retry',async()=>{
 vi.mocked(readRelayCache).mockResolvedValue({version:1,links:{}})
 vi.mocked(requestStatementRelay).mockResolvedValue([])
 const one=syncStatements('actor',()=>true),two=syncStatements('actor',()=>true)
 expect(one).toBe(two);await one
 expect(requestStatementRelay).toHaveBeenCalledOnce()
 await expect(syncStatements('actor',()=>false)).rejects.toThrow('SHARE_ACTOR_CHANGED')
 expect(await syncStatements('actor',()=>true)).toEqual({version:1,links:{}})
})
it('uses actor-bound storage and source ports for an outgoing accepted link',async()=>{
 const scope={module:'khata' as const,company:'11111111-1111-4111-8111-111111111111',party:'22222222-2222-4222-8222-222222222222',companyName:'Books',partyName:'Party'}
 const link={...scope,id:'33333333-3333-4333-8333-333333333333',recipient:'ORB-U-23456789',status:'accepted',outgoing:true,revision:0,acknowledged:0,resync:true}
 vi.mocked(readRelayCache).mockResolvedValue({version:1,links:{}})
 vi.mocked(readSource).mockResolvedValue({scope,rows:[]})
 vi.mocked(requestStatementRelay).mockImplementation(async(_actor,command)=>(command.action==='list'?[link]:{revision:1}) as never)
 await syncStatements('sender',()=>true)
 expect(readSource).toHaveBeenCalledWith('sender',link)
 expect(saveRelayCache).toHaveBeenCalledWith('sender',expect.objectContaining({version:1}))
})
