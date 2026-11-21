import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { ApiError } from '../../utils/ApiError.js'
import { pricingBreakdown } from '../../lib/line-pricing.js'

const include = {
  customer: true, invoiceLinesByInvoice: { orderBy: { id: 'asc' } },
  order: { select: { orderNumber: true, confirmedAt: true } },
  ticket: { select: { ticketNumber: true } },
}
const missing = () => new ApiError(404, 'NOT_FOUND', 'Invoice not found.')
const invalid = message => new ApiError(409, 'INVALID_TRANSITION', message)

function orderLines(rows) {
  const billable = rows.some(row => row.taxAmount != null) ? rows.filter(row => row.taxAmount != null) : rows
  return billable.map(({ descriptionSnapshot, quantity, unitPriceSnapshot, lineTotal, taxRateSnapshot, taxAmount }) => ({
    description: descriptionSnapshot, quantity, unitPrice: unitPriceSnapshot, lineTotal, taxRateSnapshot, taxAmount,
  }))
}
function suppliedLines(rows) {
  return rows.map(({ description, quantity, unitPrice }) => ({
    description, quantity, unitPrice, lineTotal: new Prisma.Decimal(unitPrice).mul(quantity),
  }))
}

function legacyOrderPricing(invoice, lines) {
  if (!lines?.length || lines.some(line => line.taxAmount != null) ||
    invoice.invoiceLinesByInvoice.some(line => line.taxAmount != null)) return null
  const fingerprint = ({ description, quantity, unitPrice, lineTotal }) =>
    JSON.stringify([description, quantity, unitPrice.toFixed(2), lineTotal.toFixed(2)])
  const saved = invoice.invoiceLinesByInvoice.map(fingerprint).sort()
  const origin = orderLines(lines).map(fingerprint).sort()
  if (saved.length !== origin.length || saved.some((line, index) => line !== origin[index])) return null
  const pricing = pricingBreakdown(lines)
  const subtotal = pricing.lines.reduce((sum, line) => sum.plus(line.amount), new Prisma.Decimal(0))
  return pricing.packageName && subtotal.equals(invoice.subtotal) ? pricing : null
}

async function audit(tx, row, action, actorId) {
  await tx.auditLog.create({ data: {
    entityType: 'Invoice', entityId: row.id, action, actorId, summary: { invoiceNumber: row.invoiceNumber },
  } })
}

// The caller holds the order lock so the final payment and invoice commit together.
export async function issuePaidOrderInvoice(tx, orderId, paidAt, actorId) {
  const existing = await tx.invoice.findUnique({ where: { orderId } })
  if (existing?.status === 'PAID' || existing?.status === 'VOID') return
  const issuedAt = new Date()
  if (existing) {
    const draft = existing.status === 'DRAFT'
    const invoice = await tx.invoice.update({ where: { id: existing.id }, data: {
      status: 'PAID', paidAt, ...(draft && { issuedAt, dueAt: null }),
    } })
    if (draft) await audit(tx, invoice, 'ISSUED', actorId)
    return
  }
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { orderLinesByOrder: true } })
  const invoice = await tx.invoice.create({ data: {
    invoiceNumber: 'INV-' + randomUUID().toUpperCase(), orderId, customerId: order.customerId,
    subtotal: order.subtotal, tax: order.tax, total: order.total,
    status: 'PAID', issuedAt, paidAt,
    invoiceLinesByInvoice: { createMany: { data: orderLines(order.orderLinesByOrder) } },
  } })
  await audit(tx, invoice, 'ISSUED', actorId)
}

export function invoiceService(db) {
  return {
    async create({ orderId, ticketId, customerId, dueAt, taxRate, lines: supplied }, user, { forAllocatedOrder = false } = {}) {
      return db.$transaction(async tx => {
        let lines, subtotal, tax
        if (orderId) {
          await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
          const order = await tx.order.findUnique({ where: { id: orderId }, include: { orderLinesByOrder: true, invoiceByOrder: true } })
          if (!order || (!forAllocatedOrder && order.customerId !== customerId) || order.status === 'CANCELLED') {
            throw invalid('Choose a confirmed order for this customer.')
          }
          if (forAllocatedOrder && order.invoiceByOrder && order.invoiceByOrder.status !== 'DRAFT') return order.invoiceByOrder
          throw invalid('Order invoices are issued automatically when full payment is recorded.')
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
      const invoice = await db.invoice.findUnique({ where: { id }, include: {
        ...include,
        order: { select: { ...include.order.select, orderLinesByOrder: { orderBy: { id: 'asc' } } } },
      } })
      if (!invoice) throw missing()
      if (!invoice.order) return invoice
      const { orderLinesByOrder, ...order } = invoice.order
      return { ...invoice, order, pricing: legacyOrderPricing(invoice, orderLinesByOrder) }
    },
    async issue(id, { dueAt }, user) {
      return db.$transaction(async tx => {
        const invoice = await tx.invoice.findUnique({ where: { id } })
        if (!invoice) throw missing()
        if (invoice.status !== 'DRAFT') throw invalid('Only draft invoices can be issued.')
        if (invoice.orderId) throw invalid('Order invoices are issued automatically when full payment is recorded.')
        const now = new Date()
        const due = dueAt ?? invoice.dueAt
        if (due && due < now) throw invalid('Choose a due date on or after issue.')
        const status = invoice.total.isZero() ? 'PAID' : 'ISSUED'
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
