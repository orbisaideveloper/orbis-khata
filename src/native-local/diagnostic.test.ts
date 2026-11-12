import {describe,expect,it} from 'vitest'
import {nativeAuthDiagnostic} from './diagnostic'

describe('native offline enrollment error presentation',()=>{
  it('labels the phase when the native plugin returns a safe error code',()=>{
    expect(nativeAuthDiagnostic('ENROLL_SIGNIN',new Error('ANDROID_ENROLL_DB_OPEN_FAILED')))
      .toBe('ENROLL_SIGNIN / ANDROID_ENROLL_DB_OPEN_FAILED')
  })
  it('never exposes SQL text, emails, secrets or arbitrary exception messages',()=>{
    expect(nativeAuthDiagnostic('ENROLL_SIGNIN',new Error('sqlite error user@example.com / token=secret')))
      .toBe('ENROLL_SIGNIN / UNCLASSIFIED')
    expect(nativeAuthDiagnostic('CENTRAL_RESTORE',new Error('https://example.test/path?token=private')))
      .toBe('CENTRAL_RESTORE / UNCLASSIFIED')
  })
  it('labels offline restoration separately from central network errors',()=>{
    expect(nativeAuthDiagnostic('OFFLINE_RESTORE',new Error('ANDROID_LOCAL_IDENTITY_NOT_ENROLLED')))
      .toBe('OFFLINE_RESTORE / ANDROID_LOCAL_IDENTITY_NOT_ENROLLED')
    expect(nativeAuthDiagnostic('CENTRAL_RESTORE',new Error('CUSTOMER_SERVICE_UNAVAILABLE')))
      .toBe('CENTRAL_RESTORE / CUSTOMER_SERVICE_UNAVAILABLE')
  })
  it('rejects input values carrying anything besides fixed code characters',()=>{
    expect(nativeAuthDiagnostic('CENTRAL_WAIT',new Error('ANDROID_DB_READ_FAILED; DELETE FROM accounts')))
      .toBe('CENTRAL_WAIT / UNCLASSIFIED')
  })
})
