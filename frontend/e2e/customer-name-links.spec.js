import { expect, test } from '@playwright/test'

async function login(page, role) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(role + '@demo.suryadesk.test')
  await page.getByLabel('Password').fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

const customerLinks = page => page.getByRole('table').locator('a[href^="/customers/"]')

test('customer names link to details across staff lists and return to the source list', async ({ page }) => {
  await login(page, 'admin')
  for (const section of ['Enquiries', 'Customers', 'Surveys', 'Quotations', 'Orders', 'Dispatch',
    'Installations', 'Warranties', 'Service tickets', 'Invoices', 'Subsidies', 'Equipment serials']) {
    await page.getByRole('link', { name: section, exact: true }).click()
    if (section === 'Equipment serials') await page.getByLabel('Filter by status').selectOption('INSTALLED')
    await expect(customerLinks(page).first(), section).toBeVisible()
  }
  const source = page.url()
  const installed = page.getByRole('row').filter({ has: page.getByText('Installed', { exact: true }) })
  const link = installed.locator('a[href^="/customers/"]').first()
  const name = await link.innerText()
  const href = await link.getAttribute('href')
  await installed.locator(`a[href="${href}"]`).first().click()
  await expect(page).toHaveURL(href)
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('Customer portal access', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(source)

  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await page.getByLabel('Reporting period').selectOption('sixMonths')
  await expect(customerLinks(page).first()).toBeVisible()
})

test('staff without customer-details access see customer names as plain text', async ({ page }) => {
  await login(page, 'warehouse')
  await page.getByRole('link', { name: 'Dispatch', exact: true }).click()
  await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible()
  await expect(customerLinks(page)).toHaveCount(0)
})
