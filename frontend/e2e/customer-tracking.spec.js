import { expect, test } from '@playwright/test'

test('the customer dashboard tracks several projects through installation', async ({ page }) => {
  const at = '2026-02-01T08:00:00.000Z'
  let signedAt = null
  await page.route('**/api/v1/customer-portal/records', route => route.fulfill({
    json: { success: true, data: {
      requests: [], orders: [], invoices: [], assets: [], tickets: [],
      projects: [
        { id: 'new', reference: 'LEAD-NEW', status: 'NEW',
          timeline: [{ stage: 'ENQUIRY_RECEIVED', at }, { stage: 'DELIVERED', at: null }] },
        { id: 'delivered', reference: 'LEAD-DELIVERED', orderNumber: 'ORD-DELIVERED',
          status: signedAt ? 'COMPLETED' : 'DELIVERED',
          timeline: [{ stage: 'ENQUIRY_RECEIVED', at }, { stage: 'DELIVERED', at },
            { stage: 'INSTALLATION_COMPLETED', at: signedAt }] },
      ],
    } },
  }))
  await page.goto('/customer/login')
  await page.getByLabel('Email address').fill('customer0001@demo.suryadesk.test')
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Track project' }).click()

  const timeline = page.getByRole('region', { name: 'Project timeline' })
  await expect(page.getByRole('heading', { name: 'LEAD-NEW' })).toBeVisible()
  await expect(timeline.locator('[aria-current="step"]')).toContainText('Enquiry received')
  await page.getByLabel('Select project').selectOption('delivered')
  await expect(page.getByRole('heading', { name: 'ORD-DELIVERED' })).toBeVisible()
  await expect(timeline.locator('[aria-current="step"]')).toContainText('Delivered')
  signedAt = at
  await page.getByRole('button', { name: 'Refresh tracking' }).click()
  await expect(timeline.locator('[aria-current="step"]')).toContainText('Installation completed')
})
