import {expect,it,vi} from 'vitest'
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:vi.fn(()=> 'web')}}))
import {Capacitor} from '@capacitor/core'
import {androidLocalFirst} from './route'
it('never routes current web/PWA to native offline state',()=>{
  expect(androidLocalFirst()).toBe(false)
  vi.mocked(Capacitor.getPlatform).mockReturnValue('android')
  expect(androidLocalFirst()).toBe(true)
  vi.mocked(Capacitor.getPlatform).mockReturnValue('web')
})
