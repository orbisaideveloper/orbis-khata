import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const sample = JSON.parse(readFileSync('src/lottery-results/sample-2026-11-20.json', 'utf8'))

test('results are isolated from accounts, readable without overflow and retained offline', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T14:00:00Z'))
  await page.addInitScript(() => {
    const customer = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
    localStorage.setItem('orbis.central.customer.v1', JSON.stringify({ version: 1, customer, accessToken: 'test.access', refreshToken: 'test.refresh', expiresAt: Date.now() + 3600000 }))
    localStorage.setItem('orbis-khata-ui-language-v1', 'en')
  })
  await page.route('https://admin.example.test/**', route => route.fulfill({ json: { version: 'orbis.customer.v1', customer: { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' } } }))
  await page.route('https://data.example.test/**', route => route.fulfill({ json: { data: [] } }))
  await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ json: { schema: 1, results: [sample] } }))
  await page.goto('/')
  await page.getByRole('button', { name: /^Lottery results\s*Check/ }).click()
  await expect(page.getByText('35B 45879')).toBeVisible()
  await expect(page.getByText('0022', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Original official gazette for this draw' })).toHaveAttribute('href', sample.officialUrl)
  expect(await page.locator('.results-page').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByRole('combobox').selectOption('6pm')
  await expect(page.getByText('35B 45879')).toHaveCount(0)
  await page.getByRole('combobox').selectOption('1pm')
  await page.context().setOffline(true)
  await page.getByRole('button', { name: 'Back to main home' }).click()
  await page.getByRole('button', { name: /^Lottery results\s*Check/ }).click()
  await expect(page.getByText('35B 45879')).toBeVisible()
  await expect(page.getByRole('button', { name: /save receipt|save row/i })).toHaveCount(0)
})
