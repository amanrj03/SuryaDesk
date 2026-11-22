import { expect, test } from '@playwright/test'

test('customer order checkout accepts a partial payment and refreshes the remaining balance', async ({ page }) => {
  const orderId = 'rzp-browser-order'
  const balance = 1200
  const payment = 450.25
  const amountPaise = 45025
  const proof = {
    razorpay_order_id: 'order_BrowserTest', razorpay_payment_id: 'pay_BrowserTest',
    razorpay_signature: 'a'.repeat(64),
  }
  let verified = false
  await page.route('**/api/v1/customer-portal/records', route =>
    route.fulfill({ json: { success: true, data: {
      requests: [], invoices: [], assets: [], tickets: [],
      razorpayEnabled: true,
      orders: [{
        id: orderId, orderNumber: 'ORD-BROWSER', status: 'CONFIRMED', confirmedAt: new Date().toISOString(),
        total: balance, paidTotal: verified ? payment : 0, balance: verified ? balance - payment : balance,
        quotation: { package: { name: 'Solar package' } }, dispatchesByOrder: [], paymentsByOrder: [],
      }],
    } } }))
  await page.route('**/api/v1/customer-portal/checkout/orders/' + orderId, async route => {
    expect(route.request().postDataJSON()).toEqual({ amountPaise })
    await route.fulfill({
      json: { success: true, data: { key: 'rzp_test_Browser', amount: amountPaise, currency: 'INR', orderId: proof.razorpay_order_id } },
    })
  })
  await page.route('https://checkout.razorpay.com/v1/checkout.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.Razorpay = class { constructor(options) { this.options = options } open() {
      if (this.options.amount === ${amountPaise} && this.options.order_id === '${proof.razorpay_order_id}') {
        this.options.handler(${JSON.stringify(proof)})
      }
    } }`,
  }))
  await page.route('**/api/v1/customer-portal/checkout/orders/' + orderId + '/verify', async route => {
    expect(route.request().postDataJSON()).toEqual(proof)
    verified = true
    await route.fulfill({ json: { success: true, data: { paid: true } } })
  })

  await page.goto('/customer/login')
  await page.getByLabel('Email address').fill('customer0001@demo.suryadesk.test')
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('navigation', { name: 'Customer portal' }).getByRole('link', { name: 'Orders', exact: true }).click()
  const order = page.getByRole('article').filter({ hasText: 'ORD-BROWSER' })
  const amount = order.getByLabel('Payment amount (INR)')
  await expect(amount).toHaveValue('1200.00')
  await amount.fill('450.25')
  await order.getByRole('button', { name: 'Pay with Razorpay (test)' }).click()
  await expect(page.getByText('Test payment verified.')).toBeVisible()
  await expect(order.getByText('Outstanding', { exact: true }).locator('..')).toContainText('₹749.75')
  await expect(amount).toHaveValue('749.75')
})
