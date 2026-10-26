import { afterEach, expect, it, vi } from 'vitest'
import { readBillTemplate, rememberBillTemplate } from './bill-preference'
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('orbis.khata.bill-template.v1') })
it('remembers only a display template and rejects unknown saved values', () => {
  expect(readBillTemplate()).toBe('sample')
  rememberBillTemplate('modern'); expect(readBillTemplate()).toBe('modern')
  rememberBillTemplate('classic'); expect(readBillTemplate()).toBe('classic')
  localStorage.setItem('orbis.khata.bill-template.v1', 'invalid'); expect(readBillTemplate()).toBe('sample')
})
it('keeps bill settings usable when browser storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
  expect(readBillTemplate()).toBe('sample'); expect(() => rememberBillTemplate('sample')).not.toThrow()
})
