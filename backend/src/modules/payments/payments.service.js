import { Prisma } from '@prisma/client'
import { ApiError } from '../../utils/ApiError.js'

const zero = new Prisma.Decimal(0)
const missing = () => new ApiError(404, 'NOT_FOUND', 'Order not found.')

function totals(total, paidTotal) {
  return { total, paidTotal, balance: Prisma.Decimal.max(total.minus(paidTotal), zero) }
}

async function paid(db, where) {
  const result = await db.payment.aggregate({ where: { ...where, voidedAt: null }, _sum: { amount: true } })
  return result._sum.amount ?? zero
}

export function paymentsService(db) {
  return {
    async record(orderId, data, user) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
        const order = await tx.order.findUnique({ where: { id: orderId }, select: { total: true, status: true } })
        if (!order) throw missing()
        if (order.status === 'CANCELLED') throw new ApiError(409, 'INVALID_TRANSITION', 'Cancelled orders cannot receive payments.')

        const amount = new Prisma.Decimal(data.amount)
        const before = await paid(tx, { orderId })
        if (data.reference) {
          const existing = await tx.payment.findFirst({
            where: { orderId, reference: data.reference, method: data.method, voidedAt: null },
          })
          if (existing) {
            if (!existing.amount.equals(amount)) throw new ApiError(409, 'CONFLICT', 'This payment reference already has a different amount.')
            return { payment: existing, ...totals(order.total, before), created: false }
          }
        }
        const after = before.plus(amount)
        if (after.greaterThan(order.total)) {
          throw new ApiError(409, 'PAYMENT_EXCEEDS_BALANCE', 'The payment exceeds the outstanding balance.')
        }
        const receivedAt = data.receivedAt ?? new Date()
        if (receivedAt > new Date()) throw new ApiError(400, 'VALIDATION_ERROR', 'Payment date cannot be in the future.')
        const payment = await tx.payment.create({ data: { ...data, amount, receivedAt, orderId, recordedById: user.id } })
        const settled = after.equals(order.total)
        await tx.invoice.updateMany({
          where: { orderId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
          data: { status: settled ? 'PAID' : 'PARTIALLY_PAID', paidAt: settled ? receivedAt : null },
        })
        await tx.auditLog.create({ data: {
          actorId: user.id, entityType: 'Order', entityId: orderId, action: 'PAYMENT_RECORDED',
          summary: { paymentId: payment.id, amount: amount.toFixed(2) },
        } })
        return { payment, ...totals(order.total, after), created: true }
      })
    },
    async orderPayments(orderId) {
      return db.$transaction(async tx => {
        const order = await tx.order.findUnique({ where: { id: orderId }, select: { total: true } })
        if (!order) throw missing()
        const payments = await tx.payment.findMany({
          where: { orderId }, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        })
        return { payments, ...totals(order.total, await paid(tx, { orderId })) }
      }, { isolationLevel: 'RepeatableRead' })
    },
    async list({ page, limit, orderId, method, from, to }) {
      const where = { orderId, method, receivedAt: { gte: from, lt: to } }
      return db.$transaction(async tx => {
        const data = await tx.payment.findMany({
          where, skip: (page - 1) * limit, take: limit, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        })
        const total = await tx.payment.count({ where })
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit), paidTotal: await paid(tx, where) } }
      }, { isolationLevel: 'RepeatableRead' })
    },
  }
}
