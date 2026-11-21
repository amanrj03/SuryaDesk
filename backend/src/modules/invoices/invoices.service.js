import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { ApiError } from '../../utils/ApiError.js'

const include = { customer: true, invoiceLinesByInvoice: true }
const missing = () => new ApiError(404, 'NOT_FOUND', 'Invoice not found.')
const invalid = message => new ApiError(409, 'INVALID_TRANSITION', message)

function orderLines(rows) {
  return rows.map(({ descriptionSnapshot, quantity, unitPriceSnapshot, lineTotal }) => ({
    description: descriptionSnapshot, quantity, unitPrice: unitPriceSnapshot, lineTotal,
  }))
}
function suppliedLines(rows) {
  return rows.map(({ description, quantity, unitPrice }) => ({
    description, quantity, unitPrice, lineTotal: new Prisma.Decimal(unitPrice).mul(quantity),
  }))
}

async function audit(tx, row, action, actorId) {
  await tx.auditLog.create({ data: {
    entityType: 'Invoice', entityId: row.id, action, actorId, summary: { invoiceNumber: row.invoiceNumber },
  } })
}

export function invoiceService(db) {
  return {
    async create({ orderId, ticketId, customerId, dueAt, taxRate, lines: supplied }, user) {
      return db.$transaction(async tx => {
        let lines, subtotal, tax
        if (orderId) {
          await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
          const order = await tx.order.findUnique({ where: { id: orderId }, include: { orderLinesByOrder: true, invoiceByOrder: true } })
          if (!order || order.customerId !== customerId || order.status === 'CANCELLED') throw invalid('Choose a confirmed order for this customer.')
          if (order.invoiceByOrder) throw invalid('This order already has an invoice.')
          lines = supplied ? suppliedLines(supplied) : orderLines(order.orderLinesByOrder)
          subtotal = order.subtotal
          tax = order.tax
          if (!subtotal.equals(lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)))) {
            throw invalid('Invoice lines must match the order subtotal.')
          }
        } else {
          await tx.$queryRaw`SELECT id FROM "ServiceTicket" WHERE id = ${ticketId} FOR UPDATE`
          const ticket = await tx.serviceTicket.findUnique({ where: { id: ticketId }, include: { invoiceByTicket: true } })
          if (!ticket || ticket.customerId !== customerId || ticket.coverageDecision !== 'NOT_COVERED' ||
            !['RESOLVED_PENDING_CONFIRMATION', 'CLOSED'].includes(ticket.status) || ticket.invoiceByTicket || !supplied?.length) {
            throw invalid('Choose a resolved uncovered ticket without an invoice and supply its lines.')
          }
          lines = suppliedLines(supplied)
          subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0))
          tax = subtotal.mul(taxRate).div(100).toDecimalPlaces(2)
        }
        const row = await tx.invoice.create({ data: {
          invoiceNumber: 'INV-' + randomUUID().toUpperCase(), orderId, ticketId, customerId,
          subtotal, tax, total: subtotal.plus(tax), status: 'DRAFT', issuedAt: new Date(), dueAt,
          invoiceLinesByInvoice: { createMany: { data: lines } },
        }, include })
        await audit(tx, row, 'CREATED', user.id)
        return row
      })
    },
    async list({ page, limit, q, status }) {
      return db.$transaction(async tx => {
        const search = { contains: q, mode: 'insensitive' }
        const where = { status, ...(q && { OR: [{ invoiceNumber: search }, { customer: { name: search } }] }) }
        const data = await tx.invoice.findMany({ where, include: { customer: true }, take: limit,
          skip: (page - 1) * limit, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }] })
        const total = await tx.invoice.count({ where })
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },
    async detail(id) {
      const invoice = await db.invoice.findUnique({ where: { id }, include })
      if (!invoice) throw missing()
      return invoice
    },
    async issue(id, { dueAt }, user) {
      return db.$transaction(async tx => {
        const invoice = await tx.invoice.findUnique({ where: { id } })
        if (!invoice) throw missing()
        if (invoice.status !== 'DRAFT') throw invalid('Only draft invoices can be issued.')
        if (invoice.orderId) await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${invoice.orderId} FOR UPDATE`
        const now = new Date()
        const due = dueAt ?? invoice.dueAt
        if (due && due < now) throw invalid('Choose a due date on or after issue.')
        const payments = invoice.orderId && await tx.payment.aggregate({
          where: { orderId: invoice.orderId, voidedAt: null }, _sum: { amount: true },
        })
        const paid = payments?._sum.amount ?? new Prisma.Decimal(0)
        const status = paid.gte(invoice.total) ? 'PAID' : paid.gt(0) ? 'PARTIALLY_PAID' : 'ISSUED'
        const updated = await tx.invoice.updateMany({
          where: { id, status: 'DRAFT' },
          data: { status, issuedAt: now, dueAt: due, paidAt: status === 'PAID' ? now : null },
        })
        if (!updated.count) throw invalid('This invoice has already been issued.')
        const result = await tx.invoice.findUnique({ where: { id }, include })
        await audit(tx, result, 'ISSUED', user.id)
        return result
      })
    },
  }
}
