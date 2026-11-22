import { paymentTotals } from '../payments/payments.service.js'
import { pricingBreakdown } from '../../lib/line-pricing.js'
import { quotesService } from '../quotes/quotes.service.js'
import { canDownloadInvoice, invoiceService, issuedInvoiceStatuses } from '../invoices/invoices.service.js'
import { ticketsService } from '../tickets/tickets.service.js'
import { ApiError } from '../../utils/ApiError.js'

const missing = () => new ApiError(404, 'NOT_FOUND', 'This record is unavailable.')
const line = { id: true, descriptionSnapshot: true, quantity: true, lineKind: true, lineTotal: true, unitCostSnapshot: true, taxRateSnapshot: true, taxAmount: true }
const packageInfo = { name: true, description: true, capacityKw: true, type: true }
const survey = { id: true, status: true, scheduledAt: true, visitedAt: true, approvedAt: true }
const installation = { status: true, scheduledAt: true, startedAt: true, finishedAt: true, signedAt: true, capacityKw: true, generationReading: true }
const quotation = {
  id: true, quoteNumber: true, status: true, sentAt: true, acceptedAt: true, validUntil: true,
  subtotal: true, tax: true, total: true, package: { select: packageInfo },
  quotationLinesByQuotation: { select: line, orderBy: { id: 'asc' } },
}
const payment = { id: true, amount: true, method: true, reference: true, receivedAt: true }
const invoice = { id: true, invoiceNumber: true, status: true, issuedAt: true, dueAt: true, paidAt: true, subtotal: true, tax: true, total: true,
  invoiceLinesByInvoice: { select: { id: true, description: true, quantity: true, unitPrice: true, lineTotal: true } },
}
const equipment = {
  id: true, serialNumber: true, status: true, product: { select: { name: true } },
  warrantyByAsset: { select: { id: true, status: true, startAt: true, endAt: true, months: true } },
}
const ticket = {
  id: true, ticketNumber: true, status: true, description: true, createdAt: true, updatedAt: true, resolvedAt: true,
  confirmedAt: true, coverageDecision: true, asset: { select: { serialNumber: true, product: { select: { name: true } } } },
}

function customerQuote({ quotationLinesByQuotation, ...quote }) {
  return { ...quote, pricing: pricingBreakdown(quotationLinesByQuotation) }
}

export function ownership(account) {
  const lead = account.historicalAccess
    ? { OR: [{ portalAccountId: account.id }, { customerId: account.customerId, portalAccountId: null }] }
    : { portalAccountId: account.id }
  const order = { quotation: { lead } }
  const service = { OR: [{ order }, ...(account.historicalAccess ? [{ customerId: account.customerId, orderId: null }] : [])] }
  const invoices = { OR: [
    { order },
    { orderId: null, OR: [
      { ticket: service }, ...(account.historicalAccess ? [{ customerId: account.customerId, ticketId: null }] : []),
    ] },
  ] }
  return { lead, order, service, invoices }
}

