import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { roleCapabilities } from '../../config/permissions.js'
import { ApiError } from '../../utils/ApiError.js'
import { isCovered } from '../warranties/coverage.js'
import { canDownloadInvoice } from '../invoices/invoices.service.js'

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
const canReportRepair = (ticket, user) => ticket.assignedToId === user.id && user.capabilities.includes('tickets:report_repair')
const hasReplacement = ticket => ticket.ticketPartsByTicket.some(part => part.replacementAssetId)
const ticketCovered = ticket => hasReplacement(ticket) ? ticket.coverageDecision === 'COVERED'
  : isCovered(ticket.asset?.warrantyByAsset, ticket.incidentAt)

function checkPartAccess(ticket, user, chargePerUnit) {
  if (user.capabilities.includes('tickets:resolve')) return
  if (!canReportRepair(ticket, user)) throw notFound()
  if (ticket.status !== 'IN_PROGRESS' || ticket.repairReportedAt) {
    throw invalid('Record parts while work is in progress and before submitting the repair report.')
  }
  if (chargePerUnit !== undefined) throw new ApiError(403, 'FORBIDDEN', 'Technicians cannot set customer charges.')
}

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

async function settleRepairCharges(tx, ticket, covered, issuedAt) {
  if (covered) {
    await tx.ticketPart.updateMany({ where: { ticketId: ticket.id }, data: { chargeSnapshot: 0 } })
    return
  }
  const lines = billingLines(ticket)
  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0))
  if (subtotal.greaterThan(0)) await tx.invoice.create({ data: {
    invoiceNumber: 'INV-' + randomUUID().toUpperCase(), customerId: ticket.customerId, ticketId: ticket.id,
    subtotal, tax: 0, total: subtotal, status: 'ISSUED', issuedAt,
    invoiceLinesByInvoice: { createMany: { data: lines } },
  } })
}

const labourRateId = 'default'

