import { IDBFactory } from 'fake-indexeddb'
import { expect, it } from 'vitest'
import { beginPaymentAttempt, confirmPaymentAttempt } from './payment-attempt'

it('serializes concurrent attempts for the same payment, while separating accounts', async () => {
  const db = new IDBFactory()
  const [first, second, other] = await Promise.all([
    beginPaymentAttempt(db, 'actor-a:payment'), beginPaymentAttempt(db, 'actor-a:payment'), beginPaymentAttempt(db, 'actor-b:payment'),
  ])
  expect(first).toBe(second)
  expect(other).not.toBe(first)
})

it('a late response cannot discard a newer payment attempt', async () => {
  const db = new IDBFactory()
  const key = 'actor-a:payment'
  const before = await beginPaymentAttempt(db, key)
  await confirmPaymentAttempt(db, key, before)
  const next = await beginPaymentAttempt(db, key)
  expect(next).not.toBe(before)
  await confirmPaymentAttempt(db, key, before)
  expect(await beginPaymentAttempt(db, key)).toBe(next)
})
