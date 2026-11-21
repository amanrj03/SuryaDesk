import { randomUUID } from 'node:crypto'
import { ApiError } from '../../utils/ApiError.js'

const include = {
  order: { include: {
    customer: true, orderLinesByOrder: true,
    quotation: { select: { lead: { select: { siteAddress: true } } } },
    invoiceByOrder: { select: { id: true, invoiceNumber: true, status: true } },
  } },
  dispatchItemsByDispatch: { include: { asset: true, product: true } },
}
const missing = entity => new ApiError(404, 'NOT_FOUND', entity + ' not found.')
const invalid = message => new ApiError(409, 'INVALID_TRANSITION', message)
const insufficient = () => new ApiError(409, 'INSUFFICIENT_STOCK', 'Stock is insufficient for this dispatch.')
const unavailable = () => new ApiError(409, 'SERIAL_ALREADY_ALLOCATED', 'A serial is unavailable or belongs to another product.')

async function lockOrder(tx, orderId) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
}

async function lockedDispatch(tx, id) {
  const identity = await tx.dispatch.findUnique({ where: { id }, select: { orderId: true } })
  if (!identity) throw missing('Dispatch')
  await lockOrder(tx, identity.orderId)
  return tx.dispatch.findUnique({ where: { id }, include })
}

async function log(tx, row, action, user) {
  await tx.auditLog.create({ data: {
    actorId: user.id, entityType: 'Dispatch', entityId: row.id, action, summary: { orderId: row.orderId },
  } })
}

function pickList(order) {
  const requirements = new Map()
  for (const row of order.orderLinesByOrder) {
    if (!row.productId || row.lineKind !== 'MATERIAL') continue
    const current = requirements.get(row.productId) ?? 0
    requirements.set(row.productId, current + row.quantity)
  }
  return requirements
}

async function updateStatus(tx, row, status, orderStatus, user, data = {}) {
  await tx.order.update({ where: { id: row.orderId }, data: { status: orderStatus } })
  await log(tx, row, status, user)
  return tx.dispatch.update({ where: { id: row.id }, data: { status, ...data }, include })
}

function quantities(items) {
  const totals = new Map()
  for (const item of items) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity)
  return totals
}

