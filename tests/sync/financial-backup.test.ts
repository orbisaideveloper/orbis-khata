import { exportDailyLedgerArchive, openDailyLedgerArchive } from '../../src/daily-ledger/backup'
import { expect, it } from 'vitest'
import { emptyDeviceLocalSnapshot } from '../../src/demo/store'
import { encryptFinancialBackup, generateFinancialBackupKey, inspectFinancialBackup } from '../../src/sync/financial-backup'

it('round-trips the ledger snapshot and rejects a different owner, key or modified archive', async () => {
  const snapshot = emptyDeviceLocalSnapshot()
  snapshot.companies.push({ id: 'shop', name: 'Private shop' })
  const key = generateFinancialBackupKey()
  const archive = await encryptFinancialBackup('owner', snapshot, key)
  expect(new TextDecoder().decode(archive)).not.toContain('Private shop')
  await expect(inspectFinancialBackup(archive, 'owner', key)).resolves.toEqual(snapshot)
  await expect(inspectFinancialBackup(archive, 'other', key)).rejects.toThrow('FINANCIAL_BACKUP_CONTENT_INVALID')
  await expect(inspectFinancialBackup(archive, 'owner', generateFinancialBackupKey())).rejects.toThrow()
  archive[archive.length - 1] ^= 1
  await expect(inspectFinancialBackup(archive, 'owner', key)).rejects.toThrow()
})

it('keeps the Daily Ledger and existing Khata/Lottery financial archive formats disjoint', async () => {
  const owner = '11111111-1111-7111-8111-111111111111'
  const key = generateFinancialBackupKey()
  const khata = await encryptFinancialBackup(owner, emptyDeviceLocalSnapshot(), key)
  const ledger = await exportDailyLedgerArchive(owner, [], key)
  await expect(inspectFinancialBackup(ledger, owner, key)).rejects.toThrow('FINANCIAL_BACKUP_ARCHIVE_INVALID')
  await expect(openDailyLedgerArchive(owner, khata, key)).rejects.toThrow('FINANCIAL_BACKUP_ARCHIVE_INVALID')
  await expect(openDailyLedgerArchive(owner, ledger, key)).resolves.toMatchObject({ rows: [] })
})
