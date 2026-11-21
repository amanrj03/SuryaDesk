import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { inventoryService } from '../src/modules/inventory/inventory.service.js'

test('serialized receipt validates quantities and duplicate serials roll back inventory', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = randomUUID().toUpperCase()
  try {
    const { user, product } = await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { name: 'Warehouse fixture', email: key + '@example.invalid', role: 'WAREHOUSE', passwordHash: 'fixture' } })
      const product = await tx.product.create({ data: {
        sku: key, name: 'Inverter fixture', category: 'INVERTER', unit: 'unit',
        cost: 100, salePrice: 200, serialized: true, warrantyMonths: 24, reorderLevel: 2,
      } })
      return { user, product }
    })
    try {
      const inventory = inventoryService(db)
      const receipt = { productId: product.id, quantity: 1, unitCost: '100.00' }
      await assert.rejects(inventory.receive({ ...receipt, serialNumbers: [] }, user), { code: 'VALIDATION_ERROR' })
      await inventory.receive({ ...receipt, serialNumbers: [key] }, user)
      await assert.rejects(inventory.receive({ ...receipt, serialNumbers: [key] }, user), { code: 'CONFLICT' })
      const stock = await inventory.inventory({ q: key, lowStock: true, page: 1, limit: 20 })
      assert.equal(stock.data[0].available, 1)
      assert.equal(stock.data[0].lowStock, true)
      const assets = await inventory.assets({ productId: product.id, page: 1, limit: 20 })
      assert.equal(assets.meta.total, 1)
      assert.equal(assets.data[0].serialNumber, key)
      assert.equal(await db.stockMovement.count({ where: { productId: product.id } }), 1)
    } finally {
      await db.$transaction(async tx => {
        await tx.auditLog.deleteMany({ where: { entityType: 'Product', entityId: product.id } })
        await tx.stockMovement.deleteMany({ where: { productId: product.id } })
        await tx.serializedAsset.deleteMany({ where: { productId: product.id } })
        await tx.stockBalance.deleteMany({ where: { productId: product.id } })
        await tx.product.delete({ where: { id: product.id } })
        await tx.user.delete({ where: { id: user.id } })
      })
    }
  } finally {
    await db.$disconnect()
  }
})
