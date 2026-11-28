import { afterEach, expect, it, vi } from 'vitest'
import { androidLocalFirst } from '../native-local/route'
import { dailyLedgerEnabled, dailyLedgerWebEntry } from './availability'

vi.mock('../native-local/route', () => ({ androidLocalFirst: vi.fn() }))

afterEach(() => vi.unstubAllEnvs())

it.each([
  [undefined, true, false],
  ['enabled', false, false],
  ['enabled', true, true],
])('requires an explicit flag (%s) and a supported Android runtime (%s)', (flag, android, expected) => {
  vi.stubEnv('VITE_KHATA_DAILY_LEDGER', flag)
  vi.mocked(androidLocalFirst).mockReturnValue(android)
  expect(dailyLedgerEnabled()).toBe(expected)
})

it('keeps the web entry disabled by default and restricted to the configured signed-in owner', () => {
  const owner = '01234567-89ab-7def-8123-456789abcdef'
  vi.mocked(androidLocalFirst).mockReturnValue(false)
  expect(dailyLedgerWebEntry(owner)).toBe(false)
  vi.stubEnv('VITE_KHATA_DAILY_LEDGER_WEB_OWNER', 'bad-id')
  expect(dailyLedgerWebEntry('bad-id')).toBe(false)
  vi.stubEnv('VITE_KHATA_DAILY_LEDGER_WEB_OWNER', owner)
  expect(dailyLedgerWebEntry(owner)).toBe(true)
  expect(dailyLedgerWebEntry(null)).toBe(false)
  expect(dailyLedgerWebEntry('01234567-89ab-7def-8123-456789abcdea')).toBe(false)
  vi.mocked(androidLocalFirst).mockReturnValue(true)
  expect(dailyLedgerWebEntry(owner)).toBe(false)
})
