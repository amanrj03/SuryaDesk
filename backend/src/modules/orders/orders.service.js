import { randomUUID } from 'node:crypto'
import { ApiError } from '../../utils/ApiError.js'
import { paymentTotals } from '../payments/payments.service.js'

const related = {
  customer: true,
  quotation: { select: { quoteNumber: true } },
  invoiceByOrder: { select: { id: true, invoiceNumber: true, status: true } },
  dispatchesByOrder: true,
  installationByOrder: true,
}
const detail = { ...related, orderLinesByOrder: true }
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Order not found.')

function snapshot({ productId, descriptionSnapshot, quantity, unitPriceSnapshot, unitCostSnapshot, lineTotal, lineKind }) {
  return { productId, descriptionSnapshot, quantity, unitPriceSnapshot, unitCostSnapshot, lineTotal, lineKind }
}

async function withPaymentTotals(tx, orders) {
  if (!orders.length) return orders
  const payments = await tx.payment.groupBy({
    by: ['orderId'],
    where: { orderId: { in: orders.map(order => order.id) }, voidedAt: null },
    _sum: { amount: true },
  })
  const totalsByOrder = new Map(payments.map(row => [row.orderId, row._sum.amount]))
  return orders.map(order => ({ ...order, ...paymentTotals(order.total, totalsByOrder.get(order.id)) }))
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
      const where = {
        status,
        ...(q && { OR: [{ orderNumber: search }, { quotation: { quoteNumber: search } }, { customer: { name: search } }] }),
      }
      return db.$transaction(async tx => {
        const orders = await tx.order.findMany({
          where, skip: (page - 1) * limit, take: limit, include: related,
          orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
        })
        const total = await tx.order.count({ where })
        const data = await withPaymentTotals(tx, orders)
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },
    async cost(orderId, { incurredAt = new Date(), ...data }, user) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
        const order = await tx.order.findUnique({ where: { id: orderId } })
        if (!order) throw notFound()
        if (order.status === 'CANCELLED' || incurredAt > new Date() || incurredAt < order.confirmedAt) {
          throw new ApiError(409, 'INVALID_TRANSITION', 'Choose a valid cost date within an active job.')
        }
        const cost = await tx.jobCost.create({ data: { ...data, orderId, incurredAt, recordedById: user.id } })
        await tx.auditLog.create({ data: {
          actorId: user.id, entityType: 'Order', entityId: orderId, action: 'JOB_COST_RECORDED',
          summary: { costId: cost.id, category: cost.category, amount: cost.amount.toFixed(2) },
        } })
        return cost
      })
    },
    async detail(id) {
      return db.$transaction(async tx => {
        const order = await tx.order.findUnique({ where: { id }, include: detail })
        if (!order) throw notFound()
        const [data] = await withPaymentTotals(tx, [order])
        return data
      }, { isolationLevel: 'RepeatableRead' })
    },
  }
}
