// Android-only UI regressions: protect the sign-in path after native failures.
import {act,cleanup,renderHook,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {useAccount} from './useAccount'

const mocks=vi.hoisted(()=>({
  listeners:[] as Array<(event:string,session:unknown)=>void>,
  getSession:vi.fn(),
  restore:vi.fn(),
  enroll:vi.fn(),
  lock:vi.fn(),
}))
vi.mock('./client',()=>({authClient:{auth:{
  getSession:mocks.getSession,
  onAuthStateChange:(fn:(event:string,session:unknown)=>void)=>{
    mocks.listeners.push(fn)
    return {data:{subscription:{unsubscribe:()=>{
      const i=mocks.listeners.indexOf(fn);if(i>=0)mocks.listeners.splice(i,1)
    }}}}
  },
}}}))
vi.mock('../native-local/route',()=>({androidLocalFirst:()=>true}))
vi.mock('../native-local/runtime',()=>({
  restoreNativeOfflineIdentity:mocks.restore,
  enrollVerifiedCentralIdentity:mocks.enroll,
  lockNativeOfflineIdentity:mocks.lock,
}))
const session={user:{id:'019a18a0-1111-7111-8111-111111111111',user_metadata:{orbis_display_id:'ORB-U-23456789'}}}
beforeEach(()=>{
  mocks.listeners.length=0
  mocks.getSession.mockReset().mockResolvedValue({data:{session:null},error:null})
  mocks.restore.mockReset().mockResolvedValue(null)
  mocks.enroll.mockReset().mockResolvedValue(undefined)
  mocks.lock.mockReset()
})
afterEach(()=>cleanup())
describe('Android offline auth recovery screen state',()=>{
  it('reports failed encrypted restore, preserves records and allows manual sign in',async()=>{
    mocks.restore.mockRejectedValueOnce(new Error('ANDROID_LOCAL_IDENTITY_NOT_ENROLLED'))
    const hook=renderHook(()=>useAccount())
    await waitFor(()=>expect(hook.result.current.unavailable).toBe(true))
    expect(hook.result.current.diagnosticCode).toBe('OFFLINE_RESTORE / ANDROID_LOCAL_IDENTITY_NOT_ENROLLED')
    expect(mocks.lock).not.toHaveBeenCalled()
    act(()=>hook.result.current.tryOnlineLogin())
    expect(hook.result.current.manualLogin).toBe(true)
    expect(hook.result.current.unavailable).toBe(false)
    expect(mocks.listeners).toHaveLength(1)
  })
  it('labels an offline central session failure separately; preserves the sign-in action',async()=>{
    mocks.getSession.mockResolvedValueOnce({data:{session:null},error:new Error('CUSTOMER_SERVICE_UNAVAILABLE')})
    const hook=renderHook(()=>useAccount())
    await waitFor(()=>expect(hook.result.current.unavailable).toBe(true))
    expect(hook.result.current.diagnosticCode).toBe('CENTRAL_RESTORE / CUSTOMER_SERVICE_UNAVAILABLE')
    act(()=>hook.result.current.tryOnlineLogin())
    expect(hook.result.current.manualLogin).toBe(true)
  })
  it('exposes native enrollment failures without leaking native exception text',async()=>{
    mocks.enroll.mockRejectedValueOnce(new Error('ANDROID_ENROLL_DB_OPEN_FAILED'))
    const hook=renderHook(()=>useAccount())
    await waitFor(()=>expect(hook.result.current.loading).toBe(false))
    await act(async()=>{for(const event of [...mocks.listeners])event('SIGNED_IN',session)})
    await waitFor(()=>expect(hook.result.current.unavailable).toBe(true))
    expect(hook.result.current.diagnosticCode).toBe('ENROLL_SIGNIN / ANDROID_ENROLL_DB_OPEN_FAILED')
    expect(hook.result.current.session).toBeNull()
  })
})

it('requires a fresh central sign-in on a phone without screen lock', async () => {
  mocks.restore.mockRejectedValueOnce(new Error('ANDROID_DEVICE_LOCK_ONLINE_SIGNIN_REQUIRED'))
  const hook = renderHook(useAccount)
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  expect(hook.result.current.session).toBeNull()
  expect(mocks.getSession).not.toHaveBeenCalled()
  act(() => mocks.listeners[0]('SIGNED_IN', session))
  await waitFor(() => expect(hook.result.current.session).toEqual(session))
  expect(mocks.enroll).toHaveBeenCalledOnce()
})
