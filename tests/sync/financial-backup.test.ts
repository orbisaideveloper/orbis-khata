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
