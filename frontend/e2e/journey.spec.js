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
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV' }).click()
  expect((await download).suggestedFilename()).toBe('profitability.csv')
  await page.getByRole('link', { name: 'Packages' }).click()
  const packageRow = page.getByRole('row').filter({ hasText: 'DEMO-ON-GRID-3' })
  await packageRow.getByRole('button', { name: 'View' }).click()
  await expect(page.getByRole('heading', { name: 'Bill of materials' })).toBeVisible()
})

test('assigned technician completes a delivered job with a photo and drawn signature', async ({ page }) => {
  const name = 'Field fixture ' + randomUUID()
  const database = createDatabase(process.env.DATABASE_URL)
  const { unlink } = await import('node:fs/promises')
  const { fileURLToPath } = await import('node:url')
  const { resolve } = await import('node:path')
  let fixture
  try {
    const technician = await database.user.findUniqueOrThrow({ where: { email: 'technician@demo.suryadesk.test' } })
    const pack = await database.solarPackage.findUniqueOrThrow({ where: { code: 'DEMO-INSTALLATION-3' } })
    fixture = await database.$transaction(async tx => {
      const lead = await tx.lead.create({ data: {
        leadNumber: name, status: 'WON', source: 'WEB', subsidyInterest: false,
        customer: { create: { name, phone: '+910000000000', address: 'Test installation in Pune' } },
      } })
      const survey = await tx.siteSurvey.create({
        data: { leadId: lead.id, scheduledAt: new Date(), status: 'APPROVED' },
      })
      const amounts = { subtotal: pack.basePrice, tax: 0, total: pack.basePrice }
      const quote = await tx.quotation.create({ data: {
        ...amounts, quoteNumber: name, leadId: lead.id, surveyId: survey.id,
        packageId: pack.id, createdById: technician.id, status: 'ACCEPTED',
      } })
      const order = await tx.order.create({ data: {
        ...amounts, orderNumber: name, customerId: lead.customerId, quotationId: quote.id,
        status: 'DELIVERED', confirmedAt: new Date(Date.now() - 86400_000),
      } })
      const job = await tx.installation.create({ data: {
        orderId: order.id, status: 'SCHEDULED', scheduledAt: new Date(), capacityKw: 3, checklist: {},
        installationAssignmentsByInstallation: { create: { technicianId: technician.id, assignedAt: new Date() } },
      } })
      return { job, order, quote, survey, lead }
    })
    await page.setViewportSize({ width: 430, height: 860 })
    await login(page, 'technician')
    await page.getByRole('link', { name: 'Installations' }).click()
    const row = page.getByRole('row').filter({ hasText: name })
    await row.getByRole('button', { name: 'Sign off' }).click()
    const local = date => {
      const timestamp = new Date(date)
      return new Date(timestamp.getTime() - timestamp.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    }
    const now = Date.now()
    await page.getByLabel('Started at').fill(local(now - 180 * 60_000))
    await page.getByLabel('Finished at').fill(local(now - 20 * 60_000))
    await page.getByLabel('Generation reading (kW)').fill('2.8')
    for (const label of ['Mounting and panels secured', 'Electrical connections checked',
      'Earthing and protection verified', 'Generation test completed']) {
      await page.getByRole('checkbox', { name: label }).check()
    }
    await page.getByLabel('Roof photo').setInputFiles({
      name: 'test-roof.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Yv1cAAAAASUVORK5CYII=', 'base64'),
    })
    const canvas = page.locator('canvas')
    await canvas.scrollIntoViewIfNeeded()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 25, box.y + 25)
    await page.mouse.down()
    await page.mouse.move(box.x + 85, box.y + 45, { steps: 5 })
    await page.mouse.move(box.x + 130, box.y + 25, { steps: 5 })
    await page.mouse.up()
    await page.getByRole('button', { name: 'Complete installation' }).click()
    await expect(row).toContainText('Completed')
    const job = await database.installation.findUniqueOrThrow({ where: { id: fixture.job.id } })
    expect(job.customerSignerName).toBe(name)
    expect(await database.workLog.count({ where: { installationId: job.id } })).toBe(1)
    expect(await database.attachment.count({ where: { ownerType: 'INSTALLATION', ownerId: job.id } })).toBe(2)
  } finally {
    if (fixture) {
      const { job, order, quote, survey, lead } = fixture
      const media = await database.attachment.findMany({ where: { ownerType: 'INSTALLATION', ownerId: job.id } })
      await database.$transaction([
        database.workLog.deleteMany({ where: { installationId: job.id } }),
        database.auditLog.deleteMany({ where: { entityType: 'Installation', entityId: job.id } }),
        database.installationAssignment.deleteMany({ where: { installationId: job.id } }),
        database.installation.delete({ where: { id: job.id } }),
        database.attachment.deleteMany({ where: { ownerType: 'INSTALLATION', ownerId: job.id } }),
        database.order.delete({ where: { id: order.id } }),
        database.quotation.delete({ where: { id: quote.id } }),
        database.siteSurvey.delete({ where: { id: survey.id } }),
        database.lead.delete({ where: { id: lead.id } }),
        database.customer.delete({ where: { id: lead.customerId } }),
      ])
      const root = resolve(fileURLToPath(new URL('../../backend', import.meta.url)), process.env.UPLOAD_DIR ?? 'uploads')
      for (const { storageKey } of media) await unlink(resolve(root, storageKey)).catch(error => {
        if (error.code !== 'ENOENT') throw error
      })
    }
    await database.$disconnect()
  }
})
