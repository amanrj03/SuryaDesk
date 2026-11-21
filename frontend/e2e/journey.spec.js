import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createDatabase } from '../../backend/src/lib/prisma.js'

async function login(page, role) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill(role + '@demo.suryadesk.test')
  await page.getByLabel('Password').fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('public enquiry survives refresh and can be qualified and scheduled from the staff UI', async ({ page }) => {
  const name = 'Browser fixture ' + randomUUID()
  const database = createDatabase(process.env.DATABASE_URL)
  try {
    await page.goto('/enquiry')
    await page.getByLabel('Full name').fill(name)
    await page.getByLabel('Phone').fill('+910000000000')
    await page.getByLabel('Installation address').fill('Test property in Pune')
    await page.getByRole('button', { name: 'Submit enquiry' }).click()
    await expect(page.getByRole('heading', { name: 'Enquiry received' })).toBeVisible()

    await login(page, 'sales')
    await expect(page.getByRole('heading', { name: 'Enquiries' })).toBeVisible()
    const search = async () => {
      await page.getByRole('textbox', { name: 'Search enquiries' }).fill(name)
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      return page.getByRole('row').filter({ hasText: name })
    }
    let row = await search()
    await expect(row).toContainText('New')
    await row.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('CONTACTED')
    await page.getByRole('button', { name: 'Save enquiry' }).click()
    await expect(row).toContainText('Contacted')
    await row.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('QUALIFIED')
    await page.getByRole('spinbutton', { name: /Shadow-free roof area/ }).fill('42')
    await page.getByLabel('Monthly bill (INR)').fill('2300')
    await page.getByRole('combobox', { name: 'Grid suitable', exact: true }).selectOption('yes')
    await page.getByRole('button', { name: 'Save enquiry' }).click()
    await expect(row).toContainText('Qualified')
    await row.getByRole('button', { name: 'Schedule survey' }).click()
    const surveyor = page.getByRole('combobox', { name: 'Surveyor', exact: true })
    await expect(surveyor.locator('option')).not.toHaveCount(1)
    await surveyor.selectOption({ index: 1 })
    await page.getByLabel('Survey appointment').fill('2026-12-03T10:30')
    await page.locator('form').getByRole('button', { name: 'Schedule survey', exact: true }).click()
    await expect(row).toContainText('Survey scheduled')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible()
    await login(page, 'sales')
    row = await search()
    await expect(row).toContainText('Survey scheduled')
  } finally {
    const customer = await database.customer.findFirst({ where: { name } })
    if (customer) {
      const lead = await database.lead.findFirst({ where: { customerId: customer.id } })
      if (lead) await database.$transaction([
        database.siteSurvey.deleteMany({ where: { leadId: lead.id } }),
        database.leadActivity.deleteMany({ where: { leadId: lead.id } }),
        database.lead.delete({ where: { id: lead.id } }),
        database.customer.delete({ where: { id: customer.id } }),
      ])
    }
    await database.$disconnect()
  }
})

test('director can switch periods and see seeded profitability', async ({ page }) => {
  await login(page, 'director')
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await page.getByLabel('Reporting period').selectOption('sixMonths')
  await expect(page.getByRole('heading', { name: 'Daily cash collections' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent job profitability' })).toBeVisible()
  await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible()
})
