import { expect, test } from '@playwright/test'

async function signIn(page) {
  await page.goto('/login')
  await page.getByLabel('Work email').fill('admin@demo.suryadesk.test')
  await page.getByLabel('Password').fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
}

test('all administrator navigation destinations load live records', async ({ page }, info) => {
  test.setTimeout(90000)
  let opened = 0
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
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('alert')).toHaveCount(0)
    const entryPoints = page.locator('.records > .toolbar > button.primary, .records tbody button')
    const actions = [...new Set(await entryPoints.allTextContents())]
    for (const action of actions) {
      await entryPoints.filter({ hasText: action }).first().click()
      const panel = page.locator('.lead-editor')
      await expect(panel).toBeVisible()
      await expect(panel.getByRole('status')).toHaveCount(0)
      await expect(panel.getByRole('alert')).toHaveCount(0)
      await panel.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(panel).toHaveCount(0)
      opened++
    }
  }
  expect(opened).toBeGreaterThan(25)
  console.log('Verified action or record panels:', opened)
  await nav.getByRole('link', { name: 'Enquiries', exact: true }).click()
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('WON')
  await expect(page.getByRole('row').nth(1)).toContainText('Won')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
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
  await nav.getByRole('link', { name: 'Staff', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Staff', exact: true })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await page.screenshot({ path: info.outputPath('mobile-staff.png') })
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible()
  expect(errors).toEqual([])
})

test('lists recover from non-JSON failures and expired sessions return to sign in', async ({ page }) => {
  await signIn(page)
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
    const panel = page.locator('.lead-editor')
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
  await search.fill('DEMO-LEAD-0001')
  await search.press('Enter')
  await expect(page.getByRole('row')).toHaveCount(2)
  await expect(page.getByRole('row').nth(1)).toContainText('DEMO-LEAD-0001')

  await page.setViewportSize({ width: 360, height: 780 })
  const navigation = page.getByRole('navigation', { name: 'Workspace' })
  await page.getByRole('button', { name: 'Hide navigation' }).click()
  await expect(navigation).toBeHidden()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(navigation).toBeVisible()
})
