import { expect, it } from 'vitest'
import { accountCopy, accountError } from './copy'
it.each(['bn', 'hi', 'en'] as const)('maps every supported error alias in %s', language => {
  const text = accountCopy[language]
  for (const code of ['user_already_exists', 'email_exists']) expect(accountError(code, language)).toBe(text.exists)
  for (const code of ['over_request_rate_limit', 'over_email_send_rate_limit']) expect(accountError(code, language)).toBe(text.rate)
  expect(accountError('invalid_credentials', language)).toBe(text.credentials)
  expect(accountError(undefined, language)).toBe(text.error)
  expect(accountError('unknown', language)).toBe(text.error)
})
