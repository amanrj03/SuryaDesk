import { ApiError } from '../../utils/ApiError.js'
import { isCovered } from './coverage.js'

const customer = { select: { id: true, name: true, phone: true } }
const order = { select: { id: true, orderNumber: true } }
const product = { select: { id: true, name: true, sku: true, warrantyMonths: true } }

export function warrantiesService(db) {
  return {
    async lookup(serialNumber, { asOf = new Date() }) {
      const asset = await db.serializedAsset.findUnique({
        where: { serialNumber }, include: { customer, order, product, warrantyByAsset: true },
      })
      if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Equipment serial not found.')
      if (asset.warrantyByAsset?.status === 'PENDING') asset.warrantyByAsset = null
      return { asset, warranty: asset.warrantyByAsset, coveredAsOf: isCovered(asset.warrantyByAsset, asOf), asOf }
    },
    async list({ page, limit, q, status }) {
      const now = new Date()
      const state = status === 'ACTIVE' ? { status, startAt: { lte: now }, endAt: { gt: now } }
        : status === 'EXPIRED' ? { OR: [{ status }, { status: 'ACTIVE', endAt: { lte: now } }] } : { status }
      const search = q && { OR: [{ asset: { serialNumber: { contains: q, mode: 'insensitive' } } },
        { customer: { name: { contains: q, mode: 'insensitive' } } }] }
      const where = { AND: [{ status: { not: 'PENDING' } }, state, ...(search ? [search] : [])] }
      return db.$transaction(async tx => {
        const rows = await tx.warranty.findMany({
          where, include: { asset: { include: { product } }, customer, order },
          orderBy: [{ endAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit,
        })
        const data = rows.map(warranty => ({ ...warranty, coveredAsOf: isCovered(warranty, now),
          status: warranty.status === 'ACTIVE' && warranty.endAt <= now ? 'EXPIRED' : warranty.status }))
        const total = await tx.warranty.count({ where })
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },
  }
}
