import { randomUUID } from 'node:crypto'
import { ApiError } from '../../utils/ApiError.js'
import { inventoryService } from '../inventory/inventory.service.js'

const include = {
  supplier: true,
  lines: { include: { product: { select: { id: true, name: true, sku: true, serialized: true } } } },
}
const invalid = message => new ApiError(409, 'INVALID_TRANSITION', message)
const missing = () => new ApiError(404, 'NOT_FOUND', 'Purchase order not found.')

async function page(db, key, where, orderBy, query, related) {
  const { limit, page } = query
  return db.$transaction(async tx => {
    const data = await tx[key].findMany({ where, orderBy, include: related, skip: (page - 1) * limit, take: limit })
    const total = await tx[key].count({ where })
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }
  }, { isolationLevel: 'RepeatableRead' })
}

async function lock(tx, id) {
  await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`
  const row = await tx.purchaseOrder.findUnique({ where: { id }, include })
  if (!row) throw missing()
  return row
}

async function audit(tx, row, action, actor, summary = {}) {
  await tx.auditLog.create({ data: {
    actorId: actor.id, entityType: 'PurchaseOrder', entityId: row.id, action,
    summary: { purchaseNumber: row.purchaseNumber, ...summary },
  } })
}

export function procurementService(db) {
  return {
    suppliers(query) {
      const search = { contains: query.q, mode: 'insensitive' }
      const where = query.q ? { OR: [{ code: search }, { name: search }] } : {}
      return page(db, 'supplier', where, [{ name: 'asc' }, { id: 'asc' }], query)
    },
    createSupplier: ({ code = 'SUP-' + randomUUID().toUpperCase(), ...fields }) =>
      db.supplier.create({ data: { ...fields, code } }),
    purchases(query) {
      const search = { contains: query.q, mode: 'insensitive' }
      const where = { status: query.status, ...(query.q && { OR: [
        { purchaseNumber: search }, { supplier: { name: search } },
      ] }) }
      return page(db, 'purchaseOrder', where, [{ createdAt: 'desc' }, { id: 'desc' }], query, include)
    },
    async create({ lines, ...fields }, actor) {
      return db.$transaction(async tx => {
        const supplier = await tx.supplier.findFirst({ where: { id: fields.supplierId, isActive: true } })
        const count = await tx.product.count({ where: { id: { in: lines.map(line => line.productId) }, isActive: true } })
        if (!supplier || count !== lines.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose an active supplier and products.')
        const row = await tx.purchaseOrder.create({ data: {
          ...fields, createdById: actor.id, purchaseNumber: 'PO-' + randomUUID().toUpperCase(),
          lines: { createMany: { data: lines } },
        }, include })
        await audit(tx, row, 'DRAFT', actor)
        return row
      })
    },
    async order(id, actor) {
      return db.$transaction(async tx => {
        const row = await lock(tx, id)
        if (row.status === 'ORDERED') return row
        if (row.status !== 'DRAFT') throw invalid('Only a draft purchase can be ordered.')
        const result = await tx.purchaseOrder.update({ where: { id }, data: { status: 'ORDERED', orderedAt: new Date() }, include })
        await audit(tx, result, 'ORDERED', actor)
        return result
      })
    },
    async receive(id, { productId, quantity, serialNumbers }, actor) {
      return db.$transaction(async tx => {
        const row = await lock(tx, id)
        if (!['ORDERED', 'PARTIALLY_RECEIVED'].includes(row.status)) throw invalid('Order the purchase before receiving stock.')
        const line = row.lines.find(line => line.productId === productId)
        if (!line || line.received + quantity > line.quantity) throw invalid('The receipt exceeds the outstanding purchase quantity.')
        const inventory = inventoryService({ $transaction: callback => callback(tx) })
        const receipt = await inventory.receive({ productId, quantity, serialNumbers, unitCost: line.unitCost, reference: id }, actor)
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { received: { increment: quantity } } })
        const complete = row.lines.every(item => item.received + (item.id === line.id ? quantity : 0) === item.quantity)
        const result = await tx.purchaseOrder.update({
          where: { id }, data: { status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED', receivedAt: complete ? new Date() : undefined }, include,
        })
        await audit(tx, result, result.status, actor, { movementId: receipt.movement.id, productId, quantity })
        return result
      })
    },
  }
}
