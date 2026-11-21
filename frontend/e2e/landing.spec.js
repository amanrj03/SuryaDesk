import { expect, test } from '@playwright/test'

test('public dashboard supports direct lookups and each public page leads back home', async ({ page }, info) => {
  await page.goto('/')
  const home = page.getByRole('heading', { name: 'Solar for the place you call yours.' })
  await expect(home).toBeVisible()
  await expect(page.locator('img[src="/images/solar-rooftop.webp"]')).toHaveJSProperty('complete', true)
  expect(await page.locator('img[src="/images/solar-rooftop.webp"]').evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
  await page.screenshot({ path: info.outputPath('landing-desktop.png'), fullPage: true })

  for (const [label, path] of [
    ['Request a quote', '/enquiry'],
    ['Staff sign in', '/login'],
    ['Customer portal', '/customer/login'],
    ['Track order', '/track'],
    ['Warranty status', '/warranty'],
  ]) {
    await page.getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(path)
    await page.getByRole('link', { name: 'Back to home' }).click()
    await expect(home).toBeVisible()
  }

  await page.getByRole('button', { name: 'Check progress' }).click()
  await page.getByLabel('Tracking ID or link').fill('not a tracking ID')
  await page.getByRole('button', { name: 'Check progress' }).click()
  await expect(page.getByRole('alert')).toContainText('Enter your tracking ID')
  await page.getByLabel('Tracking ID or link').fill('LEAD-12345678-1234-4234-8234-123456789012')
  await page.getByRole('button', { name: 'Check progress' }).click()
  await expect(page).toHaveURL(/\/track#token=LEAD-/)
  await page.getByRole('link', { name: 'Back to home' }).click()

  await page.setViewportSize({ width: 360, height: 780 })
  await page.getByRole('link', { name: 'Look up a project' }).click()
  await page.getByRole('button', { name: 'Warranty', exact: true }).click()
  await page.getByLabel('Order ID').fill('ord-0001')
  await page.getByRole('button', { name: 'Check coverage' }).click()
  await expect(page.getByRole('region', { name: 'ORD-0001' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to home' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.screenshot({ path: info.outputPath('landing-mobile.png'), fullPage: true })
})
