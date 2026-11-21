import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { installationsService } from '../src/modules/installations/installations.service.js'
import { dispatchService } from '../src/modules/dispatch/dispatch.service.js'
import { warrantiesService } from '../src/modules/warranties/warranties.service.js'
import { isCovered, warrantyEnd } from '../src/modules/warranties/coverage.js'

test('warranty expiry clamps end-of-month dates in India and excludes the end instant', () => {
  const startAt = new Date('2024-02-29T01:30:00+05:30')
  const endAt = warrantyEnd(startAt, 12)
  assert.equal(endAt.toISOString(), new Date('2025-02-28T01:30:00+05:30').toISOString())
  const warranty = { startAt, endAt, status: 'ACTIVE' }
  assert.equal(isCovered(warranty, startAt), true)
  assert.equal(isCovered(warranty, endAt), false)
})

test('serialized dispatch, warranty activation, and assigned installation sign-off', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = randomUUID().toUpperCase()
  try {
    await assert.rejects(db.$transaction(async tx => {
      const user = await tx.user.create({ data: { name: 'Warehouse fixture', email: key + '@example.invalid', role: 'WAREHOUSE', passwordHash: 'fixture' } })
      const lead = await tx.lead.create({ data: {
        leadNumber: key, source: 'WEB', status: 'WON', subsidyInterest: false,
        customer: { create: { name: 'Dispatch fixture', phone: '+919876543210', address: 'Test residence' } },
      } })
      const survey = await tx.siteSurvey.create({ data: { leadId: lead.id, scheduledAt: new Date(), status: 'APPROVED' } })
      const pack = await tx.solarPackage.create({ data: { code: key, name: 'Dispatch fixture', type: 'PANEL_SET', basePrice: 100 } })
      const product = await tx.product.create({ data: {
        sku: key, name: 'Inverter fixture', category: 'INVERTER', unit: 'unit', cost: 60, salePrice: 100,
        serialized: true, warrantyMonths: 24, reorderLevel: 2,
        stockBalanceByProduct: { create: { onHand: 1, reserved: 0 } },
      } })
      await tx.serializedAsset.create({ data: { productId: product.id, serialNumber: key, status: 'IN_STOCK', receivedAt: new Date() } })
      const amounts = { subtotal: 100, tax: 0, total: 100 }
      const quote = await tx.quotation.create({ data: {
        ...amounts, quoteNumber: key, leadId: lead.id, surveyId: survey.id, packageId: pack.id, createdById: user.id, status: 'ACCEPTED',
      } })
      const order = await tx.order.create({ data: {
        ...amounts, orderNumber: key, quotationId: quote.id, customerId: lead.customerId, status: 'CONFIRMED', confirmedAt: new Date(),
        orderLinesByOrder: { create: {
          productId: product.id, descriptionSnapshot: 'Inverter', quantity: 1, unitCostSnapshot: 60,
          unitPriceSnapshot: 100, lineTotal: 100, lineKind: 'MATERIAL',
        } },
      } })
      const service = dispatchService({ $transaction: callback => callback(tx) })
      const { row } = await service.draft(order.id, {}, user)
      const items = [{ productId: product.id, quantity: 1, serialNumbers: [key] }]
      assert.equal((await service.allocate(row.id, { items }, user)).status, 'ALLOCATED')
      await assert.rejects(service.dispatch(row.id, {}, user), { code: 'INVALID_TRANSITION' })
      await tx.payment.create({ data: { orderId: order.id, amount: 20, method: 'CASH', receivedAt: new Date(), recordedById: user.id } })
      assert.equal((await service.dispatch(row.id, {}, user)).status, 'DISPATCHED')
      await service.dispatch(row.id, {}, user)
      assert.equal(await tx.stockMovement.count({ where: { orderId: order.id, type: 'DISPATCH' } }), 1)
      assert.equal(await tx.warranty.count({ where: { orderId: order.id } }), 0)
      const delivery = await service.deliver(row.id, { recipientName: 'Customer' }, user)
      await service.deliver(row.id, { recipientName: 'Customer' }, user)
      const warranties = await tx.warranty.findMany({ where: { orderId: order.id } })
      assert.equal(warranties.length, 1)
      assert.deepEqual(warranties[0].startAt, delivery.deliveredAt)
      assert.equal(warranties[0].customerId, order.customerId)
      const lookup = await warrantiesService(tx).lookup(key, { asOf: delivery.deliveredAt })
      assert.equal(lookup.coveredAsOf, true)
      assert.equal(lookup.asset.customer.id, order.customerId)
      const expired = await warrantiesService(tx).lookup(key, { asOf: warranties[0].endAt })
      assert.equal(expired.coveredAsOf, false)

      const installer = await tx.user.create({ data: {
        name: 'Assigned technician', email: key + '-tech@example.invalid',
        role: 'TECHNICIAN', passwordHash: 'fixture', hourlyCost: 450,
      } })
      const supervisor = { ...user, capabilities: ['installations:manage'] }
      const technician = { ...installer, capabilities: ['installations:complete_assigned'] }
      const job = await tx.installation.create({ data: {
        orderId: order.id, capacityKw: 3, status: 'UNSCHEDULED', checklist: {},
      } })
      const jobs = installationsService({ $transaction: callback => callback(tx) })
      await jobs.update(job.id, { scheduledAt: new Date(), technicianIds: [installer.id] }, supervisor)
      await assert.rejects(jobs.update(job.id, { startedAt: new Date() }, { ...technician, id: user.id }), { code: 'FORBIDDEN' })
      const now = Date.now()
      await jobs.update(job.id, { startedAt: new Date(now - 60_000) }, technician)
      const proof = {
        finishedAt: new Date(now), capacityKw: 3, generationTestPassed: true,
        checklist: { mounting: true, electrical: true, earthing: true, generation: true },
        signatureAttachmentId: key + '-SIGNATURE', customerSignerName: 'Customer',
      }
      await assert.rejects(jobs.complete(job.id, proof, technician), { code: 'INVALID_TRANSITION' })
      await tx.attachment.createMany({ data: [proof.signatureAttachmentId, key + '-PHOTO'].map(id => ({
        id, ownerType: 'INSTALLATION', ownerId: job.id, originalName: id + '.png',
        storageKey: randomUUID(), mimeType: 'image/png', sizeBytes: 100, uploadedById: installer.id,
      })) })
      const complete = await jobs.complete(job.id, proof, technician)
      assert.equal(complete.order.status, 'COMPLETED')
      assert.equal(complete.customerSignerName, 'Customer')
      await jobs.complete(job.id, proof, technician)
      assert.equal(await tx.workLog.count({ where: { installationId: job.id } }), 1)
      throw new Error('Rollback dispatch fixture')
    }), { message: 'Rollback dispatch fixture' })
  } finally {
    await db.$disconnect()
  }
})
