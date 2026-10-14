import { expect, it } from 'vitest'
import { pendingCommand } from './pending-command'
const command = { id: 'retry-id', company: 'company', party: 'party', kind: 'receipt', date: '2026-01-01', amount: '100', method: 'cash', reference: '', note: '', reverses: null }
it('preserves exact money and retry ID, rebuilding only known command fields', () => {
  const value = JSON.parse('{"__proto__":{"polluted":true}}')
  expect(pendingCommand({ ...value, ...command, extra: 'ignored' })).toEqual(command)
  expect(pendingCommand({ ...command, method: 'bank', reverses: 'original-id' })).toEqual({ ...command, method: 'bank', reverses: 'original-id' })
})
it.each([null, false, 1, 'string', []])('rejects non-command storage %j', value => expect(pendingCommand(value)).toBeNull())
it.each([
  ['id', undefined], ['id', 'x'.repeat(129)], ['id', ''], ['id', '<script>'],
  ['company', null], ['party', 1], ['date', 1], ['date', 'x'.repeat(11)], ['date', 'invalid'], ['date', '2026-99-01'], ['date', '2026-02-30'],
  ['amount', 1], ['amount', '1'.repeat(13)], ['amount', '-1'], ['amount', '0'],
  ['kind', 'script'], ['kind', ['sale']], ['method', 'script'], ['reference', '<script>'], ['reference', 1], ['reference', 'x'.repeat(81)],
  ['note', '<img src=x>'], ['note', null], ['note', 'x'.repeat(501)], ['reverses', ''],
])('rejects invalid %s without restoring a poisoned command', (key, value) => expect(pendingCommand({ ...command, [key as string]: value })).toBeNull())
