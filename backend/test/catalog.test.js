import assert from 'node:assert/strict'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { catalogService } from '../src/modules/catalog/catalog.service.js'
import { product, packageBody } from '../src/modules/catalog/catalog.schema.js'

test('catalog creates stock balances and validates and replaces package components', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  try {
    await assert.rejects(db.$transaction(async tx => {
      const catalog = catalogService({
        product: tx.product, solarPackage: tx.solarPackage,
        $transaction: callback => callback(tx),
      })
      const data = { name: 'Fixture', unit: 'unit', cost: '100', salePrice: '200', serialized: true, warrantyMonths: 24, reorderLevel: 2 }
      const panel = await catalog.createProduct(product.parse({ ...data, category: 'PANEL' }))
      const battery = await catalog.createProduct(product.parse({ ...data, category: 'BATTERY' }))
      assert.match(panel.sku, /^SKU-[0-9A-F-]{36}$/)
      assert.match(battery.sku, /^SKU-[0-9A-F-]{36}$/)
      assert.notEqual(panel.sku, battery.sku)
      assert.equal((await tx.stockBalance.findUnique({ where: { productId: panel.id } })).onHand, 0)
      await tx.stockMovement.create({ data: { productId: panel.id, quantity: 1, type: 'RECEIPT', unitCost: 100 } })
      await assert.rejects(catalog.updateProduct(panel.id, { serialized: false }), { code: 'CONFLICT' })
      const pack = { name: 'Off-grid fixture', type: 'OFF_GRID', capacityKw: 3.17, basePrice: '900' }
      const panels = { productId: panel.id, quantity: 5 }
      const storage = { productId: battery.id, quantity: 1 }
      await assert.rejects(catalog.createPackage({ ...pack, components: [panels] }), { code: 'VALIDATION_ERROR' })
      const row = await catalog.createPackage(packageBody.parse({ ...pack, components: [panels, storage] }))
      assert.match(row.code, /^PKG-[0-9A-F-]{36}$/)
      assert.equal(row.packageComponentsByPackage.length, 2)
      await catalog.updatePackage(row.id, { components: [{ ...panels, quantity: 6 }, storage] })
      const updated = await catalog.packageDetail(row.id)
      assert.equal(updated.code, row.code)
      assert.equal(updated.packageComponentsByPackage.find(item => item.productId === panel.id).quantity, 6)
      throw new Error('Rollback catalog fixture')
    }), { message: 'Rollback catalog fixture' })
  } finally {
    await db.$disconnect()
  }
})