export function dispatchService(db) {
  return {
    async list({ page, limit, status, orderId }) {
      return db.$transaction(async tx => {
        const where = { status, orderId }
        const data = await tx.dispatch.findMany({ where, include, skip: (page - 1) * limit, take: limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
        const total = await tx.dispatch.count({ where })
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },

    async detail(id) {
      const row = await db.dispatch.findUnique({ where: { id }, include })
      if (!row) throw missing('Dispatch')
      return row
    },

    async allocationOptions(id) {
      return db.$transaction(async tx => {
        const row = await tx.dispatch.findUnique({
          where: { id }, select: { status: true, order: { select: { status: true, orderLinesByOrder: true } } },
        })
        if (!row) throw missing('Dispatch')
        if (row.status !== 'DRAFT' || !['CONFIRMED', 'AWAITING_STOCK'].includes(row.order.status)) {
          throw invalid('Only a draft dispatch for an open order can be allocated.')
        }
        const required = pickList(row.order)
        const products = await tx.product.findMany({
          where: { id: { in: [...required.keys()] } },
          select: {
            id: true, name: true, serialized: true,
            stockBalanceByProduct: { select: { onHand: true, reserved: true } },
            _count: { select: { serializedAssetsByProduct: { where: { status: 'IN_STOCK', orderId: null } } } },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        })
        return products.map(product => {
          const balance = product.stockBalanceByProduct
          const available = balance ? balance.onHand - balance.reserved : 0
          return {
            productId: product.id, name: product.name, serialized: product.serialized,
            quantity: required.get(product.id),
            available: product.serialized ? Math.min(available, product._count.serializedAssetsByProduct) : available,
          }
        })
      }, { isolationLevel: 'RepeatableRead' })
    },

    async draft(orderId, { notes }, user) {
      return db.$transaction(async tx => {
        await lockOrder(tx, orderId)
        const order = await tx.order.findUnique({ where: { id: orderId } })
        if (!order) throw missing('Order')
        const existing = await tx.dispatch.findFirst({ where: { orderId, status: { not: 'CANCELLED' } }, include })
        if (existing) return { row: existing, created: false }
        if (!['CONFIRMED', 'AWAITING_STOCK'].includes(order.status)) throw invalid('This order cannot be prepared.')
        const row = await tx.dispatch.create({ data: {
          orderId, notes, status: 'DRAFT', dispatchNumber: 'DSP-' + randomUUID().toUpperCase(), preparedById: user.id,
        }, include })
        await log(tx, row, 'DRAFT', user)
        return { row, created: true }
      })
    },

    async allocate(id, { items }, user) {
      return db.$transaction(async tx => {
        const row = await lockedDispatch(tx, id)
        if (row.status !== 'DRAFT' || !['CONFIRMED', 'AWAITING_STOCK'].includes(row.order.status)) {
          throw invalid('Only a draft dispatch for an open order can be allocated.')
        }
        const required = pickList(row.order)
        if (items.length !== required.size || items.some(item => required.get(item.productId) !== item.quantity)) {
          throw invalid('Allocate the complete order bill of materials.')
        }
        const serials = items.flatMap(item => item.serialNumbers)
        if (new Set(serials).size !== serials.length) throw unavailable()
        for (const item of [...items].sort((a, b) => a.productId.localeCompare(b.productId))) {
          const { productId, quantity, serialNumbers } = item
          const product = await tx.product.findUnique({ where: { id: productId } })
          if (!product) throw missing('Product')
          const serialCount = product.serialized ? quantity : 0
          if (serialNumbers.length !== serialCount) throw invalid('Scan each serialized unit before allocation.')
          const balances = await tx.$executeRaw`
            UPDATE "StockBalance" SET reserved = reserved + ${quantity}, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "productId" = ${productId} AND "onHand" - reserved >= ${quantity}
          `
          if (!balances) throw insufficient()
          if (product.serialized) {
            const assets = await tx.serializedAsset.findMany({
              where: { productId, serialNumber: { in: serialNumbers }, status: 'IN_STOCK', orderId: null },
              select: { id: true },
            })
            if (assets.length !== quantity) throw unavailable()
            const ids = assets.map(asset => asset.id)
            const updated = await tx.serializedAsset.updateMany({
              where: { id: { in: ids }, status: 'IN_STOCK', orderId: null },
              data: { orderId: row.orderId, status: 'RESERVED' },
            })
            if (updated.count !== quantity) throw unavailable()
            await tx.dispatchItem.createMany({ data: ids.map(assetId => ({
              dispatchId: id, productId, assetId, quantity: 1, status: 'ALLOCATED',
            })) })
          } else {
            await tx.dispatchItem.create({ data: { dispatchId: id, productId, quantity, status: 'ALLOCATED' } })
          }
          await tx.stockMovement.create({ data: {
            productId, quantity, type: 'RESERVE', orderId: row.orderId, actorId: user.id, referenceId: id,
          } })
        }
        return updateStatus(tx, row, 'ALLOCATED', 'READY_TO_DISPATCH', user, { preparedById: user.id })
      })
    },

    async dispatch(id, data, user) {
      return db.$transaction(async tx => {
        const row = await lockedDispatch(tx, id)
        if (['DISPATCHED', 'DELIVERED'].includes(row.status)) return row
        if (row.status !== 'ALLOCATED') throw invalid('Allocate stock before dispatching.')
        const total = await tx.payment.aggregate({ where: { orderId: row.orderId, voidedAt: null }, _sum: { amount: true } })
        if (row.order.total.greaterThan(0) && !total._sum.amount?.greaterThan(0)) {
          throw invalid('Record an advance or full payment before dispatching.')
        }
        const dispatchedAt = data.dispatchedAt ?? new Date()
        if (dispatchedAt < row.order.confirmedAt || dispatchedAt > new Date()) throw invalid('Choose a valid dispatch date.')
        for (const [productId, quantity] of [...quantities(row.dispatchItemsByDispatch)].sort(([a], [b]) => a.localeCompare(b))) {
          const balance = await tx.stockBalance.updateMany({
            where: { productId, reserved: { gte: quantity }, onHand: { gte: quantity } },
            data: { reserved: { decrement: quantity }, onHand: { decrement: quantity } },
          })
          if (!balance.count) throw insufficient()
          for (const line of row.order.orderLinesByOrder.filter(item => item.productId === productId && item.lineKind === 'MATERIAL')) {
            await tx.stockMovement.create({ data: {
              productId, quantity: line.quantity, unitCost: line.unitCostSnapshot,
              type: 'DISPATCH', orderId: row.orderId, actorId: user.id, referenceId: id,
            } })
          }
        }
        const ids = row.dispatchItemsByDispatch.flatMap(item => item.assetId ? [item.assetId] : [])
        const assets = await tx.serializedAsset.updateMany({
          where: { id: { in: ids }, status: 'RESERVED', orderId: row.orderId },
          data: { status: 'DISPATCHED', dispatchedAt },
        })
        if (assets.count !== ids.length) throw unavailable()
        await tx.dispatchItem.updateMany({ where: { dispatchId: id }, data: { status: 'DISPATCHED' } })
        return updateStatus(tx, row, 'DISPATCHED', 'DISPATCHED', user, { dispatchedAt })
      })
    },

    async deliver(id, data, user) {
      return db.$transaction(async tx => {
        const row = await lockedDispatch(tx, id)
        if (row.status === 'DELIVERED') return row
        if (row.status !== 'DISPATCHED') throw invalid('Dispatch stock before confirming delivery.')
        const deliveredAt = data.deliveredAt ?? new Date()
        if (deliveredAt < row.dispatchedAt || deliveredAt > new Date()) throw invalid('Choose a valid delivery date.')
        const customerId = row.order.customerId
        for (const item of row.dispatchItemsByDispatch.filter(item => item.assetId)) {
          const updated = await tx.serializedAsset.updateMany({
            where: { id: item.assetId, orderId: row.orderId, status: 'DISPATCHED' },
            data: { status: 'DELIVERED', deliveredAt, customerId },
          })
          if (!updated.count) throw unavailable()
        }
        await tx.dispatchItem.updateMany({ where: { dispatchId: id }, data: { status: 'DELIVERED' } })
        return updateStatus(tx, row, 'DELIVERED', 'DELIVERED', user, { deliveredAt, recipientName: data.recipientName })
      })
    },
  }
}
