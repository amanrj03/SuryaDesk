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
    ['Customer sign in', '/customer/login'],
    ['Customer portal', '/customer/login'],
    ['Track order', '/track'],
    ['Warranty status', '/warranty'],
  ]) {
    await page.getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(path)
    await page.getByRole('link', { name: 'Back to home' }).click()
    await expect(home).toBeVisible()
  }

  const footer = page.getByRole('contentinfo')
  await expect(footer.getByRole('link', { name: 'Get a solar quote' })).toHaveAttribute('href', '/enquiry')
  await expect(footer.getByRole('link', { name: 'Check warranty coverage' })).toHaveAttribute('href', '/warranty')

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

test('warranty lookup shows serials with a private tracking link only', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Work email').fill('admin@demo.suryadesk.test')
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Orders', exact: true }).click()
  const search = page.getByRole('textbox', { name: 'Search orders' })
  await search.fill('ORD-0001')
  await search.press('Enter')
  await page.getByRole('row').filter({ hasText: 'ORD-0001' }).getByRole('link', { name: 'View', exact: true }).click()
  await page.getByRole('button', { name: 'Share tracking link' }).click()
  const link = await page.getByRole('textbox', { name: 'Tracking link' }).inputValue()

  await page.goto('/warranty')
  await page.getByLabel('Order ID').fill('ORD-0001')
  await page.getByRole('button', { name: 'Check warranties' }).click()
  const warranties = page.getByRole('region', { name: 'ORD-0001' })
  await expect(warranties).toBeVisible()
  await expect(warranties.getByText(/^Serial /)).toHaveCount(0)

  await page.getByLabel('Tracking ID or private tracking link (optional)').fill(link)
  await page.getByRole('button', { name: 'Check warranties' }).click()
  await expect(warranties.getByText(/^Serial /).first()).toBeVisible()
  await expect(warranties.getByText(/no individual serial numbers/i).first()).toBeVisible()

  await page.goto(link)
  await page.getByRole('region', { name: 'Equipment warranties' }).getByRole('link', { name: 'Warranty status' }).click()
  await expect(warranties.getByText(/^Serial /).first()).toBeVisible()
})
