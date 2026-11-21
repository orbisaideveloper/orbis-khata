import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const sample = JSON.parse(readFileSync('src/lottery-results/sample-2026-11-20.json', 'utf8'))
const documents = { schema: 1, documents: [{ date: '2026-11-20', slot: '8pm', officialUrl: 'https://nagalandlotteries.com/old_results/EN201126.PDF', sambadUrl: 'https://sambad.com/api-files/fixture.pdf' }] }

test('compact PDF links and ticket checks stay isolated from accounts', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-21T04:00:00Z'))
  await page.addInitScript(initialDocuments => {
    localStorage.setItem('orbis.public-lottery-documents.v1', JSON.stringify(initialDocuments))
    const customer = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
    localStorage.setItem('orbis.central.customer.v1', JSON.stringify({ version: 1, customer, accessToken: 'test.access', refreshToken: 'test.refresh', expiresAt: Date.now() + 3600000 }))
    localStorage.setItem('orbis-khata-ui-language-v1', 'en')
  }, documents)
  await page.route('https://admin.example.test/**', route => route.fulfill({ json: { version: 'orbis.customer.v1', customer: { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' } } }))
  await page.route('https://data.example.test/**', route => route.fulfill({ json: { data: [] } }))
  await page.route('https://data.example.test/orbis-lottery-ticket', async route => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }
    const input = route.request().postDataJSON()
    await route.fulfill({ headers, json: { ...input, status: 'win', prize: { tier: '5th', amount: 120 } } })
  })
  await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ json: route.request().url().endsWith('/documents.json') ? documents : { schema: 1, results: [sample] } }))
  await page.goto('/')
  await page.getByRole('button', { name: /^Lottery results\s*Check/ }).click()
  await expect(page.getByRole('combobox')).toHaveValue('8pm')
  await expect(page.locator('.result-number-grid')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Original official gazette for this draw' })).toHaveAttribute('href', 'https://nagalandlotteries.com/old_results/EN201126.PDF')
  await expect(page.getByRole('button', { name: 'Scan QR' })).toBeVisible()
  await expect(page.locator('.ticket-camera')).toBeHidden()
  await page.getByRole('textbox', { name: 'Ticket series' }).fill('35B')
  await page.getByRole('textbox', { name: 'Ticket number' }).fill('00220')
  await page.getByRole('button', { name: 'Check number', exact: true }).click()
  await expect(page.getByText('Prize match found')).toBeVisible()
  expect(await page.locator('.results-page').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByRole('combobox').selectOption('6pm')
  await expect(page.getByRole('link')).toHaveCount(0)
  await page.getByRole('combobox').selectOption('8pm')
  await page.context().setOffline(true)
  await page.getByRole('button', { name: 'Back to main home' }).click()
  await page.getByRole('button', { name: /^Lottery results\s*Check/ }).click()
  await expect(page.getByRole('link', { name: 'Original official gazette for this draw' })).toBeVisible()
  await expect(page.getByRole('button', { name: /save receipt|save row/i })).toHaveCount(0)
})
