import {expect,it} from 'vitest'
import {failClosedIfMissingSnapshot} from '../../src/native-local/snapshot-policy'
it('fresh enrollment can initialize an empty encrypted ledger',()=>{
  expect(()=>failClosedIfMissingSnapshot(true)).not.toThrow()
})
it('existing enrolled identity with no encrypted ledger fails closed instead of showing zero',()=>{
  expect(()=>failClosedIfMissingSnapshot(false)).toThrow('ANDROID_LOCAL_STATE_MISSING_FAIL_CLOSED')
})
