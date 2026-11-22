import { expect, test } from '@playwright/test'

const areas = {
  overview: 'Overview', leads: 'Enquiries', customers: 'Customers', surveys: 'Surveys',
  packages: 'Packages', products: 'Products', quotes: 'Quotations', orders: 'Orders',
  inventory: 'Inventory', assets: 'Equipment serials', dispatches: 'Dispatch', suppliers: 'Suppliers',
  purchases: 'Purchase orders', installations: 'Installations', warranties: 'Warranties',
  tickets: 'Service tickets', invoices: 'Invoices', subsidies: 'Subsidies', payments: 'Payments', users: 'Staff',
}
const allowed = {
  admin: Object.keys(areas),
  director: Object.keys(areas).filter(area => !['dispatches', 'users'].includes(area)),
  sales: ['leads', 'customers', 'surveys', 'packages', 'products', 'quotes', 'orders', 'payments'],
  surveyor: ['leads', 'surveys'],
  warehouse: ['packages', 'products', 'orders', 'inventory', 'assets', 'dispatches', 'suppliers', 'purchases', 'warranties'],
  technician: ['installations', 'warranties', 'tickets'],
  support: ['customers', 'orders', 'inventory', 'assets', 'suppliers', 'purchases', 'warranties', 'tickets'],
  finance: ['overview', 'customers', 'orders', 'invoices', 'subsidies', 'payments'],
}

for (const [role, modules] of Object.entries(allowed)) {
  test(`${role} can open every assigned workspace module`, async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/login')
    await page.getByLabel('Work email').fill(role + '@demo.suryadesk.test')
    await page.getByLabel('Password').fill(process.env.SEED_DEMO_PASSWORD)
    const login = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/login'))
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const { data } = await (await login).json()
    const headers = { Authorization: 'Bearer ' + data.accessToken }
    const nav = page.getByRole('navigation', { name: 'Workspace' })
    await expect(nav.getByRole('link')).toHaveCount(modules.length)
    for (const area of modules) {
      const path = area === 'overview' ? '/api/v1/reports/overview' : '/api/v1/' + area
      const response = await page.request.get(path, { headers })
      expect(response.ok(), area).toBe(true)
      const { meta } = await response.json()
      const link = nav.getByRole('link', { name: areas[area], exact: true })
      await link.click()
      await expect(page).toHaveURL('/' + area)
      await expect(page.getByRole('main').getByRole('heading', { name: area === 'overview' ? 'Operations overview' : areas[area], exact: true })).toBeVisible()
      if (role === 'surveyor' && ['leads', 'surveys'].includes(area)) expect(meta.total, area).toBeGreaterThan(0)
      if (meta?.total > 0) await expect(page.locator('main .records tbody tr').first()).toBeVisible()
      if (meta?.total === 0) await expect(page.getByText(`No ${areas[area].toLowerCase()} found.`, { exact: true })).toBeVisible()
    }
    if (role !== 'admin') {
      await expect(nav.getByRole('link', { name: 'Staff', exact: true })).toHaveCount(0)
      expect((await page.request.get('/api/v1/users', { headers })).status()).toBe(403)
      expect((await page.request.get('/api/v1/reports/admin-overview', { headers })).status()).toBe(403)
    }
    if (!modules.includes('customers')) {
      expect((await page.request.get('/api/v1/customers', { headers })).status()).toBe(403)
    }
    expect(errors).toEqual([])
  })
}