export function ticketsService(db, clock = () => new Date()) {
  return {
    async labourRate() {
      return db.serviceLabourRate.findUnique({ where: { id: labourRateId } })
    },
    async updateLabourRate(hourlyRate, user) {
      return db.$transaction(async tx => {
        const rate = await tx.serviceLabourRate.upsert({
          where: { id: labourRateId }, create: { id: labourRateId, hourlyRate }, update: { hourlyRate },
        })
        await tx.auditLog.create({ data: {
          actorId: user.id, entityType: 'ServiceLabourRate', entityId: labourRateId, action: 'UPDATED',
          summary: { hourlyRate: rate.hourlyRate.toFixed(2) },
        } })
        return rate
      })
    },
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
        await audit(tx, ticket.id, 'OPENED', user.id, {
          coverageDecision: ticket.coverageDecision,
          ...(user.customerAccountId && { customerAccountId: user.customerAccountId }),
        })
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
        return { data: data.map(ticket => ({ ...ticket, canReportRepair: canReportRepair(ticket, user) })),
          meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },
    async detail(id, user) {
      const ticket = await db.serviceTicket.findFirst({ where: { id, ...scope(user) }, include })
      if (!ticket) throw notFound()
      const timeline = await db.auditLog.findMany({
        where: { entityId: id, entityType: 'ServiceTicket' }, orderBy: { createdAt: 'asc' },
        select: { action: true, createdAt: true, summary: true },
      })
      const attachments = await db.attachment.findMany({
        where: { ownerType: 'TICKET', ownerId: id },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
      })
      const invoice = ticket.invoiceByTicket
      return {
        ...ticket, timeline, attachments, canReportRepair: canReportRepair(ticket, user),
        invoiceByTicket: invoice && { ...invoice, downloadable: canDownloadInvoice(invoice, null) },
      }
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
        if (data.laborCharge !== undefined && (ticket.repairStartedAt || status === 'IN_PROGRESS')) {
          throw invalid('Labour is calculated from the signed service visit.')
        }
        const starting = data.status === 'IN_PROGRESS' && !ticket.repairStartedAt && !ticket.repairReportedAt
        await audit(tx, id, 'UPDATED', user.id, { to: status })
        return tx.serviceTicket.update({
          where: { id }, data: { ...data, status, ...(starting && { repairStartedAt: clock() }) }, include,
        })
      })
    },
    async partOptions(id, user) {
      const ticket = await db.serviceTicket.findFirst({
        where: { id, ...scope(user) },
        select: { status: true, assignedToId: true, repairReportedAt: true },
      })
      if (!ticket) throw notFound()
      checkPartAccess(ticket, user)
      if (!open.includes(ticket.status)) throw invalid('Parts can only be added to open tickets.')
      return db.$queryRaw`
        SELECT p.id, p.name, p.sku, s."onHand" - s.reserved AS available
        FROM "Product" p
        JOIN "StockBalance" s ON s."productId" = p.id
        WHERE p."isActive" AND NOT p.serialized AND s."onHand" > s.reserved
        ORDER BY p.name, p.sku
      `
    },
    async part(id, { productId, quantity, chargePerUnit }, user) {
      return db.$transaction(async tx => {
        const ticket = await locked(tx, id, user)
        checkPartAccess(ticket, user, chargePerUnit)
        if (!open.includes(ticket.status)) throw invalid('Parts can only be added to open tickets.')
        const product = await tx.product.findUnique({ where: { id: productId } })
        if (!product?.isActive || product.serialized) throw validation('Choose an active quantity-tracked repair part.')
        const changed = await tx.$executeRaw`
          UPDATE "StockBalance" SET "onHand" = "onHand" - ${quantity}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "productId" = ${productId} AND "onHand" - reserved >= ${quantity}
        `
        if (!changed) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Not enough unreserved stock for this repair.')
        const part = await tx.ticketPart.create({
          data: { ticketId: id, productId, quantity, costSnapshot: product.cost,
            chargeSnapshot: ticketCovered(ticket) ? 0 : chargePerUnit ?? product.salePrice },
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
        checkPartAccess(ticket, user, chargePerUnit)
        if (!open.includes(ticket.status) || !ticket.asset || !ticket.orderId) throw invalid('Select an open ticket with delivered equipment.')
        if (hasReplacement(ticket)) throw invalid('This ticket already has a replacement.')
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
          chargeSnapshot: covered ? 0 : chargePerUnit ?? replacement.product.salePrice, replacementAssetId: replacement.id,
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
    async reportRepair(id, { repairNotes, customerSignerName, signatureAttachmentId }, user) {
      return db.$transaction(async tx => {
        const ticket = await locked(tx, id, user)
        if (!canReportRepair(ticket, user)) throw notFound()
        if (ticket.repairReportedAt) {
          if (ticket.repairNotes === repairNotes && ticket.repairSignerName === customerSignerName &&
            ticket.repairSignatureId === signatureAttachmentId) return ticket
          throw invalid('A repair report has already been submitted.')
        }
        if (ticket.status !== 'IN_PROGRESS') throw invalid('Start work on the ticket before reporting a repair.')
        if (!ticket.repairStartedAt) throw invalid('Start the visit timer before reporting work done.')
        const proof = await tx.attachment.findFirst({ where: {
          id: signatureAttachmentId, ownerId: id, ownerType: 'TICKET', uploadedById: user.id,
          mimeType: 'image/png', originalName: 'service-customer-signature.png',
          createdAt: { gte: ticket.repairStartedAt },
        } })
        if (!proof || !customerSignerName?.trim()) throw validation('Capture the customer signature for this visit.')
        const repairReportedAt = proof.createdAt
        const elapsed = repairReportedAt.getTime() - ticket.repairStartedAt.getTime()
        const rate = await tx.serviceLabourRate.findUnique({ where: { id: labourRateId } })
        const covered = ticketCovered(ticket)
        if (!covered && !rate) throw invalid('Ask an administrator to set the hourly service labour rate before submitting.')
        const laborCharge = covered ? new Prisma.Decimal(0)
          : rate.hourlyRate.mul(elapsed).div(3_600_000).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        if (laborCharge.gte(10_000_000_000)) throw invalid('The calculated labour charge exceeds the supported amount.')
        await settleRepairCharges(tx, { ...ticket, laborCharge }, covered, clock())
        const coverageDecision = covered ? 'COVERED' : 'NOT_COVERED'
        const updated = await tx.serviceTicket.update({ where: { id }, include, data: {
          repairNotes, repairReportedAt, repairSignerName: customerSignerName, repairSignatureId: proof.id,
          laborRateSnapshot: rate?.hourlyRate, laborCharge, coverageDecision, notes: repairNotes,
          status: 'CLOSED', resolvedAt: repairReportedAt, confirmedAt: repairReportedAt,
          customerConfirmationName: customerSignerName,
        } })
        await audit(tx, id, 'REPAIR_REPORTED', user.id, { customerSignerName, signatureAttachmentId: proof.id })
        await audit(tx, id, 'CLOSED', user.id, { customerConfirmationName: customerSignerName, coverageDecision })
        return updated
      })
    },
    async resolve(id, { resolutionNotes, coverageDecision, coverageReason }, user) {
      return db.$transaction(async tx => {
        const ticket = await locked(tx, id, user)
        if (ticket.status === 'RESOLVED_PENDING_CONFIRMATION') return ticket
        if (!open.includes(ticket.status)) throw invalid('Only an open ticket can be resolved.')
        if (ticket.repairStartedAt && !ticket.repairSignatureId) throw invalid('Record the signed service visit before resolving the ticket.')
        const covered = ticketCovered(ticket)
        if ((coverageDecision === 'COVERED') !== covered) throw invalid('Coverage must match the serial warranty at the incident date.')
        const now = new Date()
        await settleRepairCharges(tx, ticket, covered, now)
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
        await audit(tx, id, 'CLOSED', user.id, {
          customerConfirmationName, ...(user.customerAccountId && { customerAccountId: user.customerAccountId }),
        })
        return tx.serviceTicket.update({ where: { id }, include, data: { status: 'CLOSED', customerConfirmationName, confirmedAt: time } })
      })
    },
  }
}
