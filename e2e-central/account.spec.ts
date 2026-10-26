import { expect, test, type Page } from '@playwright/test'

// These test-only protocol responses prove browser wiring, never live Auth or SQL.
const customer = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
const session = { version: 'orbis.customer.v1', customer, session: { accessToken: 'test.access', refreshToken: 'test.refresh', expiresIn: 3600 } }
async function backend(page: Page) {
  const state = { revoked: false, paths: [] as string[], data: [] as Record<string, unknown>[], companies: [] as { id: string; name: string }[] }
  let profile = { name: 'Sample customer', address: null as string | null, alternatePhone: null as string | null, dateOfBirth: null as string | null, gender: null as string | null }
  const headers = { 'access-control-allow-origin': 'http://127.0.0.1:4187', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization', 'cache-control': 'no-store' }
  await page.route('https://admin.example.test/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.split('/').at(-1) ?? ''
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }
    state.paths.push(path)
    let value: unknown = { version: 'orbis.customer.v1', customer }
    if (path === 'signup' || path === 'login' || path === 'recovery' || path === 'refresh') value = session
    if (path === 'profile') {
      if (request.method() === 'POST') profile = request.postDataJSON()
      value = { version: 'orbis.customer.profile.v1', customer, profile, contact: { email: 'customer@example.test', phone: null } }
    }
    if (path === 'recover') value = { accepted: true }
    if (path === 'password') {
      expect(request.headers().authorization).toBe('Bearer test.access')
      expect(request.postDataJSON()).toEqual({ password: 'changed-password' })
      value = { passwordUpdated: true }
    }
    if (path === 'logout') { state.revoked = true; value = { signedOut: true } }
    await route.fulfill({ status: state.revoked && path === 'session' ? 401 : 200, headers, json: value })
  })
  await page.route('https://data.example.test/**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }
    expect(route.request().headers().authorization).toBe('Bearer test.access')
    const body = route.request().postDataJSON() as Record<string, unknown>
    state.data.push(body)
    expect(body.version).toBe('orbis.khata.data.v1')
    const input = body.input as Record<string, unknown>
    expect(['companies', 'create', 'masters', 'inventory-report', 'report']).toContain(body.operation)
    let data: unknown = state.companies
    if (body.operation === 'create') {
      expect(input.table).toBe('khata_companies')
      const row = input.row as { id: string; name: string }
      expect(row).not.toHaveProperty('owner_id')
      state.companies.push({ id: row.id, name: row.name });data = state.companies.at(-1)
    }
    if (body.operation === 'masters') data = { items: [], parties: [] }
    if (body.operation === 'inventory-report') data = { items: [], warehouses: [], stocks: [], documents: [], count: 0 }
    if (body.operation === 'report') data = { balances: {}, ledger_balances: {}, parties: [], entries: [], count: 0, as_of: '2026-10-12T00:00:00Z' }
    await route.fulfill({ status: 200, headers, json: { data } })
  })
  return state
}
async function openLogin(page: Page) {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'ভাষা নির্বাচন' }).selectOption('en')
  await page.getByRole('button', { name: 'Get started →', exact: true }).click()
  await expect(page.getByRole('form', { name: 'Log in', exact: true })).toBeVisible()
}
async function login(page: Page) {
  await openLogin(page)
  await page.locator('input[name="email"]').fill('customer@example.test')
  await page.locator('input[name="password"]').fill('test-password')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByText(customer.displayId, { exact: true })).toBeVisible()
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}
test('same signup source on mobile/desktop; session reload and gateway ownership', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const state = await backend(page);await openLogin(page)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByLabel('First name', { exact: true }).fill('Test')
  await page.getByLabel('Last name', { exact: true }).fill('Customer')
  await page.locator('input[name="email"]').fill('customer@example.test')
  await page.locator('input[name="password"]').fill('test-password')
  await fits(page)
  await page.getByRole('form', { name: 'Create account', exact: true }).getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByText(customer.displayId, { exact: true })).toBeVisible()
  expect(state.paths).toContain('signup')
  await page.reload()
  await expect(page.getByText(customer.displayId, { exact: true })).toBeVisible()
  expect(state.paths).toContain('session')
  await page.getByRole('button', { name: /Khata Boi.*Open/ }).click()
  await page.getByLabel('Company name', { exact: true }).fill('Test shop')
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Test shop', exact: true })).toBeVisible()
  await fits(page)
  await expect(page.getByRole('button', { name: 'Parties 0', exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
  expect(state.data.some(value => value.operation === 'create')).toBe(true)
  expect(await page.evaluate(() => Object.values(localStorage).join(''))).not.toContain('test-password')
})
test('login and logout clear private workspace and stored central session', async ({ page }) => {
  const state = await backend(page);await login(page);await fits(page)
  await page.getByLabel('More options', { exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByText(customer.displayId, { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('orbis.central.customer.v1'))).toBeNull()
  expect(state.paths).toContain('logout')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Get started →', exact: true })).toBeVisible()
})
test('expired server session cannot reopen the financial workspace', async ({ page }) => {
  const state = await backend(page);await login(page);state.revoked = true
  await page.reload()
  await expect(page.getByText(customer.displayId, { exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('orbis.central.customer.v1'))).toBeNull()
  expect(state.data).toHaveLength(0)
})
test('an expiring stored session refreshes without changing the central identity', async ({ page }) => {
  const state = await backend(page);await login(page)
  await page.evaluate(() => {
    const key = 'orbis.central.customer.v1'
    const value = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
    value.expiresAt = 0;localStorage.setItem(key, JSON.stringify(value))
  })
  await page.reload()
  await expect(page.getByText(customer.displayId, { exact: true })).toBeVisible()
  expect(state.paths).toContain('refresh')
})
test('recovery link is cleaned; verified password reset uses the same central API', async ({ page }) => {
  const state = await backend(page);await openLogin(page)
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click()
  await page.locator('input[name="email"]').fill('customer@example.test')
  await page.getByRole('button', { name: 'Send recovery link', exact: true }).click()
  // Local browser uses HTTP; production redirect validation is covered by Admin tests.
  expect(state.paths).toContain('recover')
  await page.goto('/?orbis_recovery=1#token_hash=' + 'a'.repeat(64) + '&type=recovery')
  await expect(page.getByRole('button', { name: 'Save password', exact: true })).toBeVisible()
  expect(page.url()).not.toContain('token_hash')
  await page.locator('input[name="password"]').fill('changed-password')
  await fits(page)
  await page.getByRole('button', { name: 'Save password', exact: true }).click()
  await expect(page.getByText(customer.displayId, { exact: true })).toBeVisible()
  expect(state.paths).toContain('recovery');expect(state.paths).toContain('password')
})


test('shared profile save and reload preserve the central ID', async ({ page }) => {
  await backend(page); await login(page)
  await page.getByLabel('More options', { exact: true }).click()
  await page.getByRole('button', { name: 'Account & profile', exact: true }).click()
  const profile = page.getByRole('region', { name: 'Common account profile', exact: true })
  await profile.getByLabel('Name', { exact: true }).fill('Updated customer')
  await profile.getByLabel('Address', { exact: true }).fill('Test address')
  await profile.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(profile.getByText('Profile saved to your central account.')).toBeVisible()
  await page.reload()
  await page.getByLabel('More options', { exact: true }).click()
  await page.getByRole('button', { name: 'Account & profile', exact: true }).click()
  await expect(profile.getByLabel('Name', { exact: true })).toHaveValue('Updated customer')
  await expect(profile.getByLabel('Address', { exact: true })).toHaveValue('Test address')
  await expect(page.getByText(customer.displayId, { exact: true })).toBeVisible()
  await fits(page)
})
