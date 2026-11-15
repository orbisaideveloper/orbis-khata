// @vitest-environment node
import { expect, it } from 'vitest'
import { khataOperation } from '../accounting/server-gateway'
import { createRecoveryEnvelope } from './server-recovery-envelope'

const actor = '01234567-89ab-7def-8123-456789abcdef'
const record = { email: 'user@example.com', key: 'aa'.repeat(32) }

it('wraps each recovery record with a fresh nonce and binds it to the ORBIS identity', async () => {
  const envelope = createRecoveryEnvelope('bb'.repeat(32))
  const sealed = await envelope.seal(actor, record)
  expect(sealed).not.toContain(record.key)
  expect(await envelope.seal(actor, record)).not.toBe(sealed)
  await expect(envelope.open(actor, sealed)).resolves.toEqual(record)
  await expect(envelope.open('different-actor', sealed)).rejects.toThrow()
  await expect(createRecoveryEnvelope('cc'.repeat(32)).open(actor, sealed)).rejects.toThrow()
})

it('accepts only the bounded recovery operations with an expected actor', () => {
  const parse = (input: unknown) => khataOperation({ version: 'orbis.khata.data.v1', operation: 'drive-recovery', input })
  expect(parse({ actor, action: 'read' })).not.toBeNull()
  expect(parse({ actor, action: 'link', ...record })).not.toBeNull()
  expect(parse({ actor, action: 'read', ...record })).toBeNull()
  expect(parse({ actor, action: 'link', ...record, key: 'bad' })).toBeNull()
})
