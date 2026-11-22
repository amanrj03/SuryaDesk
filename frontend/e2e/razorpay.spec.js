import { expect, test } from '@playwright/test'

test('customer order checkout sends the Razorpay proof and refreshes the balance', async ({ page }) => {
  const orderId = 'rzp-browser-order'
  const balance = 1200
  const proof = {
    razorpay_order_id: 'order_BrowserTest', razorpay_payment_id: 'pay_BrowserTest',
    razorpay_signature: 'a'.repeat(64),
  }
  let verified = false
  await page.route('**/api/v1/customer-portal/records', async route => {
    const response = await route.fetch()
    const payload = await response.json()
    Object.assign(payload.data, {
      razorpayEnabled: true,
      orders: [{
        id: orderId, orderNumber: 'ORD-BROWSER', status: 'CONFIRMED', confirmedAt: new Date().toISOString(),
        total: balance, paidTotal: verified ? balance : 0, balance: verified ? 0 : balance,
        quotation: { package: { name: 'Solar package' } }, dispatchesByOrder: [], paymentsByOrder: [],
      }],
    })
    await route.fulfill({ response, json: payload })
  })
  await page.route('**/api/v1/customer-portal/checkout/orders/' + orderId, route => route.fulfill({
    json: { success: true, data: { key: 'rzp_test_Browser', amount: balance * 100, currency: 'INR', orderId: proof.razorpay_order_id } },
  }))
  await page.route('https://checkout.razorpay.com/v1/checkout.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.Razorpay = class { constructor(options) { this.options = options } open() {
      if (this.options.amount === ${balance * 100} && this.options.order_id === '${proof.razorpay_order_id}') {
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
  await order.getByRole('button', { name: 'Pay with Razorpay (test)' }).click()
  await expect(page.getByText('Test payment verified.')).toBeVisible()
  await expect(order.getByText('Outstanding', { exact: true }).locator('..')).toContainText('₹0.00')
  await expect(order.getByRole('button', { name: 'Pay with Razorpay (test)' })).toHaveCount(0)
})
