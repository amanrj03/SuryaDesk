import { expect, test } from '@playwright/test'

test('customers can refresh to review a published quotation before accepting', async ({ page }) => {
  let published = false
  await page.route('**/api/v1/customer-portal/records', async route => {
    const requests = [{
      id: 'review-lead', leadNumber: 'LEAD-REVIEW', status: published ? 'QUOTED' : 'SURVEY_APPROVED',
      createdAt: new Date().toISOString(), siteSurveysByLead: [],
      quotationsByLead: published ? [{
        id: 'review-quote', quoteNumber: 'QUO-REVIEW', status: 'SENT',
        package: { name: '3 kW solar package' }, subtotal: '10000', tax: '500', total: '10500',
        pricing: { lines: [{ description: 'Solar panels', quantity: 4, amount: '10000' }] },
      }] : [],
    }]
    await route.fulfill({ json: { success: true, data: { requests, orders: [], invoices: [], assets: [], tickets: [] } } })
  })
  await page.goto('/customer/login')
  await page.getByLabel('Email address').fill('customer0001@demo.suryadesk.test')
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('navigation', { name: 'Customer portal' }).getByRole('link', { name: 'Quotations', exact: true }).click()
  await expect(page.getByText('Your quotation is being prepared.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Accept quotation' })).toHaveCount(0)
  published = true
  await page.getByRole('button', { name: 'Refresh quotations' }).click()
  await expect(page.getByRole('heading', { name: 'QUO-REVIEW', exact: true })).toBeVisible()
  await expect(page.getByText('Solar panels x 4')).toBeVisible()
  await expect(page.getByText('Total ₹10,500.00')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download quotation' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Accept quotation' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Decline quotation' })).toBeVisible()
})
