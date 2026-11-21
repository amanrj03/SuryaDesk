import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { invoiceService } from '../src/modules/invoices/invoices.service.js'
import { ordersService } from '../src/modules/orders/orders.service.js'
import { paymentsService } from '../src/modules/payments/payments.service.js'

test('concurrent payments cannot overpay an order and references make retries safe', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = randomUUID()
  try {
    const { order, user, lead, quote, survey, pack } = await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { name: 'Finance fixture', email: key + '@example.invalid', role: 'FINANCE', passwordHash: 'fixture' } })
      const lead = await tx.lead.create({ data: {
        leadNumber: key, source: 'WEB', status: 'WON', subsidyInterest: false,
        customer: { create: { name: 'Payment fixture', phone: '+919876543210', address: 'Test residence' } },
      } })
      const survey = await tx.siteSurvey.create({ data: { leadId: lead.id, scheduledAt: new Date(), status: 'APPROVED' } })
      const pack = await tx.solarPackage.create({ data: { code: key, name: 'Payment fixture', type: 'PANEL_SET', basePrice: 100 } })
      const amounts = { subtotal: 100, tax: 0, total: 100 }
      const quote = await tx.quotation.create({ data: {
        ...amounts, quoteNumber: key, leadId: lead.id, surveyId: survey.id, packageId: pack.id, createdById: user.id, status: 'ACCEPTED',
      } })
      const order = await tx.order.create({ data: {
        ...amounts, orderNumber: key, quotationId: quote.id, customerId: lead.customerId, status: 'CONFIRMED', confirmedAt: new Date(),
      } })
      return { order, user, lead, quote, survey, pack }
    })
    try {
      const invoices = invoiceService(db)
      const invoice = await db.invoice.create({ data: {
        invoiceNumber: 'TEST-' + key, orderId: order.id, customerId: order.customerId,
        subtotal: 100, tax: 0, total: 100, status: 'DRAFT', issuedAt: new Date(),
        invoiceLinesByInvoice: { create: { description: 'Installation', quantity: 1, unitPrice: 100, lineTotal: 100 } },
      } })
      await assert.rejects(invoices.issue(invoice.id, {}, user), { code: 'INVALID_TRANSITION' })
      const payments = paymentsService(db)
      const data = { amount: '70.25', method: 'UPI' }
      const results = await Promise.allSettled(['a', 'b'].map(reference => payments.record(order.id, { ...data, reference }, user)))
      const successful = results.find(result => result.status === 'fulfilled')
      assert.ok(successful)
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
      assert.equal(results.find(result => result.status === 'rejected').reason.code, 'PAYMENT_EXCEEDS_BALANCE')
      const retry = await payments.record(order.id, { ...data, reference: successful.value.payment.reference }, user)
      assert.equal(retry.created, false)
      const ledger = await payments.orderPayments(order.id)
      assert.equal(ledger.payments.length, 1)
      assert.equal(ledger.balance.toFixed(2), '29.75')
      await db.payment.create({ data: {
        orderId: order.id, amount: '10.00', method: 'CASH', receivedAt: new Date(),
        recordedById: user.id, voidedAt: new Date(), voidReason: 'Integration fixture',
      } })
      const orders = ordersService(db)
      const { data: [listed] } = await orders.list({ page: 1, limit: 20, q: key })
      assert.equal(listed.total.toFixed(2), '100.00')
      assert.equal(listed.paidTotal.toFixed(2), '70.25')
      assert.equal(listed.balance.toFixed(2), '29.75')
      assert.equal((await orders.detail(order.id)).balance.toFixed(2), '29.75')
      assert.equal((await invoices.detail(invoice.id)).status, 'DRAFT')
      const automatic = await payments.record(order.id, { amount: '10.00', method: 'CASH' }, user)
      assert.match(automatic.payment.reference, /^PAY-[0-9A-F-]{36}$/)
      await db.order.update({ where: { id: order.id }, data: { status: 'DISPATCHED' } })
      const finalPayment = { amount: '19.75', method: 'BANK_TRANSFER', requestId: randomUUID() }
      const saved = await payments.record(order.id, finalPayment, user)
      assert.match(saved.payment.reference, /^PAY-[0-9A-F-]{36}$/)
      const retried = await payments.record(order.id, finalPayment, user)
      assert.equal(retried.created, false)
      assert.equal(retried.payment.id, saved.payment.id)
      await assert.rejects(payments.record(order.id, { ...finalPayment, method: 'UPI' }, user), { code: 'CONFLICT' })
      assert.equal((await orders.detail(order.id)).balance.toFixed(2), '0.00')
      assert.equal((await invoices.detail(invoice.id)).status, 'PAID')
      assert.equal(await db.invoice.count({ where: { orderId: order.id } }), 1)
    } finally {
      await db.$transaction(async tx => {
        const invoice = await tx.invoice.findUnique({ where: { orderId: order.id } })
        if (invoice) {
          await tx.auditLog.deleteMany({ where: { entityId: invoice.id, entityType: 'Invoice' } })
          await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } })
          await tx.invoice.delete({ where: { id: invoice.id } })
        }
        await tx.auditLog.deleteMany({ where: { entityType: 'Order', entityId: order.id } })
        await tx.payment.deleteMany({ where: { orderId: order.id } })
        await tx.order.delete({ where: { id: order.id } })
        await tx.quotation.delete({ where: { id: quote.id } })
        await tx.solarPackage.delete({ where: { id: pack.id } })
        await tx.siteSurvey.delete({ where: { id: survey.id } })
        await tx.lead.delete({ where: { id: lead.id } })
        await tx.customer.delete({ where: { id: lead.customerId } })
        await tx.user.delete({ where: { id: user.id } })
      })
    }
  } finally {
    await db.$disconnect()
  }
})
