import { expect, test } from '@playwright/test'

test('allocation opens Confirm delivery and the action remains available after dismissal', async ({ page }) => {
  let dispatch = {
    id: 'dispatch-fixture', dispatchNumber: 'DSP-VERIFY', status: 'DRAFT',
    order: { customer: { name: 'Delivery customer' } },
  }
  await page.route('**/api/v1/dispatches?*', route => route.fulfill({
    json: { success: true, data: [dispatch], meta: { total: 1, totalPages: 1 } },
  }))
  await page.route('**/api/v1/dispatches/dispatch-fixture/allocation-options', route => route.fulfill({
    json: { success: true, data: [] },
  }))
  await page.route('**/api/v1/dispatches/dispatch-fixture/allocate', async route => {
    dispatch = { ...dispatch, status: 'ALLOCATED' }
    await route.fulfill({ json: { success: true, data: dispatch } })
  })
  await page.route('**/api/v1/dispatches/dispatch-fixture/deliver', async route => {
    expect(route.request().postDataJSON()).toEqual({ recipientName: 'Receiving contact' })
    dispatch = { ...dispatch, status: 'DELIVERED', deliveredAt: new Date().toISOString() }
    await route.fulfill({ json: { success: true, data: dispatch } })
  })

  await page.goto('/login')
  await page.getByLabel('Work email').fill('warehouse@demo.suryadesk.test')
  await page.getByLabel('Password').fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Dispatch', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: 'DSP-VERIFY' })
  await row.getByRole('button', { name: 'Allocate stock' }).click()
  await page.getByRole('dialog', { name: 'Allocate stock' }).getByRole('button', { name: 'Allocate stock' }).click()

  const confirm = page.getByRole('dialog', { name: 'Confirm delivery' })
  await expect(confirm.getByLabel('Recipient name')).toHaveValue('Delivery customer')
  await confirm.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(row).toContainText('Allocated')
  await expect(row.getByRole('button', { name: 'Record dispatch' })).toHaveCount(0)

  await row.getByRole('button', { name: 'Confirm delivery' }).click()
  await confirm.getByLabel('Recipient name').fill('Receiving contact')
  await confirm.getByRole('button', { name: 'Confirm delivery' }).click()
  await expect(row).toContainText('Delivered')
  await expect(row.getByRole('button', { name: 'Confirm delivery' })).toHaveCount(0)
})
