import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { quotesService } from '../src/modules/quotes/quotes.service.js'

test('approved surveys produce immutable quotation prices and material costs', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = randomUUID()
  try {
    await assert.rejects(db.$transaction(async tx => {
      const user = await tx.user.create({ data: { name: 'Sales fixture', email: key + '@example.invalid', role: 'SALES', passwordHash: 'fixture' } })
      const lead = await tx.lead.create({ data: {
        leadNumber: key, source: 'PHONE', status: 'SURVEY_APPROVED', subsidyInterest: false,
        customer: { create: { name: 'Quote fixture', address: 'Test residence', phone: '+919876543210' } },
      } })
      const survey = await tx.siteSurvey.create({ data: { leadId: lead.id, scheduledAt: new Date(), status: 'SUBMITTED' } })
      const product = await tx.product.create({ data: {
        sku: key, name: 'Panel fixture', category: 'PANEL', unit: 'unit',
        cost: '2000.50', salePrice: 3000, serialized: true, warrantyMonths: 240, reorderLevel: 0,
      } })
      const pack = await tx.solarPackage.create({ data: {
        code: key, name: 'Panel set fixture', type: 'PANEL_SET', basePrice: '9999.99',
        packageComponentsByPackage: { create: { productId: product.id, quantity: 2 } },
      } })
      const wire = await tx.product.create({ data: {
        sku: key + '-wire', name: 'Wiring fixture', category: 'WIRING', unit: 'unit',
        cost: '750.25', salePrice: 1000, taxRate: 18, serialized: false, warrantyMonths: 0, reorderLevel: 0,
      } })
      await tx.packageComponent.create({ data: { packageId: pack.id, productId: wire.id, quantity: 3 } })
      const quotes = quotesService({ quotation: tx.quotation, auditLog: tx.auditLog, $transaction: callback => callback(tx) })
      const request = { leadId: lead.id, surveyId: survey.id, packageId: pack.id, includeInstallation: false }
      await assert.rejects(quotes.create(request, user), { code: 'SURVEY_NOT_APPROVED' })
      await tx.siteSurvey.update({ where: { id: survey.id }, data: { status: 'APPROVED' } })
      await assert.rejects(quotes.create(request, user), { code: 'TAX_RATE_REQUIRED' })
      await tx.product.update({ where: { id: product.id }, data: { taxRate: 5 } })
      const quote = await quotes.create(request, user)
      assert.equal(quote.tax.toFixed(2), '933.33')
      assert.equal(quote.total.toFixed(2), '10933.32')
      await quotes.transition(quote.id, 'SENT', {}, user)
      await tx.product.update({ where: { id: product.id }, data: { cost: 4000, taxRate: 12, name: 'Renamed panel fixture' } })
      const accepted = await quotes.transition(quote.id, 'ACCEPTED', {}, user)
      const material = accepted.quotationLinesByQuotation.find(line => line.productId === product.id)
      assert.equal(material.unitCostSnapshot.toFixed(2), '2000.50')
      assert.equal(material.taxRateSnapshot.toFixed(2), '5.00')
      assert.equal(material.taxAmount.toFixed(2), '333.33')
      assert.equal(material.descriptionSnapshot, 'Panel fixture')
      assert.equal(accepted.lead.status, 'WON')
      const detail = await quotes.detail(quote.id)
      assert.equal(detail.pricing.packageName, pack.name)
      assert.equal(detail.pricing.lines.length, 2)
      assert.ok(detail.pricing.lines.every(line => line.amount.greaterThan(0)))
      assert.equal(detail.pricing.lines.reduce((sum, line) => sum.plus(line.amount), quote.subtotal.minus(quote.subtotal))
        .toFixed(2), '9999.99')
      await assert.rejects(quotes.transition(quote.id, 'ACCEPTED', {}, user), { code: 'INVALID_TRANSITION' })
      throw new Error('Rollback quotation fixture')
    }), { message: 'Rollback quotation fixture' })
  } finally {
    await db.$disconnect()
  }
})
