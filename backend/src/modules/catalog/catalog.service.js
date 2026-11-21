import { randomUUID } from 'node:crypto'
import { ApiError } from '../../utils/ApiError.js'

const bom = { packageComponentsByPackage: { include: { product: true }, orderBy: { productId: 'asc' } } }
const missing = () => new ApiError(404, 'NOT_FOUND', 'Catalog entry not found.')

async function list(db, model, { page, limit, q, ...filter }, code, include) {
  const search = { contains: q, mode: 'insensitive' }
  const where = { ...filter, ...(q && { OR: [{ [code]: search }, { name: search }] }) }
  const [data, total] = await db.$transaction([
    db[model].findMany({ where, include, skip: (page - 1) * limit, take: limit, orderBy: { [code]: 'asc' } }),
    db[model].count({ where }),
  ], { isolationLevel: 'RepeatableRead' })
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

async function verifyPackage(tx, data, components) {
  const rooftop = ['ON_GRID', 'OFF_GRID'].includes(data.type)
  if (rooftop && data.capacityKw == null) throw new ApiError(400, 'VALIDATION_ERROR', 'Set a system capacity.')
  if (data.type !== 'INSTALLATION' && !components.length) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Include at least one material component.')
  }
  const products = await tx.product.findMany({
    where: { id: { in: components.map(row => row.productId) }, isActive: true },
    select: { id: true, category: true },
  })
  if (products.length !== components.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Use active catalog products.')
  if (data.type === 'OFF_GRID' && !products.some(product => product.category === 'BATTERY')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Off-grid systems require a battery.')
  }
}

export function catalogService(db) {
  return {
    products: query => list(db, 'product', query, 'sku', { stockBalanceByProduct: true }),
    packages: query => list(db, 'solarPackage', query, 'code', { _count: { select: { packageComponentsByPackage: true } } }),
    async packageDetail(id) {
      const row = await db.solarPackage.findUnique({ where: { id }, include: bom })
      if (!row) throw missing()
      return row
    },
    createProduct({ sku = 'SKU-' + randomUUID().toUpperCase(), ...data }) {
      return db.product.create({ data: { ...data, sku, stockBalanceByProduct: { create: { onHand: 0, reserved: 0 } } } })
    },
    updateProduct(id, data) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`
        const product = await tx.product.findUnique({ where: { id } })
        if (!product) throw missing()
        if (data.serialized !== undefined && data.serialized !== product.serialized) {
          const [history, orders] = [
            await tx.stockMovement.count({ where: { productId: id } }),
            await tx.orderLine.count({ where: { productId: id } }),
          ]
          if (history || orders) throw new ApiError(409, 'CONFLICT', 'Stock or order history fixes how this product is tracked.')
        }
        return tx.product.update({ where: { id }, data })
      })
    },
    createPackage({ code = 'PKG-' + randomUUID().toUpperCase(), components, ...data }) {
      return db.$transaction(async tx => {
        await verifyPackage(tx, data, components)
        return tx.solarPackage.create({
          data: { ...data, code, packageComponentsByPackage: { createMany: { data: components } } }, include: bom,
        })
      })
    },
    updatePackage(id, { components, ...data }) {
      return db.$transaction(async tx => {
        const row = await tx.solarPackage.findUnique({ where: { id }, include: bom })
        if (!row) throw missing()
        await verifyPackage(tx, { ...row, ...data }, components ?? row.packageComponentsByPackage)
        const changed = await tx.solarPackage.updateMany({ where: { id, updatedAt: row.updatedAt }, data: { ...data, updatedAt: new Date() } })
        if (!changed.count) throw new ApiError(409, 'CONFLICT', 'Another user updated this package.')
        if (components) {
          await tx.packageComponent.deleteMany({ where: { packageId: id } })
          await tx.packageComponent.createMany({ data: components.map(component => ({ ...component, packageId: id })) })
        }
        return tx.solarPackage.findUnique({ where: { id }, include: bom })
      })
    },
  }
}
