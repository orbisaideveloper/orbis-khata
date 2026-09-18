import { expect, test } from '@playwright/test'

test('mobile starter renders and counter works', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible()
  await page.getByRole('button', { name: 'Count is 0' }).click()
  await expect(page.getByRole('button', { name: 'Count is 1' })).toBeVisible()
})
