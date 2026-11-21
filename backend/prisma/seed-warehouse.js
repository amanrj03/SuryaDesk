import { dispatchService } from '../src/modules/dispatch/dispatch.service.js'

const stock = {
  PANEL: 320, INVERTER: 60, BATTERY: 50, CONTROLLER: 70,
  STAND: 210, WIRING: 160, BOX: 140, SWITCH: 140, EARTH: 140, CONNECTOR: 420,
}
const date = new Date('2026-04-02T04:30:00.000Z')
const day = 86400_000

async function stockIntake(db, actor) {
  await db.$transaction(async tx => {
    for (const [code, target] of Object.entries(stock)) {
      const product = await tx.product.findUniqueOrThrow({ where: { sku: 'DEMO-' + code } })
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${product.id} FOR UPDATE`
      const batchSize = Math.ceil(target / 5)
      for (let offset = 0; offset < target; offset += batchSize) {
        const quantity = Math.min(batchSize, target - offset)
        const referenceId = 'DEMO-RECEIPT-' + code + '-' + offset
        if (await tx.stockMovement.findFirst({ where: { productId: product.id, type: 'RECEIPT', referenceId } })) continue
        if (product.serialized) {
          await tx.serializedAsset.createMany({ data: Array.from({ length: quantity }, (_, i) => ({
            serialNumber: 'SD-' + code + '-' + String(offset + i + 1).padStart(5, '0'),
            productId: product.id, status: 'IN_STOCK', receivedAt: date,
          })) })
        }
        await tx.stockBalance.upsert({ where: { productId: product.id },
          create: { productId: product.id, onHand: quantity, reserved: 0 },
          update: { onHand: { increment: quantity } } })
        await tx.stockMovement.create({ data: {
          type: 'RECEIPT', quantity, productId: product.id, unitCost: product.cost,
          actorId: actor.id, referenceId, createdAt: date,
        } })
      }
    }
  }, { timeout: 20000 })
}

async function ship(db, actor) {
  const rows = await db.order.findMany({
    where: { id: { startsWith: 'DEMO-ORDER-' } }, orderBy: { id: 'asc' }, take: 44,
    include: { dispatchesByOrder: true, customer: true, orderLinesByOrder: { include: { product: true } } },
  })
  const dispatch = dispatchService(db)
  for (const [index, order] of rows.entries()) {
    const row = order.dispatchesByOrder[0]
    if (!row || (row.status === 'DRAFT' && order.status !== 'CONFIRMED')) continue
    if (row.status === 'DRAFT') {
      const items = []
      for (const line of order.orderLinesByOrder) {
        if (line.lineKind !== 'MATERIAL' || !line.product) continue
        const serials = line.product.serialized ? await db.serializedAsset.findMany({
          where: { productId: line.productId, status: 'IN_STOCK', serialNumber: { startsWith: 'SD-' } },
          take: line.quantity, select: { serialNumber: true }, orderBy: { serialNumber: 'asc' },
        }) : []
        const balance = await db.stockBalance.findUniqueOrThrow({ where: { productId: line.productId } })
        if (balance.onHand - balance.reserved < line.quantity || (line.product.serialized && serials.length < line.quantity)) break
        items.push({ productId: line.productId, quantity: line.quantity, serialNumbers: serials.map(asset => asset.serialNumber) })
      }
      if (items.length !== order.orderLinesByOrder.filter(line => line.lineKind === 'MATERIAL' && line.productId).length) continue
      await dispatch.allocate(row.id, { items }, actor)
    }
    const dispatchedAt = new Date(order.confirmedAt.getTime() + 4 * day)
    if (index < 36 && ['ALLOCATED', 'DRAFT'].includes(row.status)) await dispatch.dispatch(row.id, { dispatchedAt }, actor)
    if (index < 24 && ['DISPATCHED', 'ALLOCATED', 'DRAFT'].includes(row.status)) {
      const deliveredAt = new Date(dispatchedAt.getTime() + day)
      await dispatch.deliver(row.id, { recipientName: order.customer.name, deliveredAt }, actor)
    }
  }
}

export async function seedWarehouse(db) {
  const actor = await db.user.findUniqueOrThrow({ where: { email: 'warehouse@demo.suryadesk.test' } })
  await stockIntake(db, actor)
  await ship(db, actor)
}
