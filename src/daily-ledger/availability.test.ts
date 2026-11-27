import { afterEach, expect, it, vi } from 'vitest'
import { androidLocalFirst } from '../native-local/route'
import { dailyLedgerEnabled } from './availability'

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
