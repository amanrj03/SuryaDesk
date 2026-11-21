import { expect, test } from '@playwright/test'

test('admin lands on the centralized live overview and can change its period', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Work email').fill('admin@demo.suryadesk.test')
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/overview$/)
  await expect(page.getByRole('heading', { name: 'Financial summary' })).toBeVisible()
  const select = page.getByLabel('Reporting period')
  for (const period of ['today', 'week', 'month']) {
    const response = page.waitForResponse(res => res.url().includes('/reports/admin-overview?period=' + period))
    await select.selectOption(period)
    const result = await response
    expect(result.ok()).toBe(true)
    const { data } = await result.json()
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Enquiries', exact: true }) })
    await expect(card.locator('p')).toHaveText(new Intl.NumberFormat('en-IN').format(data.enquiries))
  }
  await expect(page.getByRole('heading', { name: 'Recent business activity' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Project status distribution' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inventory summary' })).toBeVisible()
  await page.setViewportSize({ width: 360, height: 780 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
})
