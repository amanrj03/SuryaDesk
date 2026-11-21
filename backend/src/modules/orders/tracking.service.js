import { createHmac } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { ApiError } from '../../utils/ApiError.js'
import { isCovered } from '../warranties/coverage.js'

const issuer = 'suryadesk'
const audience = 'customer-tracking'
const invalid = () => new ApiError(404, 'TRACKING_UNAVAILABLE', 'This tracking link is invalid or has expired. Ask your team for a new link.')

export function trackingService(db, secret) {
  const key = createHmac('sha256', secret).update(audience).digest()

  return {
    async issue(orderId) {
      const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true } })
      if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.')
      return { token: jwt.sign({}, key, { algorithm: 'HS256', issuer, audience, subject: order.id, expiresIn: '30d' }) }
    },
    async lookup(token) {
      let claims
      try {
        claims = jwt.verify(token, key, { algorithms: ['HS256'], issuer, audience })
      } catch {
        throw invalid()
      }
      const order = await db.order.findUnique({
        where: { id: claims.sub },
        select: {
          orderNumber: true, status: true, confirmedAt: true,
          dispatchesByOrder: {
            select: { dispatchedAt: true, deliveredAt: true },
            where: { status: { in: ['DISPATCHED', 'DELIVERED'] } },
            orderBy: { dispatchedAt: 'desc' }, take: 1,
          },
          installationByOrder: { select: { status: true, scheduledAt: true } },
          warrantiesByOrder: {
            select: { status: true, startAt: true, endAt: true, asset: {
              select: { serialNumber: true, product: { select: { name: true } } },
            } },
            orderBy: { asset: { serialNumber: 'asc' } },
          },
        },
      })
      if (!order) throw invalid()
      const now = new Date()
      const { dispatchesByOrder, installationByOrder, warrantiesByOrder, ...summary } = order
      return {
        ...summary, dispatch: dispatchesByOrder[0] ?? null, installation: installationByOrder,
        warranties: warrantiesByOrder.map(({ asset, status, startAt, endAt }) => ({
          serialNumber: asset.serialNumber, product: asset.product.name, startAt, endAt,
          status: isCovered({ status, startAt, endAt }, now) ? 'ACTIVE'
            : status === 'ACTIVE' ? (endAt <= now ? 'EXPIRED' : 'PENDING') : status,
        })),
      }
    },
  }
}