export function portalService(db) {
  return {
    async records(account) {
      const scope = ownership(account)
      const [requests, orders, invoices, assets, tickets] = await db.$transaction([
        db.lead.findMany({ where: scope.lead, orderBy: { createdAt: 'desc' }, select: {
          id: true, leadNumber: true, status: true, createdAt: true, updatedAt: true, siteAddress: true,
          siteSurveysByLead: { select: survey, orderBy: { scheduledAt: 'desc' } },
          quotationsByLead: { where: { status: { not: 'DRAFT' } }, select: quotation, orderBy: { createdAt: 'desc' } },
        } }),
        db.order.findMany({ where: scope.order, orderBy: { confirmedAt: 'desc' }, select: {
          id: true, orderNumber: true, status: true, confirmedAt: true, updatedAt: true, total: true,
          quotation: { select: { quoteNumber: true, package: { select: packageInfo } } },
          installationByOrder: { select: installation },
          dispatchesByOrder: { where: { dispatchedAt: { not: null } }, select: { dispatchedAt: true, deliveredAt: true }, orderBy: { dispatchedAt: 'desc' }, take: 1 },
          paymentsByOrder: { where: { voidedAt: null }, select: payment, orderBy: { receivedAt: 'desc' } },
        } }),
        db.invoice.findMany({ where: { ...scope.invoices, status: { in: issuedInvoiceStatuses } },
          select: { ...invoice, orderId: true, ticketId: true }, orderBy: { issuedAt: 'desc' } }),
        db.serializedAsset.findMany({ where: { order: { ...scope.order, installationByOrder: { status: 'COMPLETED', signedAt: { not: null } } },
          status: { in: ['INSTALLED', 'REPLACED'] } }, select: equipment, orderBy: { serialNumber: 'asc' } }),
        db.serviceTicket.findMany({ where: scope.service, select: ticket, orderBy: { updatedAt: 'desc' } }),
      ], { isolationLevel: 'RepeatableRead' })
      const photos = await db.attachment.findMany({
        where: { ownerType: 'TICKET', ownerId: { in: tickets.map(row => row.id) }, uploadedById: null },
        select: { id: true, originalName: true, ownerId: true },
      })
      const orderBalances = orders.map(row => ({
        ...row, ...paymentTotals(row.total, row.paymentsByOrder.reduce((sum, item) => sum.plus(item.amount), row.total.minus(row.total))),
      }))
      const ordersById = new Map(orderBalances.map(row => [row.id, row]))
      const visibleInvoices = invoices.filter(row => {
        const order = ordersById.get(row.orderId)
        return (!row.orderId || order) && canDownloadInvoice(row, order, order?.paidTotal)
      })
      const serviceInvoices = new Map(visibleInvoices.filter(row => row.ticketId).map(row => [row.ticketId, row]))
      return {
        requests: requests.map(row => ({ ...row, quotationsByLead: row.quotationsByLead.map(customerQuote) })),
        orders: orderBalances,
        invoices: visibleInvoices,
        assets, tickets: tickets.map(row => ({
          ...row, invoice: serviceInvoices.get(row.id) ?? null,
          photos: photos.filter(photo => photo.ownerId === row.id),
        })),
      }
    },
    async quote(account, id) {
      const row = await db.quotation.findFirst({
        where: { id, status: { not: 'DRAFT' }, lead: ownership(account).lead }, select: quotation,
      })
      if (!row) throw missing()
      return customerQuote(row)
    },
    async decide(account, id, status) {
      const row = await this.quote(account, id)
      if (row.status !== 'SENT' && !(row.status === 'ACCEPTED' && status === 'ACCEPTED')) {
        throw new ApiError(409, 'INVALID_TRANSITION', 'Only an issued quotation can be accepted or declined.')
      }
      await quotesService(db).transition(id, status, {}, { customerAccountId: account.id })
      return { id, status }
    },
    async invoice(account, id) {
      const row = await invoiceService(db).download(id, ownership(account).invoices)
      return account.historicalAccess ? row : { ...row, customer: { name: account.name, address: account.address } }
    },
    async payment(account, id) {
      const row = await db.payment.findFirst({
        where: { id, voidedAt: null, order: ownership(account).order },
        select: { ...payment, order: { select: {
          orderNumber: true, total: true, paymentsByOrder: { where: { voidedAt: null }, select: { amount: true } },
        } } },
      })
      if (!row) throw missing()
      const { paymentsByOrder, ...order } = row.order
      const totalPaid = paymentsByOrder.reduce((sum, item) => sum.plus(item.amount), order.total.minus(order.total))
      return { ...row, order, ...paymentTotals(order.total, totalPaid) }
    },
    async warranty(account, id) {
      const row = await db.serializedAsset.findFirst({
        where: { id, order: { ...ownership(account).order, installationByOrder: { status: 'COMPLETED', signedAt: { not: null } } } },
        select: equipment,
      })
      if (!row?.warrantyByAsset || row.warrantyByAsset.status === 'PENDING') throw missing()
      return row
    },
    async createTicket(account, { assetId, description }) {
      const asset = await db.serializedAsset.findFirst({
        where: { id: assetId, status: 'INSTALLED', order: { ...ownership(account).order, status: 'COMPLETED' } },
        select: { id: true, customerId: true, orderId: true },
      })
      if (!asset) throw missing()
      const result = await ticketsService(db).create({
        assetId, description, priority: 'MEDIUM', customerId: asset.customerId, orderId: asset.orderId,
      }, { customerAccountId: account.id })
      return { id: result.id, ticketNumber: result.ticketNumber, status: result.status }
    },
    async authorizeTicket(account, id, write) {
      const row = await db.serviceTicket.findFirst({
        where: { id, ...ownership(account).service }, select: { id: true, status: true },
      })
      if (!row) throw missing()
      if (write && row.status === 'CLOSED') throw new ApiError(409, 'INVALID_TRANSITION', 'This request is closed.')
    },
    async confirmTicket(account, id) {
      await this.authorizeTicket(account, id, false)
      const result = await ticketsService(db).confirm(id, { customerConfirmationName: account.name }, {
        capabilities: [], customerAccountId: account.id,
      })
      return { id, status: result.status, confirmedAt: result.confirmedAt }
    },
  }
}
