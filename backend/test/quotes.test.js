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
      const quotes = quotesService({ quotation: tx.quotation, auditLog: tx.auditLog, $transaction: callback => callback(tx) })
      const request = { leadId: lead.id, surveyId: survey.id, packageId: pack.id, includeInstallation: false, taxRate: 18 }
      await assert.rejects(quotes.create(request, user), { code: 'SURVEY_NOT_APPROVED' })
      await tx.siteSurvey.update({ where: { id: survey.id }, data: { status: 'APPROVED' } })
      const quote = await quotes.create(request, user)
      assert.equal(quote.total.toFixed(2), '11799.99')
      await quotes.transition(quote.id, 'SENT', {}, user)
      await tx.product.update({ where: { id: product.id }, data: { cost: 4000, name: 'Renamed panel fixture' } })
      const accepted = await quotes.transition(quote.id, 'ACCEPTED', {}, user)
      const material = accepted.quotationLinesByQuotation.find(line => line.lineKind === 'MATERIAL')
      assert.equal(material.unitCostSnapshot.toFixed(2), '2000.50')
      assert.equal(material.descriptionSnapshot, 'Panel fixture')
      assert.equal(accepted.lead.status, 'WON')
      await assert.rejects(quotes.transition(quote.id, 'ACCEPTED', {}, user), { code: 'INVALID_TRANSITION' })
      throw new Error('Rollback quotation fixture')
    }), { message: 'Rollback quotation fixture' })
  } finally {
    await db.$disconnect()
  }
})
