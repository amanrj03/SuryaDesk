import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { roleCapabilities } from '../../config/permissions.js'
import { ApiError } from '../../utils/ApiError.js'
import { isCovered } from '../warranties/coverage.js'

const include = {
  customer: true, asset: { include: { product: true, warrantyByAsset: true } },
  ticketPartsByTicket: { include: { product: true } }, invoiceByTicket: true,
  assignedTo: { select: { id: true, name: true } },
}
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Ticket not found.')
const invalid = message => new ApiError(409, 'INVALID_TRANSITION', message)
const validation = message => new ApiError(400, 'VALIDATION_ERROR', message)
const limited = user => user.capabilities.includes('installations:complete_assigned') && !user.capabilities.includes('tickets:resolve')
const scope = user => limited(user) ? { assignedToId: user.id } : {}
const open = ['OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS']

async function locked(tx, id, user) {
  await tx.$queryRaw`SELECT id FROM "ServiceTicket" WHERE id = ${id} FOR UPDATE`
  const ticket = await tx.serviceTicket.findFirst({ where: { id, ...scope(user) }, include })
  if (!ticket) throw notFound()
  return ticket
}

async function audit(tx, id, action, actorId, summary = {}) {
  await tx.auditLog.create({ data: { actorId, entityType: 'ServiceTicket', entityId: id, action, summary } })
}

function billingLines(ticket) {
  const lines = ticket.ticketPartsByTicket.map(part => ({
    description: part.product.name, quantity: part.quantity,
    unitPrice: part.chargeSnapshot, lineTotal: part.chargeSnapshot.mul(part.quantity),
  }))
  if (ticket.laborCharge.greaterThan(0)) lines.push({
    description: 'Service labour', quantity: 1, unitPrice: ticket.laborCharge, lineTotal: ticket.laborCharge,
  })
  return lines
}

