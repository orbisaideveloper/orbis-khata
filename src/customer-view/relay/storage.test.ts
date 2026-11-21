import { afterEach,expect,it,vi } from 'vitest'
import { readRelayCache,saveRelayCache } from './storage'
import { readNativeStatementRelay,saveNativeStatementRelay } from '../../native-local/runtime'
vi.mock('../../native-local/route',()=>({androidLocalFirst:()=>true}))
vi.mock('../../native-local/runtime',()=>({readNativeStatementRelay:vi.fn(),saveNativeStatementRelay:vi.fn()}))
afterEach(()=>vi.resetAllMocks())
it('uses encrypted native persistence and propagates durable save failures',async()=>{
 vi.mocked(readNativeStatementRelay).mockResolvedValue(null)
 expect(await readRelayCache('actor')).toEqual({version:1,links:{}})
 const cache={version:1 as const,links:{}}
 vi.mocked(readNativeStatementRelay).mockResolvedValue(cache)
 expect(await readRelayCache('actor')).toEqual(cache)
 await saveRelayCache('actor',cache)
 expect(saveNativeStatementRelay).toHaveBeenCalledWith('actor',cache)
 vi.mocked(saveNativeStatementRelay).mockRejectedValue(new Error('disk full'))
 await expect(saveRelayCache('actor',cache)).rejects.toThrow('disk full')
})
it('never converts a corrupt cache into a successful empty receipt',async()=>{
 vi.mocked(readNativeStatementRelay).mockResolvedValue({version:2,links:{}})
 await expect(readRelayCache('actor')).rejects.toThrow('SHARE_LOCAL_CORRUPTED')
})
