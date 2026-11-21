import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { subsidiesService } from '../src/modules/subsidies/subsidies.service.js'
import { ordersService } from '../src/modules/orders/orders.service.js'

test('an accepted quotation converts once and creates both fulfillment queues', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = randomUUID()
  try {
    await assert.rejects(db.$transaction(async tx => {
      const user = await tx.user.create({ data: {
        name: 'Sales fixture', email: key + '@example.invalid', role: 'SALES', passwordHash: 'fixture',
      } })
      const lead = await tx.lead.create({ data: {
        leadNumber: key, source: 'WEB', status: 'QUOTED', subsidyInterest: false,
        customer: { create: { name: 'Order fixture', address: 'Test residence', phone: '+919876543210' } },
      } })
      const survey = await tx.siteSurvey.create({ data: { leadId: lead.id, scheduledAt: new Date(), status: 'APPROVED' } })
      const pack = await tx.solarPackage.create({ data: {
        code: key, name: 'Panel set fixture', type: 'PANEL_SET', basePrice: 100,
      } })
      const quote = await tx.quotation.create({ data: {
        quoteNumber: key, leadId: lead.id, surveyId: survey.id, packageId: pack.id, createdById: user.id,
        status: 'SENT', subtotal: 100, tax: 0, total: 100,
        quotationLinesByQuotation: { create: {
          descriptionSnapshot: 'Snapshot', quantity: 1, unitPriceSnapshot: 100, unitCostSnapshot: 20,
          lineTotal: 100, lineKind: 'SERVICE',
        } },
      } })
      const orders = ordersService({ $transaction: callback => callback(tx) })
      await assert.rejects(orders.convert(quote.id, {}, user), { code: 'INVALID_TRANSITION' })
      await tx.quotation.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } })
      const first = await orders.convert(quote.id, {}, user)
      const second = await orders.convert(quote.id, {}, user)
      assert.equal(first.created, true)
      assert.equal(second.created, false)
      assert.equal(first.order.id, second.order.id)
      assert.equal(first.order.orderLinesByOrder[0].descriptionSnapshot, 'Snapshot')
      assert.equal(first.order.dispatchesByOrder[0].status, 'DRAFT')
      assert.equal(first.order.installationByOrder.status, 'UNSCHEDULED')

      const cost = await orders.cost(first.order.id, { category: 'TRANSPORT', description: 'Truck hire', amount: '112.50' }, user)
      assert.equal(cost.amount.toFixed(2), '112.50')
      assert.equal(await tx.jobCost.count({ where: { orderId: first.order.id } }), 1)
      const subsidies = subsidiesService({ $transaction: callback => callback(tx) })
      const subsidy = await subsidies.create({ orderId: first.order.id }, user)
      assert.equal(subsidy.data.status, 'NOT_STARTED')
      assert.equal((await subsidies.create({ orderId: first.order.id }, user)).existing, true)
      await assert.rejects(subsidies.update(subsidy.data.id, { status: 'PAID' }, user), { code: 'INVALID_TRANSITION' })
      await subsidies.update(subsidy.data.id, { status: 'DOCUMENTS_PENDING', documentChecklist: { utilityBill: true } }, user)
      await assert.rejects(subsidies.update(subsidy.data.id, { status: 'SUBMITTED' }, user), { code: 'INVALID_TRANSITION' })
      const application = await subsidies.update(subsidy.data.id, {
        status: 'SUBMITTED', reference: 'TEST-REF', submittedAt: new Date(),
      }, user)
      assert.equal(application.documentChecklist.utilityBill, true)
      assert.equal(application.status, 'SUBMITTED')
      await subsidies.update(application.id, { status: 'APPROVED', decisionAt: new Date() }, user)
      assert.equal((await subsidies.update(application.id, { status: 'PAID' }, user)).status, 'PAID')
      await assert.rejects(subsidies.update(application.id, { status: 'PAID', notes: 'Changed after payment' }, user),
        { code: 'INVALID_TRANSITION', message: 'Paid subsidy applications are finalized.' })
      throw new Error('Rollback order fixture')
    }), { message: 'Rollback order fixture' })
  } finally {
    await db.$disconnect()
  }
})
