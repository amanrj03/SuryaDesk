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
  const email = randomUUID() + '@example.invalid'
  const password = randomUUID()
  const database = createDatabase(process.env.DATABASE_URL)
  try {
    await page.goto('/enquiry')
    await page.getByLabel('Full name').fill(name)
    await page.getByLabel('Phone').fill('+910000000000')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('New password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password').fill(password)
    await page.getByLabel('Installation address').fill('Test property in Pune')
    await page.getByRole('checkbox', { name: /interested in government solar subsidy/ }).check()
    await page.getByRole('button', { name: 'Send verification code' }).click()
    await expect(page.getByRole('heading', { name: 'Verify your email address' })).toBeVisible()
    const response = await page.request.get('http://127.0.0.1:55300/__e2e/customer-code?email=' + encodeURIComponent(email))
    expect(response.status()).toBe(200)
    await page.getByLabel('Six-digit email code').fill((await response.json()).code)
    await page.getByRole('button', { name: 'Verify and submit request' }).click()
    await expect(page.getByRole('heading', { name: 'Enquiry received' })).toBeVisible()
    const trackingId = await page.getByText(/^LEAD-[\dA-F-]+$/).textContent()
    await page.getByRole('link', { name: 'Open customer portal' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome, Browser' })).toBeVisible()
    await page.reload()
    await page.getByRole('link', { name: 'Quotations', exact: true }).click()
    await expect(page.getByRole('heading', { name: trackingId })).toBeVisible()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Welcome, Browser' })).toBeVisible()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await page.getByRole('button', { name: 'Email code', exact: true }).click()
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('button', { name: 'Send email code' }).click()
    await expect(page.getByLabel('Six-digit email code')).toBeVisible()
    const loginCode = await page.request.get('http://127.0.0.1:55300/__e2e/customer-code?email=' + encodeURIComponent(email))
    await page.getByLabel('Six-digit email code').fill((await loginCode.json()).code)
    await page.getByRole('button', { name: 'Verify and sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome, Browser' })).toBeVisible()
    await page.goto('/track#' + new URLSearchParams({ token: trackingId }))
    await expect(page.getByRole('heading', { name: trackingId })).toBeVisible()
    await page.goto('/track')
    await page.getByRole('textbox', { name: 'Tracking ID or link' }).fill(trackingId)
    await page.getByRole('button', { name: 'Check status' }).click()
    await expect(page.getByRole('heading', { name: trackingId })).toBeVisible()

    await login(page, 'sales')
    await expect(page.getByRole('heading', { name: 'Enquiries' })).toBeVisible()
    const search = async () => {
      await page.getByRole('textbox', { name: 'Search enquiries' }).fill(name)
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      return page.getByRole('row').filter({ hasText: name })
    }
    let row = await search()
    await expect(row).toContainText('New')
    await expect(row.getByRole('cell', { name: 'Interested', exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Qualify enquiry' })).toBeVisible()
    await row.getByRole('button', { name: 'Mark contacted' }).click()
    const contact = page.getByRole('dialog', { name: /^Mark contacted/ })
    await expect(contact.getByLabel(/Shadow-free roof area/)).toHaveCount(0)
    await contact.getByLabel('Follow-up note (optional)').fill('Customer shared the details on the follow-up call.')
    await contact.getByRole('button', { name: 'Mark contacted', exact: true }).click()
    await expect(row).toContainText('Contacted')
    await row.getByRole('button', { name: 'Qualify enquiry' }).click()
    const qualification = page.getByRole('dialog', { name: /^Qualify enquiry/ })
    await expect(qualification.getByLabel(/Shadow-free roof area/)).toHaveAttribute('required', '')
    await page.getByRole('spinbutton', { name: /Shadow-free roof area/ }).fill('42')
    await page.getByLabel('Monthly bill (INR)').fill('2300')
    await page.getByRole('combobox', { name: 'Grid suitable', exact: true }).selectOption('yes')
    await qualification.getByRole('button', { name: 'Qualify enquiry', exact: true }).click()
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
    await row.getByRole('link', { name: 'View', exact: true }).click()
    await expect(page.getByText('Subsidy interest', { exact: true }).locator('..')).toContainText('Interested')
    await expect(page.getByRole('table', { name: 'Activity' }))
      .toContainText('Customer shared the details on the follow-up call.')
  } finally {
    const customer = await database.customer.findFirst({ where: { name } })
    if (customer) {
      const lead = await database.lead.findFirst({ where: { customerId: customer.id } })
      if (lead) await database.$transaction([
        database.siteSurvey.deleteMany({ where: { leadId: lead.id } }),
        database.leadActivity.deleteMany({ where: { leadId: lead.id } }),
        database.lead.delete({ where: { id: lead.id } }),
        database.customerAccount.deleteMany({ where: { customerId: customer.id } }),
        database.customer.delete({ where: { id: customer.id } }),
      ])
    }
    await database.customerChallenge.deleteMany({ where: { email } })
    await database.$disconnect()
  }
})

test('accepting a quote opens its order and the payment action follows the balance', async ({ page }) => {
  const db = createDatabase(process.env.DATABASE_URL)
  const reference = 'E2E-' + randomUUID()
  let fixture
  try {
    fixture = await db.$transaction(async tx => {
      const user = await tx.user.findUniqueOrThrow({ where: { email: 'finance@demo.suryadesk.test' } })
      const pack = await tx.solarPackage.findFirstOrThrow({ where: { isActive: true } })
      const lead = await tx.lead.create({ data: {
        leadNumber: reference, source: 'WEB', status: 'QUOTED', subsidyInterest: false,
        customer: { create: { name: 'Browser payment fixture', phone: '+910000000000', address: 'Pune' } },
      } })
      const survey = await tx.siteSurvey.create({
        data: { leadId: lead.id, scheduledAt: new Date(), status: 'APPROVED' },
      })
      const amounts = { subtotal: 77000, tax: 0, total: 77000 }
      const quote = await tx.quotation.create({ data: {
        ...amounts, quoteNumber: reference, leadId: lead.id, surveyId: survey.id, packageId: pack.id,
        createdById: user.id, status: 'SENT', sentAt: new Date(),
      } })
      return { lead, survey, quote }
    })

    await login(page, 'sales')
    await page.getByRole('link', { name: 'Quotations', exact: true }).click()
    const quoteSearch = page.getByRole('textbox', { name: 'Search quotations' })
    await quoteSearch.fill(reference)
    await quoteSearch.press('Enter')
    const quoteRow = page.getByRole('row').filter({ hasText: reference })
    const accept = 'Record acceptance and create order'
    await expect(quoteRow.getByRole('button', { name: accept, exact: true })).toBeVisible()
    await quoteRow.getByRole('link', { name: 'View', exact: true }).click()
    await page.getByRole('button', { name: accept, exact: true }).click()
    const createDialog = page.getByRole('dialog', { name: accept })
    await createDialog.getByRole('checkbox', { name: 'The customer accepted this quotation.' }).check()
    await createDialog.getByRole('button', { name: accept, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Order for Browser payment fixture', exact: true })).toBeVisible()
    const order = await db.order.findUniqueOrThrow({ where: { quotationId: fixture.quote.id } })
    await expect(page).toHaveURL('/orders/' + order.id)
    await page.goBack()
    await expect(page.getByRole('navigation', { name: 'Related records' }).getByRole('link', { name: 'Order ' + order.orderNumber, exact: false }))
      .toHaveAttribute('href', '/orders/' + order.id)
    await page.getByRole('button', { name: 'Back to Quotations' }).click()
    await expect(quoteRow.getByRole('link', { name: 'View order', exact: true })).toHaveAttribute('href', '/orders/' + order.id)
    await expect(quoteRow.getByRole('button', { name: 'Create order' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible()

    await login(page, 'finance')
    await page.getByRole('link', { name: 'Orders', exact: true }).click()
    const search = page.getByRole('textbox', { name: 'Search orders' })
    await search.fill(reference)
    await search.press('Enter')
    const row = page.getByRole('row').filter({ hasText: order.orderNumber })
    await expect(row).toContainText('Quote ' + reference)
    await expect(row.getByRole('button')).toHaveText(['Record payment'])
    const cells = row.getByRole('cell')
    await expect(cells.nth(4)).toHaveText('₹77,000.00')
    await row.getByRole('button', { name: 'Record payment' }).click()
    const dialog = page.getByRole('dialog', { name: 'Record payment' })
    await expect(dialog.getByLabel('Payment reference')).toHaveCount(0)
    await dialog.getByLabel('Amount (INR)').fill('50000')
    await dialog.getByLabel('Payment method').selectOption('UPI')
    await dialog.getByRole('button', { name: 'Record payment' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(cells.nth(2)).toHaveText('₹77,000.00')
    await expect(cells.nth(3)).toHaveText('₹50,000.00')
    await expect(cells.nth(4)).toHaveText('₹27,000.00')
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } })
    expect(payment.reference).toMatch(/^PAY-[0-9A-F-]{36}$/)
    await row.getByRole('link', { name: 'View', exact: true }).click()
    const remaining = page.getByText('Remaining', { exact: true }).locator('..')
    await expect(remaining).toContainText('₹27,000.00')
    const extras = page.getByText('Job costs and subsidy', { exact: true })
    await extras.click()
    await page.getByRole('button', { name: 'Record job cost', exact: true }).click()
    const cost = page.getByRole('dialog', { name: 'Record job cost' })
    await cost.getByLabel('Cost category').selectOption('TRANSPORT')
    await cost.getByLabel('Cost description').fill('Site transport')
    await cost.getByLabel('Amount (INR)').fill('1200')
    await cost.getByRole('button', { name: 'Record job cost' }).click()
    await expect(cost).toHaveCount(0)
    expect(await db.jobCost.count({ where: { orderId: order.id } })).toBe(1)

    await extras.click()
    await page.getByRole('button', { name: 'Start subsidy application', exact: true }).click()
    const subsidyDialog = page.getByRole('dialog', { name: 'Start subsidy application' })
    await subsidyDialog.getByRole('button', { name: 'Start subsidy application' }).click()
    await expect(subsidyDialog).toHaveCount(0)
    await extras.click()
    const subsidy = await db.subsidyApplication.findUniqueOrThrow({ where: { orderId: order.id } })
    await expect(page.getByRole('link', { name: /^View subsidy application/ })).toHaveAttribute('href', '/subsidies/' + subsidy.id)
    await expect(page.getByRole('button', { name: 'Start subsidy application', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Record payment', exact: true }).click()
    await expect(dialog.getByLabel('Amount (INR)')).toHaveAttribute('max', '27000')
    await dialog.getByLabel('Amount (INR)').fill('27000')
    await dialog.getByLabel('Payment method').selectOption('UPI')
    await dialog.getByRole('button', { name: 'Record payment' }).click()
    await expect(remaining).toContainText('₹0.00')
    await expect(page.getByRole('button', { name: 'Record payment', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Back to Orders' }).click()
    await expect(row.getByRole('link', { name: 'View', exact: true })).toBeVisible()
    await expect(row.getByRole('button')).toHaveCount(0)
  } finally {
    try {
      if (fixture) {
        const { quote, survey, lead } = fixture
        const order = await db.order.findUnique({ where: { quotationId: quote.id } })
        const subsidy = order && await db.subsidyApplication.findUnique({ where: { orderId: order.id } })
        await db.$transaction([
          ...(order ? [
            db.auditLog.deleteMany({ where: { entityType: 'Order', entityId: order.id } }),
            ...(subsidy ? [
              db.auditLog.deleteMany({ where: { entityType: 'SubsidyApplication', entityId: subsidy.id } }),
              db.subsidyApplication.delete({ where: { id: subsidy.id } }),
            ] : []),
            db.jobCost.deleteMany({ where: { orderId: order.id } }),
            db.payment.deleteMany({ where: { orderId: order.id } }),
            db.dispatch.deleteMany({ where: { orderId: order.id } }),
            db.installation.deleteMany({ where: { orderId: order.id } }),
            db.order.delete({ where: { id: order.id } }),
          ] : []),
          db.auditLog.deleteMany({ where: { entityType: 'Quotation', entityId: quote.id } }),
          db.quotation.delete({ where: { id: quote.id } }),
          db.siteSurvey.delete({ where: { id: survey.id } }),
          db.lead.delete({ where: { id: lead.id } }),
          db.customer.delete({ where: { id: lead.customerId } }),
        ])
      }
    } finally {
      await db.$disconnect()
    }
  }
})

test('director can switch periods and see seeded profitability', async ({ page }) => {
  await login(page, 'director')
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await page.getByLabel('Reporting period').selectOption('sixMonths')
  await expect(page.getByRole('heading', { name: 'Daily cash collections' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent job profitability' })).toBeVisible()
  await expect(page.getByRole('table').first().getByRole('row').nth(1)).toBeVisible()
  await page.getByLabel('Reporting period').selectOption('year')
  const labour = page.getByRole('region', { name: 'Technician hours and labour cost' })
  await expect(labour.getByRole('table')).toBeVisible()
  await page.getByRole('button', { name: 'Next jobs' }).click()
  await expect(page.getByText(/^Page 2 of/)).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV' }).click()
  expect((await download).suggestedFilename()).toBe('profitability.csv')
  await page.getByRole('link', { name: 'Packages' }).click()
  const packageSearch = page.getByRole('textbox', { name: 'Search packages' })
  await packageSearch.fill('ON-GRID-3')
  await packageSearch.press('Enter')
  await expect(page).toHaveURL(/q=ON-GRID-3/)
  const packageRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'ON-GRID-3', exact: true }) })
  await packageRow.getByRole('link', { name: 'View', exact: true }).click()
  await expect(packageRow).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Bill of materials' })).toBeVisible()
  await page.goBack()
  await expect(packageSearch).toHaveValue('ON-GRID-3')
  await expect(packageRow).toBeVisible()
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
        ...amounts, orderNumber: 'ORD-' + randomUUID().toUpperCase(), customerId: lead.customerId, quotationId: quote.id,
        status: 'DELIVERED', confirmedAt: new Date(Date.now() - 86400_000),
      } })
      const job = await tx.installation.create({ data: {
        orderId: order.id, status: 'SCHEDULED', scheduledAt: new Date(), capacityKw: 3, checklist: {},
        installationAssignmentsByInstallation: { create: { technicianId: technician.id, assignedAt: new Date() } },
      } })
      return { job, order, quote, survey, lead }
    })
    await page.setViewportSize({ width: 430, height: 860 })
    await page.goto('/warranty')
    await page.getByRole('textbox', { name: 'Order ID' }).fill(fixture.order.orderNumber)
    await page.getByRole('button', { name: 'Check warranties' }).click()
    await expect(page.getByText('Warranty details will appear after installation is completed and signed off.')).toBeVisible()
    await login(page, 'technician')
    await page.getByRole('link', { name: 'Installations' }).click()
    const search = page.getByRole('textbox', { name: 'Search installations' })
    await search.fill(fixture.order.orderNumber.toLowerCase())
    await search.press('Enter')
    const row = page.getByRole('row').filter({ hasText: name })
    await expect(row.getByRole('cell', { name: fixture.order.orderNumber, exact: true })).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(2)
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

test('catalog administrator can maintain a package bill of materials', async ({ page }) => {
  const name = 'Browser BOM fixture ' + randomUUID()
  const database = createDatabase(process.env.DATABASE_URL)
  try {
    await login(page, 'admin')
    await page.getByRole('link', { name: 'Packages', exact: true }).click()
    await page.getByRole('button', { name: 'Add package', exact: true }).click()
    await expect(page.getByLabel('Package code')).toHaveCount(0)
    await page.getByLabel('Package name').fill(name)
    await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('PANEL_SET')
    await page.getByLabel('Package price (INR)').fill('2500')
    await page.getByRole('button', { name: 'Add component' }).click()
    await page.getByRole('combobox', { name: 'Component 1' }).selectOption({ index: 1 })
    await page.getByLabel('Quantity').fill('2')
    await page.getByRole('button', { name: 'Save package' }).click()
    await expect(page.getByRole('dialog', { name: 'Add solar package' })).toHaveCount(0)
    const { code } = await database.solarPackage.findFirstOrThrow({ where: { name } })
    expect(code).toMatch(/^PKG-[0-9A-F-]{36}$/)
    await page.getByRole('textbox', { name: 'Search packages' }).fill(code)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const row = page.getByRole('row').filter({ hasText: code })
    await expect(row).toContainText(name)
    await row.getByRole('button', { name: 'Edit package' }).click()
    await page.getByLabel('Quantity').fill('3')
    await page.getByRole('button', { name: 'Save package' }).click()
    await expect(page.getByRole('heading', { name: 'Edit package' })).toHaveCount(0)
    const saved = await database.solarPackage.findUniqueOrThrow({
      where: { code }, include: { packageComponentsByPackage: true },
    })
    expect(saved.packageComponentsByPackage[0].quantity).toBe(3)
  } finally {
    const saved = await database.solarPackage.findFirst({ where: { name } })
    if (saved) await database.$transaction([
      database.packageComponent.deleteMany({ where: { packageId: saved.id } }),
      database.solarPackage.delete({ where: { id: saved.id } }),
    ])
    await database.$disconnect()
  }
})

test('seeded customer can browse records and download an issued invoice on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('link', { name: 'Customer portal', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Customer sign in' })).toBeVisible()
  await page.getByLabel('Email address').fill('customer0001@demo.suryadesk.test')
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Welcome,/ })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Customer portal' })
  await nav.getByRole('link', { name: 'Orders', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'ORD-0001' })).toBeVisible()
  await nav.getByRole('link', { name: 'Invoices', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download invoice' }).first().click()
  expect((await download).suggestedFilename()).toMatch(/^INV-.+\.pdf$/)
  await nav.getByRole('link', { name: 'Warranties', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download warranty record' }).first()).toBeVisible()
  await nav.getByRole('link', { name: 'Service requests', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Raise a service request' })).toBeVisible()
  await nav.getByRole('link', { name: 'Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Customer sign in' })).toBeVisible()
})

test('administrator can open the global service labour rate settings', async ({ page }) => {
  await login(page, 'admin')
  await page.getByRole('link', { name: 'Service tickets', exact: true }).click()
  await page.getByRole('button', { name: 'Service charges', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Save service charges' })
  await expect(settings.getByLabel('Customer labour rate (INR per hour)')).toBeVisible()
  await expect(settings.getByLabel('Visiting charge (INR per visit)')).toBeVisible()
})

test('customer service request closes when the assigned technician submits the signed repair', async ({ page, browser, baseURL }) => {
  const db = createDatabase(process.env.DATABASE_URL)
  const description = 'Intermittent generation alarm after rain ' + randomUUID()
  const email = 'customer0001@demo.suryadesk.test'
  const support = await browser.newPage({ baseURL })
  const field = await browser.newPage({ baseURL })
  const { unlink } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  let part

  async function findTicket(staff, number) {
    await staff.getByRole('link', { name: 'Service tickets', exact: true }).click()
    const search = staff.getByRole('textbox', { name: 'Search service tickets' })
    await search.fill(number)
    await search.press('Enter')
    return staff.getByRole('row').filter({ hasText: number })
  }

  try {
    const account = await db.customerAccount.findUniqueOrThrow({ where: { email } })
    const now = new Date()
    const asset = await db.serializedAsset.findFirstOrThrow({
      where: { customerId: account.customerId, status: 'INSTALLED', warrantyByAsset: {
        status: 'ACTIVE', startAt: { lte: now }, endAt: { gt: now },
      } },
    })
    const technician = await db.user.findUniqueOrThrow({ where: { email: 'technician@demo.suryadesk.test' } })
    part = await db.product.create({ data: {
      sku: 'E2E-PART-' + randomUUID(), name: 'Site repair connector fixture', category: 'WIRING', unit: 'unit',
      serialized: false, cost: 30, salePrice: 50, warrantyMonths: 0, reorderLevel: 0,
      stockBalanceByProduct: { create: { onHand: 5, reserved: 1 } },
    } })
    await page.goto('/customer/login')
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_DEMO_PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('link', { name: 'Service requests', exact: true }).click()
    await page.getByRole('combobox', { name: 'Equipment', exact: true }).selectOption(asset.id)
    await page.getByLabel('Describe the issue').fill(description)
    await page.getByLabel('Supporting photo (optional)').setInputFiles({
      name: 'rain-alarm.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Yv1cAAAAASUVORK5CYII=', 'base64'),
    })
    await page.getByRole('button', { name: 'Submit service request' }).click()
    const card = page.getByRole('article').filter({ hasText: description })
    await expect(card.getByRole('button', { name: 'Download photo' })).toBeVisible()
    const ticket = await db.serviceTicket.findFirstOrThrow({ where: { description } })
    expect(ticket.coverageDecision).toBe('COVERED')

    await login(support, 'support')
    const supportRow = await findTicket(support, ticket.ticketNumber)
    await expect(support.getByRole('button', { name: 'Service charges', exact: true })).toHaveCount(0)
    await expect(supportRow).toContainText('Open')
    await expect(supportRow.getByRole('button')).toHaveText(['Assign technician'])
    await supportRow.getByRole('link', { name: 'View', exact: true }).click()
    await support.getByRole('button', { name: 'rain-alarm.png' }).click()
    const preview = support.getByRole('dialog', { name: 'rain-alarm.png' })
    await expect(preview.getByRole('img', { name: 'rain-alarm.png' })).toHaveJSProperty('naturalWidth', 1)
    await expect(preview.getByRole('link', { name: 'Download photo' })).toHaveAttribute('download', 'rain-alarm.png')
    await preview.getByRole('button', { name: 'Close' }).click()
    await db.serviceTicket.update({ where: { id: ticket.id }, data: { status: 'TRIAGED' } })
    await support.getByRole('button', { name: 'Back to Service tickets' }).click()
    await expect(supportRow).toContainText('Triaged')
    await expect(supportRow.getByRole('button')).toHaveText(['Assign technician'])
    await supportRow.getByRole('button', { name: 'Assign technician' }).click()
    const assign = support.getByRole('dialog', { name: 'Assign technician' })
    await assign.getByRole('combobox', { name: 'Technician', exact: true }).selectOption(technician.id)
    await assign.getByRole('button', { name: 'Assign technician' }).click()
    await expect(supportRow).toContainText('Assigned')
    await expect(supportRow.getByRole('button')).toHaveText(['Mark in progress'])

    await login(field, 'technician')
    const fieldRow = await findTicket(field, ticket.ticketNumber)
    await expect(fieldRow.getByRole('button')).toHaveText(['Mark in progress'])
    await fieldRow.getByRole('button', { name: 'Mark in progress' }).click()
    await field.getByRole('dialog', { name: 'Mark in progress' }).getByRole('button', { name: 'Mark in progress' }).click()
    await expect(fieldRow).toContainText('In progress')
    await expect(fieldRow.getByRole('button')).toHaveText(['Report work done'])
    await support.getByLabel('Filter by status').selectOption('IN_PROGRESS')
    await expect(supportRow).toContainText('In progress')
    await expect(supportRow.getByRole('button')).toHaveCount(0)
    await supportRow.getByRole('link', { name: 'View', exact: true }).click()
    await expect(support.getByRole('button', { name: 'Reassign technician' })).toBeVisible()
    await support.getByText('Record repair parts or charges', { exact: true }).click()
    await expect(support.getByRole('button', { name: 'Replace serialized equipment' })).toBeVisible()
    await expect(support.getByRole('button', { name: 'Resolve ticket' })).toHaveCount(0)
    await support.getByRole('button', { name: 'Back to Service tickets' }).click()
    await support.getByLabel('Filter by status').selectOption('')
    await fieldRow.getByRole('link', { name: 'View', exact: true }).click()
    await field.getByText('Parts and replacements used', { exact: true }).click()
    await expect(field.getByRole('button', { name: 'Replace serialized equipment' })).toBeVisible()
    await field.getByRole('button', { name: 'Record repair part', exact: true }).click()
    const addPart = field.getByRole('dialog', { name: 'Record repair part' })
    await expect(addPart.getByRole('option', { name: part.name + ' · ' + part.sku + ' · 4 available' })).toBeAttached()
    await addPart.getByLabel('Repair part').selectOption(part.id)
    await expect(addPart.getByLabel('Customer charge per unit (INR)')).toHaveCount(0)
    await addPart.getByLabel('Quantity used').fill('2')
    await addPart.getByRole('button', { name: 'Record repair part', exact: true }).click()
    await expect(field.getByRole('table', { name: 'Parts' }).getByRole('row').filter({ hasText: part.name })).toContainText('₹0.00')
    const balance = await db.stockBalance.findUniqueOrThrow({ where: { productId: part.id } })
    expect([balance.onHand, balance.reserved]).toEqual([3, 1])
    await field.getByRole('button', { name: 'Report work done' }).click()
    const report = field.getByRole('dialog', { name: 'Report work done' })
    const repairNotes = 'Re-seated the string connector and verified stable generation.'
    await report.getByLabel('Work completed').fill(repairNotes)
    await report.getByLabel('Evidence photo (optional)').setInputFiles({
      name: 'completed-repair.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Yv1cAAAAASUVORK5CYII=', 'base64'),
    })
    await report.getByRole('button', { name: 'Report work done' }).click()
    await expect(report.getByRole('alert')).toHaveText('Capture the customer signature to finish this visit.')
    const canvas = report.locator('canvas')
    await canvas.scrollIntoViewIfNeeded()
    const pad = await canvas.boundingBox()
    await field.mouse.move(pad.x + 20, pad.y + 30)
    await field.mouse.down()
    await field.mouse.move(pad.x + 90, pad.y + 45, { steps: 5 })
    await field.mouse.up()
    await report.getByRole('button', { name: 'Report work done' }).click()
    await expect(field.getByText(repairNotes, { exact: true })).toBeVisible()
    await expect(field.getByRole('button', { name: 'completed-repair.png' })).toBeVisible()
    await expect(field.getByRole('button', { name: 'service-customer-signature.png' })).toBeVisible()
    const signed = await db.serviceTicket.findUniqueOrThrow({ where: { id: ticket.id } })
    expect(signed.repairReportedAt.getTime()).toBeGreaterThan(signed.repairStartedAt.getTime())
    expect(signed.laborCharge.isZero()).toBe(true)
    await expect(field.getByRole('button', { name: 'Report work done' })).toHaveCount(0)
    await expect(field.getByText('Parts and replacements used', { exact: true })).toHaveCount(0)

    await page.reload()
    await expect(card).toContainText('Closed')
    await expect(card).toContainText('Covered by warranty · ₹0.00')
    await expect(card.getByRole('button', { name: 'Confirm resolution' })).toHaveCount(0)
    await support.getByLabel('Filter by status').selectOption('CLOSED')
    await expect(supportRow).toContainText('Closed')
    await expect(supportRow.getByRole('button')).toHaveCount(0)
    await expect(supportRow.getByRole('link', { name: 'View', exact: true })).toBeVisible()
    expect((await db.serviceTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe('CLOSED')
    expect(await db.invoice.count({ where: { ticketId: ticket.id } })).toBe(0)
  } finally {
    try {
      const ticket = await db.serviceTicket.findFirst({ where: { description } })
      if (ticket) {
        const where = { ownerType: 'TICKET', ownerId: ticket.id }
        const media = await db.attachment.findMany({ where, select: { storageKey: true } })
        await db.$transaction([
          db.attachment.deleteMany({ where }),
          db.auditLog.deleteMany({ where: { entityType: 'ServiceTicket', entityId: ticket.id } }),
          db.ticketPart.deleteMany({ where: { ticketId: ticket.id } }),
          db.serviceTicket.delete({ where: { id: ticket.id } }),
        ])
        const directory = resolve(fileURLToPath(new URL('../../backend/', import.meta.url)), process.env.UPLOAD_DIR ?? 'uploads')
        for (const { storageKey } of media) await unlink(resolve(directory, storageKey)).catch(error => {
          if (error.code !== 'ENOENT') throw error
        })
      }
      if (part) await db.$transaction([
        db.stockMovement.deleteMany({ where: { productId: part.id } }),
        db.stockBalance.delete({ where: { productId: part.id } }),
        db.product.delete({ where: { id: part.id } }),
      ])
    } finally {
      await Promise.all([support.close(), field.close(), db.$disconnect()])
    }
  }
})

test('survey submission has the evidence field in the review form', async ({ page }) => {
  await login(page, 'admin')
  await page.getByRole('link', { name: 'Surveys', exact: true }).click()
  await page.getByLabel('Filter by status').selectOption('SCHEDULED')
  const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Submit for review' }) }).first()
  await expect(row.getByRole('button', { name: 'Upload evidence' })).toHaveCount(0)
  await row.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByRole('dialog', { name: 'Submit for review' }).getByLabel('Evidence photo (optional)')).toBeVisible()
})
