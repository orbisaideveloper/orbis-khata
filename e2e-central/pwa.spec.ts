import { expect, test } from '@playwright/test'

test('installed shell reopens offline without caching identity or financial data', async ({ page, context }) => {
  await page.goto('http://127.0.0.1:4188/')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json())
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('/')
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys()
    return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat()
  })
  expect(cached).toContain('/')
  expect(cached.every(path => path === '/' || path === '/index.html' || path.startsWith('/assets/') || ['/manifest.webmanifest', '/icon.svg'].includes(path))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#root')).not.toBeEmpty()
  await expect(page.getByRole('status').filter({hasText:'ইন্টারনেট নেই'})).toContainText('ইন্টারনেট নেই')
  await context.setOffline(false)
  await expect(page.getByRole('status').filter({hasText:'ইন্টারনেট নেই'})).toHaveCount(0)
})
