import { Prisma } from '@prisma/client'
import { ApiError } from '../../utils/ApiError.js'

const select = {
  id: true, sku: true, name: true, category: true, unit: true,
  serialized: true, reorderLevel: true, cost: true,
  stockBalanceByProduct: { select: { onHand: true, reserved: true } },
}

function stock(row) {
  const { stockBalanceByProduct, ...product } = row
  const { onHand = 0, reserved = 0 } = stockBalanceByProduct ?? {}
  const available = onHand - reserved
  return { ...product, onHand, reserved, available, lowStock: available <= product.reorderLevel }
}

function result(data, total, page, limit) {
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export function inventoryService(db) {
  return {
    async inventory({ page, limit, q, lowStock }) {
      return db.$transaction(async tx => {
        const search = { contains: q, mode: 'insensitive' }
        const where = { isActive: true, ...(q && { OR: [{ name: search }, { sku: search }] }) }
        if (lowStock) {
          const rows = await tx.$queryRaw`
            SELECT p.id FROM "Product" p
            LEFT JOIN "StockBalance" b ON b."productId" = p.id
            WHERE p."isActive" AND COALESCE(b."onHand" - b.reserved, 0) <= p."reorderLevel"
          `
          where.id = { in: rows.map(row => row.id) }
        }
        const data = await tx.product.findMany({
          where, select, skip: (page - 1) * limit, take: limit, orderBy: { sku: 'asc' },
        })
        return result(data.map(stock), await tx.product.count({ where }), page, limit)
      }, { isolationLevel: 'RepeatableRead' })
    },

    async assets({ page, limit, q, productId, status, unassigned, serialNumber }) {
      return db.$transaction(async tx => {
        const where = {
          productId, status, ...(unassigned && { orderId: null }),
          serialNumber: serialNumber ?? (q ? { contains: q, mode: 'insensitive' } : undefined),
        }
        const data = await tx.serializedAsset.findMany({
          where, skip: (page - 1) * limit, take: limit, orderBy: { serialNumber: 'asc' },
          include: { product: { select: { id: true, name: true, sku: true } }, customer: { select: { id: true, name: true } }, order: { select: { id: true, orderNumber: true } } },
        })
        return result(data, await tx.serializedAsset.count({ where }), page, limit)
      }, { isolationLevel: 'RepeatableRead' })
    },


    async adjust({ productId, delta, reason }, user) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`
        const product = await tx.product.findUnique({ where: { id: productId } })
        if (!product?.isActive) throw new ApiError(404, 'NOT_FOUND', 'Active product not found.')
        if (product.serialized) {
          throw new ApiError(400, 'VALIDATION_ERROR', 'Serial-tracked stock requires a receipt, dispatch, or replacement.')
        }
        await tx.stockBalance.upsert({
          where: { productId }, create: { productId, reserved: 0, onHand: 0 }, update: {},
        })
        const changed = await tx.$executeRaw`
          UPDATE "StockBalance" SET "onHand" = "onHand" + ${delta}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "productId" = ${productId} AND "onHand" + ${delta} >= reserved
        `
        if (!changed) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'The correction would consume reserved stock.')
        const movement = await tx.stockMovement.create({ data: {
          productId, quantity: delta, type: 'ADJUSTMENT', reason, actorId: user.id, unitCost: product.cost,
        } })
        await tx.auditLog.create({ data: {
          actorId: user.id, entityType: 'Product', entityId: productId, action: 'STOCK_ADJUSTED',
          summary: { movementId: movement.id, delta, reason },
        } })
        const balance = await tx.stockBalance.findUnique({ where: { productId } })
        return { movement, balance }
      })
    },

    async receive({ productId, quantity, unitCost, serialNumbers, reference }, user) {
      try {
        return await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`
          const product = await tx.product.findUnique({ where: { id: productId } })
          if (!product?.isActive) throw new ApiError(404, 'NOT_FOUND', 'Active product not found.')
          if (serialNumbers.length !== (product.serialized ? quantity : 0)) {
            throw new ApiError(400, 'VALIDATION_ERROR', product.serialized
              ? 'Provide one unique serial number for each unit.' : 'This product uses quantity tracking.')
          }
          if (serialNumbers.length) {
            const receivedAt = new Date()
            await tx.serializedAsset.createMany({
              data: serialNumbers.map(serialNumber => ({ productId, serialNumber, receivedAt, status: 'IN_STOCK' })),
            })
          }
          const balance = await tx.stockBalance.upsert({
            where: { productId }, create: { productId, onHand: quantity, reserved: 0 },
            update: { onHand: { increment: quantity } },
          })
          const movement = await tx.stockMovement.create({
            data: { productId, quantity, unitCost, type: 'RECEIPT', actorId: user.id, referenceId: reference },
          })
          await tx.auditLog.create({ data: {
            actorId: user.id, entityType: 'Product', entityId: productId, action: 'STOCK_RECEIVED',
            summary: { movementId: movement.id, quantity },
          } })
          return { movement, balance, serialCount: serialNumbers.length }
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ApiError(409, 'CONFLICT', 'A supplied serial number already exists.')
        }
        throw error
      }
    },
  }
}