export function ticketsService(db) {
  return {
    async create({ customerId, orderId, assetId, incidentAt = new Date(), ...data }, user) {
      return db.$transaction(async tx => {
        if (incidentAt > new Date()) throw validation('The incident date cannot be in the future.')
        if (!await tx.customer.findUnique({ where: { id: customerId } })) throw validation('Select an existing customer.')
        const asset = assetId ? await tx.serializedAsset.findUnique({ where: { id: assetId }, include: { warrantyByAsset: true } }) : null
        if (assetId && (!asset || asset.customerId !== customerId || (orderId && orderId !== asset.orderId))) {
          throw validation('The selected serial must belong to this customer and order.')
        }
        const linkedOrder = orderId ?? asset?.orderId
        if (linkedOrder && !await tx.order.findFirst({ where: { id: linkedOrder, customerId } })) {
          throw validation('The selected order must belong to this customer.')
        }
        const covered = isCovered(asset?.warrantyByAsset, incidentAt)
        const ticket = await tx.serviceTicket.create({ data: {
          ...data, customerId, assetId, orderId: linkedOrder, incidentAt, status: 'OPEN', laborCharge: 0,
          ticketNumber: 'TKT-' + randomUUID().toUpperCase(),
          coverageDecision: asset ? covered ? 'COVERED' : 'NOT_COVERED' : 'PENDING',
          coverageReason: asset ? covered ? 'Serial covered at incident time.' : 'No coverage for this serial at incident time.' : undefined,
        }, include })
        await audit(tx, ticket.id, 'OPENED', user.id, { coverageDecision: ticket.coverageDecision })
        return ticket
      })
    },
    async list({ page, limit, q, status, priority }, user) {
      return db.$transaction(async tx => {
        const search = { contains: q, mode: 'insensitive' }
        const where = { ...scope(user), status, priority, ...(q && { OR: [
          { ticketNumber: search }, { customer: { name: search } }, { customer: { phone: search } }, { asset: { serialNumber: search } },
        ] }) }
        const data = await tx.serviceTicket.findMany({
          where, include, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })
        const total = await tx.serviceTicket.count({ where })
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },
    async detail(id, user) {
      const ticket = await db.serviceTicket.findFirst({ where: { id, ...scope(user) }, include })
      if (!ticket) throw notFound()
      const timeline = await db.auditLog.findMany({
        where: { entityId: id, entityType: 'ServiceTicket' }, orderBy: { createdAt: 'asc' },
        select: { action: true, createdAt: true, summary: true },
      })
      return { ...ticket, timeline }
    },
    async update(id, data, user) {
      return db.$transaction(async tx => {
        const ticket = await locked(tx, id, user)
        if (!open.includes(ticket.status)) throw invalid('Resolved tickets cannot be edited.')
        if (limited(user) && (data.assignedToId || data.priority || data.laborCharge !== undefined ||
          (data.status && data.status !== 'IN_PROGRESS'))) throw new ApiError(403, 'FORBIDDEN', 'Only support can assign work or set charges.')
        if (data.assignedToId) {
          const worker = await tx.user.findUnique({ where: { id: data.assignedToId } })
          if (!worker?.isActive || !roleCapabilities[worker.role]?.includes('installations:complete_assigned')) {
            throw validation('Select an active technician.')
          }
        }
        const status = data.status ?? (data.assignedToId && ['OPEN', 'TRIAGED'].includes(ticket.status) ? 'ASSIGNED' : ticket.status)
        if (open.indexOf(status) < open.indexOf(ticket.status) ||
          (['ASSIGNED', 'IN_PROGRESS'].includes(status) && !data.assignedToId && !ticket.assignedToId)) {
          throw invalid('Assign the ticket before starting work.')
        }
        await audit(tx, id, 'UPDATED', user.id, { to: status })
        return tx.serviceTicket.update({ where: { id }, data: { ...data, status }, include })
      })
    },
    async part(id, { productId, quantity, chargePerUnit }, user) {
      return db.$transaction(async tx => {
        const ticket = await locked(tx, id, user)
        if (!open.includes(ticket.status)) throw invalid('Parts can only be added to open tickets.')
        const product = await tx.product.findUnique({ where: { id: productId } })
        if (!product?.isActive || product.serialized) throw validation('Choose an active quantity-tracked repair part.')
        const changed = await tx.$executeRaw`
          UPDATE "StockBalance" SET "onHand" = "onHand" - ${quantity}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "productId" = ${productId} AND "onHand" - reserved >= ${quantity}
        `
        if (!changed) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Not enough unreserved stock for this repair.')
        const part = await tx.ticketPart.create({
          data: { ticketId: id, productId, quantity, costSnapshot: product.cost, chargeSnapshot: chargePerUnit },
        })
        await tx.stockMovement.create({ data: {
          productId, orderId: ticket.orderId, type: 'ADJUSTMENT', quantity: -quantity, unitCost: product.cost,
          actorId: user.id, referenceId: part.id, reason: 'Service repair part',
        } })
        await audit(tx, id, 'PART_USED', user.id, { partId: part.id })
        return part
      })
    },
    async replace(id, { serialNumber, chargePerUnit }, user) {
      return db.$transaction(async tx => {
        const ticket = await locked(tx, id, user)
        if (!open.includes(ticket.status) || !ticket.asset || !ticket.orderId) throw invalid('Select an open ticket with delivered equipment.')
        if (ticket.ticketPartsByTicket.some(part => part.replacementAssetId)) throw invalid('This ticket already has a replacement.')
        const original = ticket.asset
        if (!['DELIVERED', 'INSTALLED', 'UNDER_REPAIR'].includes(original.status)) {
          throw invalid('Only active delivered equipment can be replaced.')
        }
        const replacement = await tx.serializedAsset.findUnique({ where: { serialNumber }, include: { product: true } })
        if (!replacement || replacement.productId !== original.productId || replacement.status !== 'IN_STOCK' || replacement.orderId) {
          throw invalid('Select an available replacement serial of the same equipment.')
        }
        const stock = await tx.$executeRaw`
          UPDATE "StockBalance" SET "onHand" = "onHand" - 1, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "productId" = ${original.productId} AND "onHand" > reserved
        `
        if (!stock) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'No unreserved replacement is available.')
        const now = new Date()
        const changed = await tx.serializedAsset.updateMany({
          where: { id: replacement.id, status: 'IN_STOCK', orderId: null },
          data: { orderId: ticket.orderId, customerId: ticket.customerId, replacedAssetId: original.id,
            status: 'INSTALLED', dispatchedAt: now, deliveredAt: now },
        })
        const retired = await tx.serializedAsset.updateMany({
          where: { id: original.id, status: original.status },
          data: { status: 'REPLACED' },
        })
        if (!changed.count || !retired.count) throw invalid('A serial changed during replacement.')
        const originalWarranty = original.warrantyByAsset
        const covered = isCovered(originalWarranty, ticket.incidentAt)
        if (originalWarranty) {
          await tx.warranty.update({ where: { id: originalWarranty.id }, data: { status: 'REPLACED' } })
          if (covered && originalWarranty.endAt > now) {
            await tx.warranty.create({ data: {
              assetId: replacement.id, orderId: ticket.orderId, customerId: ticket.customerId,
              originalWarrantyId: originalWarranty.id, startAt: now, endAt: originalWarranty.endAt,
              months: originalWarranty.months, status: 'ACTIVE',
            } })
          }
        }
        const part = await tx.ticketPart.create({ data: {
          ticketId: id, productId: replacement.productId, quantity: 1, costSnapshot: replacement.product.cost,
          chargeSnapshot: covered ? 0 : chargePerUnit, replacementAssetId: replacement.id,
        } })
        await tx.stockMovement.create({ data: {
          productId: replacement.productId, orderId: ticket.orderId, type: 'ADJUSTMENT', quantity: -1,
          unitCost: replacement.product.cost, actorId: user.id, referenceId: part.id, reason: 'Serialized warranty/service replacement',
        } })
        await tx.serviceTicket.update({ where: { id }, data: { coverageDecision: covered ? 'COVERED' : 'NOT_COVERED' } })
        await audit(tx, id, 'ASSET_REPLACED', user.id, { previousAssetId: original.id, replacementAssetId: replacement.id, covered })
        return part
      })
    },
    async resolve(id, { resolutionNotes, coverageDecision, coverageReason }, user) {
      return db.$transaction(async tx => {
        const ticket = await locked(tx, id, user)
        if (ticket.status === 'RESOLVED_PENDING_CONFIRMATION') return ticket
        if (!open.includes(ticket.status)) throw invalid('Only an open ticket can be resolved.')
        const replaced = ticket.ticketPartsByTicket.some(part => part.replacementAssetId)
        const covered = replaced ? ticket.coverageDecision === 'COVERED' : isCovered(ticket.asset?.warrantyByAsset, ticket.incidentAt)
        if ((coverageDecision === 'COVERED') !== covered) throw invalid('Coverage must match the serial warranty at the incident date.')
        const now = new Date()
        if (covered) {
          await tx.ticketPart.updateMany({ where: { ticketId: id }, data: { chargeSnapshot: 0 } })
        } else {
          const lines = billingLines(ticket)
          const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0))
          if (lines.length) await tx.invoice.create({ data: {
            invoiceNumber: 'INV-' + randomUUID().toUpperCase(), customerId: ticket.customerId, ticketId: id,
            subtotal, tax: 0, total: subtotal, status: 'ISSUED', issuedAt: now,
            invoiceLinesByInvoice: { createMany: { data: lines } },
          } })
        }
        await audit(tx, id, 'RESOLVED_PENDING_CONFIRMATION', user.id, { coverageDecision, resolutionNotes })
        return tx.serviceTicket.update({ where: { id }, include, data: {
          status: 'RESOLVED_PENDING_CONFIRMATION', resolvedAt: now, coverageDecision, coverageReason,
          notes: resolutionNotes, ...(covered && { laborCharge: 0 }),
        } })
      })
    },
    async confirm(id, { customerConfirmationName, confirmedAt }, user) {
      return db.$transaction(async tx => {
        const ticket = await locked(tx, id, user)
        if (ticket.status === 'CLOSED') return ticket
        if (ticket.status !== 'RESOLVED_PENDING_CONFIRMATION') throw invalid('Resolve the ticket before recording customer confirmation.')
        const time = confirmedAt ?? new Date()
        if (time < ticket.resolvedAt || time > new Date()) throw validation('Enter a valid confirmation date.')
        await audit(tx, id, 'CLOSED', user.id, { customerConfirmationName })
        return tx.serviceTicket.update({ where: { id }, include, data: { status: 'CLOSED', customerConfirmationName, confirmedAt: time } })
      })
    },
  }
}
