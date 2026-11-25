// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

const lotteryUrl = process.env.KHATA_SYNC_V2_LOTTERY_COVERAGE_URL
const deviceUrl = process.env.KHATA_SYNC_V2_DEVICE_COVERAGE_URL

it.runIf(process.env.KHATA_SYNC_V2_NATIVE_COVERAGE === '1' || Boolean(lotteryUrl))(
  'exercises the real Lottery payment, recovery, and client pairing paths under coverage',
  async () => {
    expect(lotteryUrl).toBeTruthy()
    vi.stubEnv('KHATA_SYNC_V2_TEST_URL', lotteryUrl)
    await import('../../scripts/verify-sync-v2-lottery.mjs')
  },
  90_000,
)

it.runIf(process.env.KHATA_SYNC_V2_NATIVE_COVERAGE === '1' || Boolean(deviceUrl))(
  'exercises the real trusted-device voucher and feed paths under coverage',
  async () => {
    expect(deviceUrl).toBeTruthy()
    vi.stubEnv('KHATA_SYNC_V2_TEST_URL', deviceUrl)
    await import('../../scripts/verify-sync-v2-trusted-device.mjs')
  },
  90_000,
)
