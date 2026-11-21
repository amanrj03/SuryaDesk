import { randomUUID } from 'node:crypto'
import { ApiError } from '../../utils/ApiError.js'

const related = { customer: true, dispatchesByOrder: true, installationByOrder: true }
const detail = { ...related, orderLinesByOrder: true }
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Order not found.')

function snapshot({ productId, descriptionSnapshot, quantity, unitPriceSnapshot, unitCostSnapshot, lineTotal, lineKind }) {
  return { productId, descriptionSnapshot, quantity, unitPriceSnapshot, unitCostSnapshot, lineTotal, lineKind }
}

export function ordersService(db) {
  return {
    async convert(quotationId, { notes }, user) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Quotation" WHERE id = ${quotationId} FOR UPDATE`
        const quote = await tx.quotation.findUnique({
          where: { id: quotationId },
          include: { lead: true, package: true, quotationLinesByQuotation: true, orderByQuotation: { include: detail } },
        })
        if (!quote) throw new ApiError(404, 'NOT_FOUND', 'Quotation not found.')
        if (quote.orderByQuotation) return { order: quote.orderByQuotation, created: false }
        if (quote.status !== 'ACCEPTED') throw new ApiError(409, 'INVALID_TRANSITION', 'Accept the quotation before creating an order.')
        const order = await tx.order.create({
          data: {
            quotationId, status: 'CONFIRMED', confirmedAt: new Date(), notes,
            orderNumber: 'ORD-' + randomUUID().toUpperCase(), customerId: quote.lead.customerId,
            subtotal: quote.subtotal, tax: quote.tax, total: quote.total,
            orderLinesByOrder: { createMany: { data: quote.quotationLinesByQuotation.map(snapshot) } },
            dispatchesByOrder: { create: { dispatchNumber: 'DSP-' + randomUUID().toUpperCase(), status: 'DRAFT' } },
            installationByOrder: { create: {
              status: 'UNSCHEDULED', capacityKw: quote.package.capacityKw ?? quote.lead.desiredKw ?? 0, checklist: {},
            } },
          },
          include: detail,
        })
        await tx.auditLog.create({ data: {
          actorId: user.id, entityType: 'Order', entityId: order.id, action: 'CONFIRMED', summary: { quotationId },
        } })
        return { order, created: true }
      })
    },
    async list({ page, limit, q, status }) {
      const search = { contains: q, mode: 'insensitive' }
      const where = { status, ...(q && { OR: [{ orderNumber: search }, { customer: { name: search } }] }) }
      const [data, total] = await db.$transaction([
        db.order.findMany({
          where, skip: (page - 1) * limit, take: limit, include: related,
          orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
        }),
        db.order.count({ where }),
      ], { isolationLevel: 'RepeatableRead' })
      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    },
    async detail(id) {
      const order = await db.order.findUnique({ where: { id }, include: detail })
      if (!order) throw notFound()
      return order
    },
  }
}
