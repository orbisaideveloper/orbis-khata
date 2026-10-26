import {expect,it} from 'vitest'
import {keyedRows} from './list-keys'
import {textValue} from './text-value'
it('keeps repeated ledger lines distinct and unrelated inserted rows do not change their identities',()=>{const rows=[{code:'milk'},{code:'milk'},{code:'rice'}];const first=keyedRows(rows,row=>row.code);expect(new Set(first.map(row=>row.key)).size).toBe(3);const second=keyedRows([{code:'oil'},...rows],row=>row.code);expect(second.slice(1).map(row=>row.key)).toEqual(first.map(row=>row.key))})
it('accepts text and never stringifies arbitrary input objects',()=>{let called=false;expect(textValue({toString(){called=true;return 'unexpected'}})).toBe('');expect(called).toBe(false);expect(textValue(null)).toBe('');expect(textValue('Customer')).toBe('Customer')})
