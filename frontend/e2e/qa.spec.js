import { expect, test } from '@playwright/test'

async function signIn(page) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill('admin@demo.suryadesk.test')
  await page.getByLabel('Password').fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
}

test('all administrator modules load live records and open actions in modal dialogs', async ({ page }, info) => {
  test.setTimeout(90000)
  let opened = 0
  let viewed = 0
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await signIn(page)
  const nav = page.getByRole('navigation', { name: 'Workspace' })
  await expect(nav.getByRole('link')).toHaveCount(20)
  const links = await nav.getByRole('link').evaluateAll(items => items.map(item => ({
    path: item.getAttribute('href'), title: item.textContent,
  })))
  for (const { path, title } of links.filter(item => item.path !== '/overview')) {
    const response = page.waitForResponse(item => new URL(item.url()).pathname === '/api/v1' + path)
    const link = nav.getByRole('link', { name: title, exact: true })
    await link.click()
    const result = await response
    expect(result.ok(), path).toBe(true)
    const { meta } = await result.json()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.locator('.page-header p')).toHaveText(meta.total + (meta.total === 1 ? ' record' : ' records'))
    await expect(page.locator('main')).not.toContainText(/\bDEMO-|\(Demo\)/)
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('alert')).toHaveCount(0)
    const view = page.locator('tbody').getByRole('link', { name: 'View', exact: true }).first()
    if (await view.count()) {
      const detailPath = await view.getAttribute('href')
      await view.click()
      await expect(page).toHaveURL(url => url.pathname === detailPath)
      await expect(page.locator('main h1')).not.toHaveText('Record details')
      await expect(page.locator('main .pager')).toHaveCount(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await page.getByRole('button', { name: 'Back to ' + title, exact: true }).click()
      await expect(page).toHaveURL(url => url.pathname === path)
      await expect(view).toBeVisible()
      viewed++
    }
    const entryPoints = page.locator('.records > .toolbar > button.primary, .records tbody button')
    const actions = [...new Set(await entryPoints.allTextContents())]
    for (const action of actions) {
      const trigger = entryPoints.and(page.getByRole('button', { name: action, exact: true })).first()
      await trigger.click()
      const panel = page.getByRole('dialog')
      await expect(panel.and(page.locator('dialog:modal'))).toBeVisible()
      await expect(page.locator('.records dialog')).toHaveCount(0)
      await expect(panel.getByRole('status')).toHaveCount(0)
      await expect(panel.getByRole('alert')).toHaveCount(0)
      await panel.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(panel).toHaveCount(0)
      opened++
    }
  }
  expect(viewed).toBe(12)
  expect(opened + viewed).toBeGreaterThan(25)
  console.log('Verified action dialogs:', opened, 'and detail pages:', viewed)
  await nav.getByRole('link', { name: 'Customers', exact: true }).click()
  const customerSearch = page.getByRole('textbox', { name: 'Search customers' })
  await customerSearch.fill('customer0001@suryadesk.test')
  await customerSearch.press('Enter')
  await expect(page.getByRole('cell', { name: 'customer0001@suryadesk.test', exact: true })).toBeVisible()

  await nav.getByRole('link', { name: 'Enquiries', exact: true }).click()
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('WON')
  await expect(page.getByRole('row').nth(1)).toContainText('Won')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText(/^Page 2 of/)).toBeVisible()
  const filteredUrl = page.url()
  await page.getByRole('link', { name: 'View', exact: true }).first().click()
  await page.getByRole('button', { name: 'Back to Enquiries' }).click()
  await expect(page).toHaveURL(filteredUrl)
  await expect(page.getByRole('combobox', { name: 'Filter by status' })).toHaveValue('WON')
  await expect(page.getByText(/^Page 2 of/)).toBeVisible()
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(page.getByText(/^Page 1 of/)).toBeVisible()
  await page.screenshot({ path: info.outputPath('desktop-enquiries.png') })

  await page.setViewportSize({ width: 360, height: 780 })
  const mobileLayout = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    heading: document.querySelector('h1').getBoundingClientRect().top,
  }))
  expect(mobileLayout.page).toBeLessThanOrEqual(mobileLayout.viewport)
  expect(mobileLayout.heading).toBeLessThan(300)
  await page.getByRole('link', { name: 'View', exact: true }).first().click()
  await expect(page.locator('main h1')).not.toHaveText('Record details')
  const mobileBack = page.getByRole('button', { name: 'Back to Enquiries' })
  await expect(mobileBack).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await mobileBack.click()
  await nav.getByRole('link', { name: 'Orders', exact: true }).click()
  const paymentTrigger = page.getByRole('button', { name: 'Record payment', exact: true }).first()
  await paymentTrigger.click()
  const payment = page.getByRole('dialog', { name: 'Record payment' })
  await expect(payment).toBeInViewport()
  await expect(payment.getByLabel('Amount (INR)')).toBeVisible()
  await expect(payment.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(payment.getByLabel('Amount (INR)')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(payment).toHaveCount(0)
  await expect(paymentTrigger).toBeFocused()
  await nav.getByRole('link', { name: 'Staff', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Staff', exact: true })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await page.screenshot({ path: info.outputPath('mobile-staff.png') })
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible()
  expect(errors).toEqual([])
})

test('dispatch pick lists show quantities and serials while orders show package pricing', async ({ page }) => {
  await signIn(page)
  const nav = page.getByRole('navigation', { name: 'Workspace' })
  await nav.getByRole('link', { name: 'Dispatch', exact: true }).click()
  await page.getByLabel('Filter by status').selectOption('ALLOCATED')
  await page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'DSP-0081', exact: true }) })
    .getByRole('link', { name: 'View', exact: true }).click()
  const required = page.getByRole('table', { name: 'Required materials' })
  const allocated = page.getByRole('table', { name: 'Allocated materials' })
  await expect(required.getByRole('columnheader')).toHaveText(['Description', 'Quantity'])
  await expect(required.getByRole('row').filter({ hasText: '550 W mono solar panel' }).getByRole('cell'))
    .toHaveText(['550 W mono solar panel', '2'])
  await expect(allocated.getByRole('row').filter({ hasText: '550 W mono solar panel' })).toHaveCount(2)
  await expect(allocated.getByRole('cell', { name: 'SD-PANEL-00481', exact: true })).toBeVisible()
  await expect(allocated.getByRole('row').filter({ hasText: 'Solar connector pair' }).getByRole('cell'))
    .toHaveText(['Solar connector pair', '2', 'Not serialized'])

  await nav.getByRole('link', { name: 'Orders', exact: true }).click()
  const search = page.getByRole('textbox', { name: 'Search orders' })
  await search.fill('ORD-0081')
  await search.press('Enter')
  await page.getByRole('row').filter({ hasText: 'ORD-0081' })
    .getByRole('link', { name: 'View', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: '550 W mono solar panel' }).getByRole('cell'))
    .toHaveText(['550 W mono solar panel', '2', 'Included in package'])
  await expect(page.getByRole('cell', { name: '₹73,400.00', exact: true })).toBeVisible()
})

