import { describe, expect, it } from 'vitest'
import { toSafeNativeParams } from './android-sqlcipher-runtime'
describe('SQLCipher native adapter parameter safety', () => {
  it('keeps all non-byte positional values bound', () => {
    expect(toSafeNativeParams('INSERT INTO x VALUES(?,?,?)',['actor',5,null])).toEqual({statement:'INSERT INTO x VALUES(?,?,?)',values:['actor',5,null]})
  })
  it('transports encrypted byte arrays as verified hex BLOB literal', () => {
    const result=toSafeNativeParams('INSERT INTO x VALUES(?,?,?)',['actor',new Uint8Array(17).fill(7),'company'])
    expect(result.statement).toContain(`X'${'07'.repeat(17)}'`)
    expect(result.values).toEqual(['actor','company'])
  })
  it('rejects missing/extra bind arguments',()=>expect(()=>toSafeNativeParams('SELECT ?',[])).toThrow('NATIVE_SQL_PARAM_COUNT'))
  it('rejects unsafe SQL comments',()=>expect(()=>toSafeNativeParams('SELECT ? -- injection',['a'])).toThrow('NATIVE_SQL_UNSUPPORTED_SYNTAX'))
  it('rejects oversized binary content',()=>expect(()=>toSafeNativeParams('INSERT INTO x VALUES(?)',[new Uint8Array(1024*1024+1)])).toThrow('NATIVE_BLOB_SIZE_INVALID'))
  it('rejects fractional and huge unsafe numeric input',()=>expect(()=>toSafeNativeParams('SELECT ?',[Number.MAX_SAFE_INTEGER+1])).toThrow('NATIVE_SQL_VALUE_INVALID'))
  it('rejects short non-AEAD records',()=>expect(()=>toSafeNativeParams('SELECT ?',[new Uint8Array(10)])).toThrow('NATIVE_BLOB_SIZE_INVALID'))
})
