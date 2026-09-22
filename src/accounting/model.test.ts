import { expect, it } from 'vitest'
import { minor, money } from './model'
it.each([['1000', '100000'], ['1200.01', '120001'], ['০.১০', '10'], ['१२.३४', '1234'], ['9999999999.99', '999999999999']])('parses exact paise %s', (input, expected) => expect(minor(input)).toBe(expected))
it.each(['0', '-1', '1e3', 'Infinity', '1.001', '1,000', '', '10000000000', '.5'])('rejects ambiguous or invalid money %s', input => expect(() => minor(input)).toThrow())
it('formats advances and large values without floating-point rounding', () => {
  expect(money(-20000n)).toBe('−₹200.00')
  expect(money('999999999999')).toBe('₹9,99,99,99,999.99')
  expect(100000n - 60000n - 60000n).toBe(-20000n)
})