test('lists and details recover from non-JSON failures and expired sessions return to sign in', async ({ page }) => {
  await signIn(page)
  const nav = page.getByRole('navigation', { name: 'Workspace' })
  await nav.getByRole('link', { name: 'Orders', exact: true }).click()
  const orderSearch = page.getByRole('textbox', { name: 'Search orders' })
  await orderSearch.fill('DEMO-ORD-0111')
  await orderSearch.press('Enter')
  const order = page.getByRole('row').filter({ hasText: 'ORD-0111' })
  const detailUrl = '**/api/v1/orders/DEMO-ORDER-0111'
  await page.route(detailUrl, route => route.fulfill({
    status: 502, contentType: 'text/plain', body: 'Unavailable',
  }))
  await order.getByRole('link', { name: 'View', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The service is unavailable')
  await page.unroute(detailUrl)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: /^Order for / })).toBeVisible()
  await expect(page.getByText('ORD-0111', { exact: true })).toBeVisible()

  const url = '**/api/v1/leads?*'
  await page.route(url, route => route.fulfill({ status: 502, contentType: 'text/plain', body: 'Unavailable' }))
  await page.getByRole('link', { name: 'Enquiries', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The service is unavailable')
  await page.unroute(url)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('table')).toBeVisible()
  await page.route(url, route => route.fulfill({ status: 401, json: { success: false } }), { times: 1 })
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible()
})

