import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { razorpayCheckout } from '../src/modules/portal/razorpay.service.js'

test('customer portal razorpay integration: order creation, signature verification, and payment recording', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = crypto.randomUUID()
  const mockKeyId = 'rzp_test_mock123'
  const mockSecret = 'mock_secret_key_987'

  try {
    await assert.rejects(db.$transaction(async tx => {
      const user = await tx.user.create({
        data: { name: 'Sales rep', email: key + '@suryadesk.test', role: 'SALES', passwordHash: 'hash' },
      })
      const customer = await tx.customer.create({
        data: { name: 'Aman Test', email: key + '@customer.test', phone: '+919999988888', address: '123 Test Solar St' },
      })
      const customerAccount = await tx.customerAccount.create({
        data: {
          customerId: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          passwordHash: 'hash',
        },
      })
      const lead = await tx.lead.create({
        data: {
          leadNumber: 'LED-' + key.slice(0, 8),
          customerId: customer.id,
          portalAccountId: customerAccount.id,
          source: 'WEB',
          status: 'WON',
          subsidyInterest: false,
        },
      })
      const survey = await tx.siteSurvey.create({
        data: { leadId: lead.id, scheduledAt: new Date(), status: 'APPROVED' },
      })
      const pack = await tx.solarPackage.create({
        data: { code: 'PKG-' + key.slice(0, 8), name: 'Solar 3kW Package', type: 'ON_GRID', basePrice: 50000 },
      })
      const quote = await tx.quotation.create({
        data: {
          quoteNumber: 'QTE-' + key.slice(0, 8),
          leadId: lead.id,
          surveyId: survey.id,
          packageId: pack.id,
          subtotal: 50000,
          tax: 0,
          total: 50000,
          createdById: user.id,
          status: 'ACCEPTED',
        },
      })
      const order = await tx.order.create({
        data: {
          orderNumber: 'ORD-' + key.slice(0, 8),
          quotationId: quote.id,
          customerId: customer.id,
          subtotal: 50000,
          tax: 0,
          total: 50000,
          status: 'DISPATCHED',
          confirmedAt: new Date(),
        },
      })

      const ticket = await tx.serviceTicket.create({ data: {
        ticketNumber: 'TKT-' + key, orderId: order.id, customerId: customer.id, incidentAt: new Date(),
        description: 'Test service visit', priority: 'LOW', status: 'CLOSED', coverageDecision: 'NOT_COVERED', laborCharge: 150,
      } })
      const invoice = await tx.invoice.create({ data: {
        invoiceNumber: 'INV-' + key, ticketId: ticket.id, customerId: customer.id,
        subtotal: 150, tax: 0, total: 150, status: 'ISSUED', issuedAt: new Date(),
      } })
      const database = { $transaction: callback => callback(tx) }
      const config = { RAZORPAY_KEY_ID: mockKeyId, RAZORPAY_KEY_SECRET: mockSecret }
      const payments = new Map()
      let orderCount = 0
      const checkout = razorpayCheckout(database, config, async (url, options) => {
        if (options.method === 'POST') {
          const data = JSON.parse(options.body)
          assert.equal(data.currency, 'INR')
          return Response.json({ id: 'order_Test' + ++orderCount, amount: data.amount, currency: data.currency })
        }
        const id = url.split('/').at(-1)
        if (id === 'payments') {
          const orderId = url.split('/').at(-2)
          return Response.json({ items: [...payments.values()].filter(row => row.order_id === orderId) })
        }
        return Response.json(payments.get(id))
      })
      const proof = (orderId, paymentId) => ({
        razorpay_order_id: orderId, razorpay_payment_id: paymentId,
        razorpay_signature: crypto.createHmac('sha256', mockSecret).update(orderId + '|' + paymentId).digest('hex'),
      })
      const captured = (session, id, status = 'captured') => ({
        id, order_id: session.orderId, amount: session.amount, currency: 'INR', status,
        captured: status === 'captured', amount_refunded: 0, method: 'upi',
      })

      assert.equal(razorpayCheckout(database, {}).enabled, false)
      assert.equal(razorpayCheckout(database, { ...config, NODE_ENV: 'production' }).enabled, false)
      await assert.rejects(checkout.start({ id: 'unrelated' }, 'orders', order.id), { code: 'NOT_FOUND' })
      await assert.rejects(checkout.start({ id: 'unrelated' }, 'invoices', invoice.id), { code: 'NOT_FOUND' })
      const session = await checkout.start(customerAccount, 'orders', order.id)
      assert.equal(session.amount, 5000000)
      assert.deepEqual(await checkout.start(customerAccount, 'orders', order.id), session)
      assert.equal(orderCount, 1)

      const signed = proof(session.orderId, 'pay_TestOrder')
      await assert.rejects(checkout.verify(customerAccount, 'orders', order.id, {
        ...signed, razorpay_signature: '0'.repeat(64),
      }), { code: 'INVALID_PAYMENT_SIGNATURE' })
      payments.set(signed.razorpay_payment_id, captured(session, signed.razorpay_payment_id, 'authorized'))
      await assert.rejects(checkout.verify(customerAccount, 'orders', order.id, signed), { code: 'PAYMENT_CONFLICT' })
      payments.set(signed.razorpay_payment_id, { ...captured(session, signed.razorpay_payment_id), amount: 1 })
      await assert.rejects(checkout.verify(customerAccount, 'orders', order.id, signed), { code: 'PAYMENT_CONFLICT' })
      payments.set(signed.razorpay_payment_id, captured(session, signed.razorpay_payment_id))
      assert.deepEqual(await checkout.verify(customerAccount, 'orders', order.id, signed), { paid: true })
      assert.deepEqual(await checkout.verify(customerAccount, 'orders', order.id, signed), { paid: true })
      const recorded = await tx.payment.findMany({ where: { orderId: order.id } })
      assert.equal(recorded.length, 1)
      assert.equal(recorded[0].reference, signed.razorpay_payment_id)
      assert.equal(recorded[0].recordedById, null)
      assert.equal((await tx.invoice.findUniqueOrThrow({ where: { orderId: order.id } })).status, 'PAID')

      const service = await checkout.start(customerAccount, 'invoices', invoice.id)
      assert.equal(service.amount, 15000)
      payments.set('pay_TestService', captured(service, 'pay_TestService'))
      assert.deepEqual(await checkout.start(customerAccount, 'invoices', invoice.id), { paid: true })
      assert.equal((await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, 'PAID')
      throw new Error('Rollback checkout fixtures')
    }), { message: 'Rollback checkout fixtures' })
  } finally {
    await db.$disconnect()
  }
})
