import { createHmac } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { ApiError } from '../../utils/ApiError.js'
import { isCovered } from '../warranties/coverage.js'

const issuer = 'suryadesk'
const audience = 'customer-tracking'
const invalid = () => new ApiError(404, 'TRACKING_UNAVAILABLE', 'Tracking ID or link not found, or the link has expired.')
const leadReference = /^LEAD-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i

function timeline(lead, survey, quotation, order, dispatch, job) {
  return [
    ['ENQUIRY_RECEIVED', lead.createdAt],
    ['SITE_SURVEYED', survey?.visitedAt],
    ['SURVEY_APPROVED', survey?.approvedAt],
    ['QUOTATION_ISSUED', quotation?.sentAt],
    ['QUOTATION_ACCEPTED', quotation?.acceptedAt],
    ['ORDER_CONFIRMED', order?.confirmedAt],
    ['DISPATCHED', dispatch?.dispatchedAt],
    ['DELIVERED', dispatch?.deliveredAt],
    ['INSTALLATION_IN_PROGRESS', job?.startedAt],
    ['INSTALLATION_COMPLETED', job?.signedAt],
  ].map(([stage, at]) => ({ stage, at: at ?? null }))
}

function warrantyStatus(warranty, now) {
  if (isCovered(warranty, now)) return 'ACTIVE'
  if (warranty.status === 'ACTIVE') return warranty.endAt <= now ? 'EXPIRED' : 'PENDING'
  return warranty.status
}

export function trackingService(db, secret) {
  const key = createHmac('sha256', secret).update(audience).digest()

  return {
    async issue(orderId) {
      const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true } })
      if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found.')
      return { token: jwt.sign({}, key, { algorithm: 'HS256', issuer, audience, subject: order.id, expiresIn: '30d' }) }
    },
    async lookup(token) {
      let ids
      if (leadReference.test(token)) {
        const lead = await db.lead.findUnique({
          where: { leadNumber: token.toUpperCase() },
          select: {
            leadNumber: true, status: true, createdAt: true,
            siteSurveysByLead: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1,
              select: { visitedAt: true, approvedAt: true },
            },
            quotationsByLead: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              select: { sentAt: true, acceptedAt: true, orderByQuotation: { select: { id: true, status: true } } },
            },
          },
        })
        if (!lead) throw invalid()
        const quotes = lead.quotationsByLead
        const latestOrder = quotes.find(quote => quote.orderByQuotation && quote.orderByQuotation.status !== 'CANCELLED')
          ?? quotes.find(quote => quote.orderByQuotation)
        if (!latestOrder) return {
          trackingId: lead.leadNumber, status: lead.status, warranties: [],
          timeline: timeline(lead, lead.siteSurveysByLead[0], quotes.find(quote => quote.sentAt)),
        }
        ids = { id: latestOrder.orderByQuotation.id }
      } else {
        try {
          const claims = jwt.verify(token, key, { algorithms: ['HS256'], issuer, audience })
          ids = { id: claims.sub }
        } catch {
          throw invalid()
        }
      }
      const order = await db.order.findUnique({
        where: ids,
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
        timeline: timeline(quotation.lead, quotation.survey, quotation, order, dispatch, job),
        warranties: (job?.status === 'COMPLETED' && job.signedAt ? warrantiesByOrder : []).map(({ asset, status, startAt, endAt }) => ({
          serialNumber: asset.serialNumber, product: asset.product.name, startAt, endAt,
          status: warrantyStatus({ status, startAt, endAt }, now),
        })),
      }
    },
    async warranties(reference) {
      const select = {
        orderNumber: true, status: true,
        installationByOrder: { select: { status: true, signedAt: true } },
        orderLinesByOrder: {
          where: { productId: { not: null } }, orderBy: { descriptionSnapshot: 'asc' },
          select: { productId: true, descriptionSnapshot: true, quantity: true, product: { select: { warrantyMonths: true } } },
        },
        warrantiesByOrder: {
          orderBy: [{ endAt: 'asc' }, { id: 'asc' }],
          select: { startAt: true, endAt: true, months: true, status: true, asset: { select: { productId: true } } },
        },
      }
      const find = orderNumber => db.order.findUnique({ where: { orderNumber }, select })
      const order = await find(reference) ?? (reference.startsWith('ORD-') ? await find('DEMO-' + reference) : null)
      if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'No order matches that order ID.')
      const { orderNumber, status, installationByOrder: job } = order
      const signedAt = job?.status === 'COMPLETED' ? job.signedAt : null
      if (!signedAt) return { orderNumber, status, signedAt, products: [] }
      const products = new Map()
      for (const line of order.orderLinesByOrder) {
        const product = products.get(line.productId) ?? {
          name: line.descriptionSnapshot, quantity: 0, catalogMonths: line.product.warrantyMonths, coverage: [],
        }
        product.quantity += line.quantity
        products.set(line.productId, product)
      }
      const now = new Date()
      for (const { asset, ...warranty } of order.warrantiesByOrder) {
        products.get(asset.productId)?.coverage.push({ ...warranty, status: warrantyStatus(warranty, now) })
      }
      return { orderNumber, status, signedAt, products: [...products.values()] }
    },
  }
}
