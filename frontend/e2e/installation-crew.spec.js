import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Kolkata' })

test('scheduled jobs offer Change crew and preserve the existing appointment', async ({ page }) => {
  const technicians = [{ id: 'first-tech', name: 'First technician' }, { id: 'second-tech', name: 'Second technician' }]
  let installation = {
    id: 'crew-fixture', order: { orderNumber: 'ORD-CREW', status: 'DELIVERED', customer: { name: 'Crew customer' } },
    status: 'UNSCHEDULED', capacityKw: '2', installationAssignmentsByInstallation: [],
  }
  await page.route('**/api/v1/installations?*', route => route.fulfill({
    json: { success: true, data: [installation], meta: { total: 1, totalPages: 1 } },
  }))
  await page.route('**/api/v1/users/options?kind=technician', route => route.fulfill({
    json: { success: true, data: technicians },
  }))
  await page.route('**/api/v1/installations/crew-fixture', async route => {
    const body = route.request().postDataJSON()
    expect(body).toEqual(installation.status === 'UNSCHEDULED'
      ? { technicianIds: ['first-tech'], scheduledAt: '2027-01-15T04:00:00.000Z' }
      : { technicianIds: ['second-tech'] })
    installation = {
      ...installation, status: 'SCHEDULED', scheduledAt: body.scheduledAt ?? installation.scheduledAt,
      installationAssignmentsByInstallation: body.technicianIds.map(technicianId => ({ technicianId })),
    }
    await route.fulfill({ json: { success: true, data: installation } })
  })

  await page.goto('/login')
  await page.getByLabel('Work email').fill('admin@demo.suryadesk.test')
  await page.getByLabel('Password').fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Installations', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: 'ORD-CREW' })
  await row.getByRole('button', { name: 'Schedule crew' }).click()
  const schedule = page.getByRole('dialog', { name: 'Schedule crew' })
  await schedule.getByLabel('Technicians').selectOption('first-tech')
  await schedule.getByLabel('Installation appointment').fill('2027-01-15T09:30')
  await schedule.getByRole('button', { name: 'Schedule crew' }).click()

  await row.getByRole('button', { name: 'Change crew' }).click()
  const change = page.getByRole('dialog', { name: 'Change crew' })
  await expect(change.getByLabel('Technicians')).toHaveValues(['first-tech'])
  await expect(change.getByLabel('Installation appointment')).toHaveValue('2027-01-15T09:30')
  await change.getByLabel('Technicians').selectOption('second-tech')
  await change.getByRole('button', { name: 'Change crew' }).click()
  await expect(change).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Schedule crew' })).toHaveCount(0)
})
