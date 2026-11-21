import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { dispatchService } from '../src/modules/dispatch/dispatch.service.js'

test('competing orders can reserve the last serialized unit only once', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = randomUUID()
  try {
    const fixture = await db.$transaction(async tx => {
      const user = await tx.user.create({ data: {
        name: 'Concurrency fixture', email: key + '@example.invalid', role: 'WAREHOUSE', passwordHash: 'fixture',
      } })
      const lead = await tx.lead.create({ data: {
        leadNumber: key, source: 'WEB', status: 'WON', subsidyInterest: false,
        customer: { create: { name: 'Concurrency fixture', phone: '+910000000000', address: 'Fixture site' } },
      } })
      const survey = await tx.siteSurvey.create({ data: { leadId: lead.id, scheduledAt: new Date(), status: 'APPROVED' } })
      const pack = await tx.solarPackage.create({ data: { code: key, name: 'Fixture kit', type: 'PANEL_SET', basePrice: 100 } })
      const product = await tx.product.create({ data: {
        sku: key, name: 'Last inverter', category: 'INVERTER', unit: 'unit', cost: 60, salePrice: 100,
        serialized: true, warrantyMonths: 24, reorderLevel: 0, stockBalanceByProduct: { create: { onHand: 1, reserved: 0 } },
      } })
      const asset = await tx.serializedAsset.create({ data: { serialNumber: key, productId: product.id, status: 'IN_STOCK', receivedAt: new Date() } })
      const orders = []
      const quotes = []
      const amounts = { subtotal: 100, tax: 0, total: 100 }
      for (const suffix of ['a', 'b']) {
        const quote = await tx.quotation.create({ data: {
          ...amounts, quoteNumber: key + suffix, leadId: lead.id, surveyId: survey.id,
          packageId: pack.id, createdById: user.id, status: 'ACCEPTED',
        } })
        quotes.push(quote.id)
        orders.push(await tx.order.create({ data: {
          ...amounts, orderNumber: key + suffix, quotationId: quote.id, customerId: lead.customerId,
          status: 'CONFIRMED', confirmedAt: new Date(),
          orderLinesByOrder: { create: {
            productId: product.id, descriptionSnapshot: 'Last inverter', quantity: 1, unitCostSnapshot: 60,
            unitPriceSnapshot: 100, lineTotal: 100, lineKind: 'MATERIAL',
          } },
          dispatchesByOrder: { create: { dispatchNumber: key + suffix, status: 'DRAFT' } },
        }, include: { dispatchesByOrder: true } }))
      }
      return { user, lead, survey, pack, product, asset, orders, quotes }
    })
    const { user, lead, survey, pack, product, asset, orders, quotes } = fixture
    const dispatchIds = orders.map(order => order.dispatchesByOrder[0].id)
    const orderIds = orders.map(order => order.id)
    try {
      const service = dispatchService(db)
      const items = [{ productId: product.id, quantity: 1, serialNumbers: [key] }]
      const outcomes = await Promise.allSettled(dispatchIds.map(id => service.allocate(id, { items }, user)))
      const success = outcomes.filter(outcome => outcome.status === 'fulfilled')
      assert.equal(success.length, 1)
      assert.equal(outcomes.find(outcome => outcome.status === 'rejected').reason.code, 'INSUFFICIENT_STOCK')
      assert.equal((await db.serializedAsset.findUniqueOrThrow({ where: { id: asset.id } })).orderId, success[0].value.orderId)
      assert.equal((await db.stockBalance.findUniqueOrThrow({ where: { productId: product.id } })).reserved, 1)
      assert.equal(await db.dispatchItem.count({ where: { dispatchId: { in: dispatchIds } } }), 1)
      assert.equal(await db.stockMovement.count({ where: { productId: product.id, type: 'RESERVE' } }), 1)
    } finally {
      await db.$transaction(async tx => {
        await tx.auditLog.deleteMany({ where: { actorId: user.id } })
        await tx.dispatchItem.deleteMany({ where: { dispatchId: { in: dispatchIds } } })
        await tx.stockMovement.deleteMany({ where: { productId: product.id } })
        await tx.serializedAsset.delete({ where: { id: asset.id } })
        await tx.stockBalance.delete({ where: { productId: product.id } })
        await tx.dispatch.deleteMany({ where: { id: { in: dispatchIds } } })
        await tx.orderLine.deleteMany({ where: { orderId: { in: orderIds } } })
        await tx.order.deleteMany({ where: { id: { in: orderIds } } })
        await tx.quotation.deleteMany({ where: { id: { in: quotes } } })
        await tx.siteSurvey.delete({ where: { id: survey.id } })
        await tx.lead.delete({ where: { id: lead.id } })
        await tx.customer.delete({ where: { id: lead.customerId } })
        await tx.solarPackage.delete({ where: { id: pack.id } })
        await tx.product.delete({ where: { id: product.id } })
        await tx.user.delete({ where: { id: user.id } })
      })
    }
  } finally {
    await db.$disconnect()
  }
})