test('staff administration persists edits and deactivation', async ({ page }) => {
  const { randomUUID } = await import('node:crypto')
  const { createDatabase } = await import('../../backend/src/lib/prisma.js')
  const email = randomUUID() + '@example.invalid'
  const db = createDatabase(process.env.DATABASE_URL)
  try {
    await signIn(page)
    await page.getByRole('link', { name: 'Staff', exact: true }).click()
    await page.getByRole('button', { name: 'Add staff account', exact: true }).click()
    const panel = page.getByRole('dialog')
    await panel.getByRole('textbox', { name: 'Name', exact: true }).fill('QA staff fixture')
    await panel.getByLabel('Work email').fill(email)
    await panel.getByLabel('Temporary password').fill(randomUUID())
    await panel.getByRole('combobox', { name: 'Role' }).selectOption('TECHNICIAN')
    await panel.getByRole('button', { name: 'Add staff account' }).click()
    await expect(panel).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Search staff' }).fill(email)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const row = page.getByRole('row').filter({ hasText: email })
    await row.getByRole('button', { name: 'Edit staff account' }).click()
    await panel.getByRole('checkbox', { name: 'Active account' }).uncheck()
    await panel.getByRole('spinbutton', { name: 'Hourly cost (INR)' }).fill('325.50')
    await panel.getByRole('button', { name: 'Edit staff account' }).click()
    await expect(row).toContainText('Inactive')
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    expect(user.hourlyCost.toFixed(2)).toBe('325.50')
    expect(user.isActive).toBe(false)
  } finally {
    const user = await db.user.findUnique({ where: { email } })
    if (user) await db.$transaction([
      db.auditLog.deleteMany({ where: { entityId: user.id, entityType: 'User' } }),
      db.user.delete({ where: { id: user.id } }),
    ])
    await db.$disconnect()
  }
})

test('staff sign-in keeps the form within a mobile viewport and can reveal a password', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/login')
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('example-password')
  await expect(password).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('example-password')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360)
  await page.getByRole('link', { name: 'Request a solar quote' }).click()
  await expect(page.getByRole('heading', { name: 'Request a solar quote' })).toBeVisible()
})

test('header enquiry search and mobile navigation work', async ({ page }) => {
  await signIn(page)
  const search = page.getByRole('searchbox', { name: 'Search enquiries from header' })
  await search.fill('LEAD-0001')
  await search.press('Enter')
  await expect(page.getByRole('row')).toHaveCount(2)
  await expect(page.getByRole('cell', { name: 'LEAD-0001', exact: true })).toBeVisible()

  await page.setViewportSize({ width: 360, height: 780 })
  const navigation = page.getByRole('navigation', { name: 'Workspace' })
  await page.getByRole('button', { name: 'Hide navigation' }).click()
  await expect(navigation).toBeHidden()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(navigation).toBeVisible()
})

test('the local demo picker fills the selected role and signs in using the seeded password', async ({ page }) => {
  await page.goto('/login')
  const accounts = page.getByRole('region', { name: 'Quick sign-in' })
  await expect(accounts.getByRole('button')).toHaveCount(8)
  await accounts.getByRole('button', { name: 'Sales' }).click()
  await expect(page.getByLabel('Work email')).toHaveValue('sales@demo.suryadesk.test')
  await expect(page.getByLabel('Password', { exact: true })).not.toHaveValue('')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/leads$/)
})
