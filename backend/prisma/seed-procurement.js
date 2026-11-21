import { procurementService } from '../src/modules/procurement/procurement.service.js'

const regions = ['Konkan', 'Deccan', 'Malabar', 'Sahyadri', 'Vindhya', 'Marwar', 'Udupi', 'Kutch', 'Godavari', 'Kaveri']
import { day, daysFrom, seedNow } from './seed-clock.js'

export async function seedProcurement(db) {
  const actor = await db.user.findUniqueOrThrow({ where: { email: 'warehouse@demo.suryadesk.test' } })
  const parts = await db.product.findMany({
    where: { sku: { startsWith: 'DEMO-' }, serialized: false, isActive: true }, orderBy: { sku: 'asc' },
  })
  if (!parts.length) return
  const service = procurementService(db)
  const suppliers = []
  for (let index = 0; index < 20; index++) {
    const number = String(index + 1).padStart(2, '0')
    const code = 'DEMO-SUP-' + number
    suppliers.push(await db.supplier.upsert({ where: { code }, update: {}, create: {
      code, name: regions[index % 10] + (index < 10 ? ' Solar Components' : ' Electrical Supply') + ' (Demo)',
      email: 'supplier' + number + '@demo.suryadesk.test', phone: '+9100001000' + number,
    } }))
  }
  const start = daysFrom(seedNow, -67)
  for (let index = 0; index < 60; index++) {
    const purchaseNumber = 'DEMO-PO-' + String(index + 1).padStart(3, '0')
    const part = parts[index % parts.length]
    const createdAt = new Date(start.getTime() + index * day)
    const orderedAt = index < 45 ? new Date(createdAt.getTime() + day) : undefined
    const quantity = 12 + index % 31
    const row = await db.purchaseOrder.upsert({ where: { purchaseNumber }, update: {}, create: {
      purchaseNumber, supplierId: suppliers[index % suppliers.length].id, createdById: actor.id,
      status: index >= 55 ? 'CANCELLED' : orderedAt ? 'ORDERED' : 'DRAFT', createdAt, orderedAt,
      expectedAt: new Date(createdAt.getTime() + 10 * day),
      lines: { create: { productId: part.id, quantity, unitCost: part.cost } },
    } })
    if (row.status === 'ORDERED' && index < 20) await service.receive(row.id, {
      productId: part.id, quantity: index < 15 ? quantity : 4, serialNumbers: [],
    }, actor)
  }
}
