import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const sample = JSON.parse(readFileSync('src/lottery-results/sample-2026-11-20.json', 'utf8'))
const documents = { schema: 1, documents: [{ date: '2026-11-20', slot: '8pm', officialUrl: 'https://nagalandlotteries.com/old_results/EN201126.PDF', sambadUrl: 'https://sambad.com/api-files/fixture.pdf' }] }

test('compact PDF links and ticket checks stay isolated from accounts', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 300
      const stream = canvas.captureStream(5)
      canvas.getContext('2d')?.fillRect(0, 0, 300, 300)
      return stream
    } })
  })
  await page.clock.setFixedTime(new Date('2026-11-21T04:00:00Z'))
  await page.addInitScript(initialDocuments => {
    localStorage.setItem('orbis.public-lottery-documents.v1', JSON.stringify(initialDocuments))
    const customer = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' }
    localStorage.setItem('orbis.central.customer.v1', JSON.stringify({ version: 1, customer, accessToken: 'test.access', refreshToken: 'test.refresh', expiresAt: Date.now() + 3600000 }))
    localStorage.setItem('orbis-khata-ui-language-v1', 'en')
  }, documents)
  await page.route('https://admin.example.test/**', route => route.fulfill({ json: { version: 'orbis.customer.v1', customer: { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' } } }))
  await page.route('https://data.example.test/**', route => route.fulfill({ json: { data: [] } }))
  await page.route('https://data.example.test/orbis-lottery-live', route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { date: '2026-11-21', slot: '1pm', video: null } }))
  await page.route('https://data.example.test/orbis-lottery-ticket/document', async route => {
    const input = route.request().method() === 'POST' ? route.request().postDataJSON() : {}
    await route.fulfill({ status: route.request().method() === 'OPTIONS' ? 204 : 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }, ...(route.request().method() === 'POST' ? { json: { date: input.date, slot: input.slot, sambadUrl: null } } : {}) })
  })
  await page.route('https://data.example.test/orbis-lottery-ticket', async route => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' }
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return }
    const input = route.request().postDataJSON()
    if (input.action === 'document') { await route.fulfill({ headers, json: { date: input.date, slot: input.slot, sambadUrl: null } }); return }
    await route.fulfill({ headers, json: { ...input, status: 'win', prize: { tier: '5th', amount: 120 } } })
  })
  await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ json: route.request().url().endsWith('/documents.json') ? documents : { schema: 1, results: [sample] } }))
  await page.goto('/')
  await page.getByRole('button', { name: /^Lottery results\s*Check/ }).click()
  await expect(page.getByLabel('Draw date')).toHaveValue('2026-11-21')
  await expect(page.getByLabel('Draw time (IST)')).toHaveValue('1pm')
  await page.getByLabel('Draw date').fill('2026-11-20')
  await page.getByLabel('Draw time (IST)').selectOption('8pm')
  await expect(page.locator('.result-number-grid')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Original official gazette for this draw' })).toHaveAttribute('href', 'https://nagalandlotteries.com/old_results/EN201126.PDF')
  await expect(page.getByRole('button', { name: 'Scan QR' })).toBeVisible()
  await expect(page.locator('.ticket-camera')).toBeHidden()
  await page.getByRole('textbox', { name: 'Ticket series' }).fill('35B')
  await page.getByRole('textbox', { name: 'Ticket number' }).fill('00220')
  await page.getByRole('button', { name: 'Check number', exact: true }).click()
  await expect(page.getByText('Prize match found')).toBeVisible()
  expect(await page.locator('.results-page').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByLabel('Draw time (IST)').selectOption('6pm')
  await expect(page.getByRole('link')).toHaveCount(0)
  await page.getByLabel('Draw time (IST)').selectOption('8pm')
  await page.context().setOffline(true)
  await page.getByRole('button', { name: 'Back to main home' }).click()
  await page.getByRole('button', { name: /^Lottery results\s*Check/ }).click()
  await expect(page.getByLabel('Draw date')).toHaveValue('2026-11-21')
  await page.getByLabel('Draw date').fill('2026-11-20')
  await page.getByLabel('Draw time (IST)').selectOption('8pm')
  await expect(page.getByRole('link', { name: 'Original official gazette for this draw' })).toBeVisible()
  await expect(page.getByRole('button', { name: /save receipt|save row/i })).toHaveCount(0)
  await page.context().setOffline(false)
  for (const viewport of [{ width: 320, height: 740 }, { width: 600, height: 960 }, { width: 800, height: 1280 }, { width: 1366, height: 900 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.locator('.results-header, .results-controls, .ticket-fields, .results-document-links, .results-source > span:first-of-type').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth))).toBe(true)
    const [modules, language] = await Promise.all([page.locator('.results-header .module-picker summary').boundingBox(), page.locator('.results-language').boundingBox()])
    expect(Math.abs(modules!.width - language!.width)).toBeLessThan(1)
    expect(Math.abs(modules!.height - language!.height)).toBeLessThan(1)
    const warning = page.locator('.results-disclaimer')
    await expect(warning).toBeVisible()
    const [ticketBox, docBox] = await Promise.all([page.locator('.ticket-search').boundingBox(), page.locator('.result-sheet').boundingBox()])
    expect(ticketBox!.y).toBeLessThan(docBox!.y)
  }
  await page.locator('.module-picker summary').click()
  await expect(page.getByRole('button', { name: /Daily accounts/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Lottery results', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.locator('.module-picker summary').click()
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('button', { name: 'Scan QR' }).click()
  const scanner = page.getByRole('dialog', { name: 'Scan your ticket' })
  await expect(scanner).toBeVisible()
  const box = await scanner.boundingBox()
  const size = page.viewportSize()!
  expect(Math.abs(box!.x + box!.width / 2 - size.width / 2)).toBeLessThan(3)
  expect(Math.abs(box!.y + box!.height / 2 - size.height / 2)).toBeLessThan(3)
  await page.getByRole('button', { name: 'Stop camera' }).click()
  await expect(scanner).toHaveCount(0)
  await page.locator('.results-language select').selectOption('hi')
  await expect(page.locator('.results-disclaimer')).toContainText('मूल सरकारी गज़ट')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
