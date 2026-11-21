import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { inventoryService } from '../src/modules/inventory/inventory.service.js'
import { procurementService } from '../src/modules/procurement/procurement.service.js'
import { supplier as supplierBody } from '../src/modules/procurement/procurement.schema.js'

test('purchase receipts post stock at the agreed cost and cannot exceed an order', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = randomUUID()
  try {
    await assert.rejects(db.$transaction(async tx => {
      const actor = await tx.user.create({ data: {
        name: 'Warehouse fixture', email: key + '@example.invalid', role: 'WAREHOUSE', passwordHash: 'fixture',
      } })
      const item = await tx.product.create({ data: {
        sku: key, name: 'Mounting fixture', category: 'STAND', unit: 'unit',
        cost: 50, salePrice: 100, serialized: false, warrantyMonths: 0, reorderLevel: 0,
      } })
      const service = procurementService({ supplier: tx.supplier, $transaction: callback => callback(tx) })
      const supplier = await service.createSupplier(supplierBody.parse({ name: 'Supplier fixture' }))
      assert.match(supplier.code, /^SUP-[0-9A-F-]{36}$/)
      const purchase = await service.create({
        supplierId: supplier.id, lines: [{ productId: item.id, quantity: 2, unitCost: '52.50' }],
      }, actor)
      const partial = { productId: item.id, quantity: 1, serialNumbers: [] }
      await assert.rejects(service.receive(purchase.id, partial, actor), { code: 'INVALID_TRANSITION' })
      await service.order(purchase.id, actor)
      const first = await service.receive(purchase.id, partial, actor)
      assert.equal(first.status, 'PARTIALLY_RECEIVED')
      await assert.rejects(service.receive(purchase.id, { ...partial, quantity: 2 }, actor), { code: 'INVALID_TRANSITION' })
      assert.equal((await service.receive(purchase.id, partial, actor)).status, 'RECEIVED')
      assert.equal((await tx.stockBalance.findUnique({ where: { productId: item.id } })).onHand, 2)
      const movements = await tx.stockMovement.findMany({ where: { referenceId: purchase.id } })
      assert.equal(movements.length, 2)
      assert.ok(movements.every(row => row.unitCost.toFixed(2) === '52.50'))
      const inventory = inventoryService({ $transaction: callback => callback(tx) })
      await tx.stockBalance.update({ where: { productId: item.id }, data: { reserved: 1 } })
      await assert.rejects(inventory.adjust({ productId: item.id, delta: -2, reason: 'Count' }, actor), { code: 'INSUFFICIENT_STOCK' })
      const adjustment = await inventory.adjust({ productId: item.id, delta: -1, reason: 'Damaged packaging' }, actor)
      assert.equal(adjustment.balance.onHand, 1)
      assert.equal(adjustment.balance.reserved, 1)
      throw new Error('Rollback procurement fixture')
    }), { message: 'Rollback procurement fixture' })
  } finally { await db.$disconnect() }
})
