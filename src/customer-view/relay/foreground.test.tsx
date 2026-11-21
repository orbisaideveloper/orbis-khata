import { act,renderHook,cleanup,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { useStatementRelay } from './foreground'
import { syncStatements } from './client'
vi.mock('./client',()=>({syncStatements:vi.fn()}))
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.resetAllMocks()})
it('syncs on foreground, online and timer but stops after unmount',async()=>{
 vi.mocked(syncStatements).mockResolvedValue({version:1,links:{}})
 const hook=renderHook(()=>useStatementRelay('actor'))
 await waitFor(()=>expect(syncStatements).toHaveBeenCalledOnce())
 act(()=>window.dispatchEvent(new Event('online')))
 await waitFor(()=>expect(syncStatements).toHaveBeenCalledTimes(2))
 const active=vi.mocked(syncStatements).mock.calls[0][1]
 expect(active()).toBe(true)
 hook.unmount();expect(active()).toBe(false)
 window.dispatchEvent(new Event('online'));expect(syncStatements).toHaveBeenCalledTimes(2)
})
it('does no background or signed-out network work and tolerates connection failures',async()=>{
 const signedOut=renderHook(()=>useStatementRelay(null));expect(syncStatements).not.toHaveBeenCalled();signedOut.unmount()
 vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden')
 const hidden=renderHook(()=>useStatementRelay('actor'));expect(syncStatements).not.toHaveBeenCalled();hidden.unmount()
 vi.spyOn(document,'visibilityState','get').mockReturnValue('visible')
 vi.mocked(syncStatements).mockRejectedValue(new Error('offline'))
 renderHook(()=>useStatementRelay('actor'));await waitFor(()=>expect(syncStatements).toHaveBeenCalledOnce())
})
