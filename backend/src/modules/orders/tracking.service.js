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
          quotation: { select: {
            sentAt: true, acceptedAt: true,
            lead: { select: { createdAt: true } },
            survey: { select: { visitedAt: true, approvedAt: true } },
          } },
          dispatchesByOrder: {
            select: { dispatchedAt: true, deliveredAt: true },
            where: { status: { in: ['DISPATCHED', 'DELIVERED'] } },
            orderBy: { dispatchedAt: 'desc' }, take: 1,
          },
          installationByOrder: { select: { status: true, scheduledAt: true, startedAt: true, signedAt: true } },
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
      const { quotation, dispatchesByOrder, installationByOrder, warrantiesByOrder, ...summary } = order
      const dispatch = dispatchesByOrder[0] ?? null
      const job = installationByOrder
      return {
        ...summary, dispatch, installation: job ? { status: job.status, scheduledAt: job.scheduledAt } : null,
        timeline: [
          { stage: 'ENQUIRY_RECEIVED', at: quotation.lead.createdAt },
          { stage: 'SITE_SURVEYED', at: quotation.survey.visitedAt },
          { stage: 'SURVEY_APPROVED', at: quotation.survey.approvedAt },
          { stage: 'QUOTATION_ISSUED', at: quotation.sentAt },
          { stage: 'QUOTATION_ACCEPTED', at: quotation.acceptedAt },
          { stage: 'ORDER_CONFIRMED', at: order.confirmedAt },
          { stage: 'DISPATCHED', at: dispatch?.dispatchedAt ?? null },
          { stage: 'DELIVERED', at: dispatch?.deliveredAt ?? null },
          { stage: 'INSTALLATION_IN_PROGRESS', at: job?.startedAt ?? null },
          { stage: 'INSTALLATION_COMPLETED', at: job?.signedAt ?? null },
        ],
        warranties: warrantiesByOrder.map(({ asset, status, startAt, endAt }) => ({
          serialNumber: asset.serialNumber, product: asset.product.name, startAt, endAt,
          status: isCovered({ status, startAt, endAt }, now) ? 'ACTIVE'
            : status === 'ACTIVE' ? (endAt <= now ? 'EXPIRED' : 'PENDING') : status,
        })),
      }
    },
  }
}
