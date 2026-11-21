import { Prisma } from '@prisma/client'
import { ticketsService } from '../src/modules/tickets/tickets.service.js'
import { roleCapabilities } from '../src/config/permissions.js'
import { isCovered } from '../src/modules/warranties/coverage.js'

import { day, daysFrom, seedNow } from './seed-clock.js'
const faults = [
  ['E031', 'Inverter display shows an insulation fault after rainfall.'],
  ['E017', 'System stopped producing after a grid interruption.'],
  ['E104', 'Intermittent communications and missing production readings.'],
  ['E052', 'Battery backup is unavailable when the grid drops.'],
]

const technicians = db => db.user.findMany({
  where: { role: 'TECHNICIAN', email: { endsWith: '@demo.suryadesk.test' } }, orderBy: { email: 'asc' },
})

export async function seedInstallationSchedule(db) {
  const [workers, orders] = await Promise.all([
    technicians(db),
    db.order.findMany({ where: { id: { startsWith: 'DEMO-ORDER-' }, status: { not: 'CANCELLED' } },
      orderBy: { id: 'asc' }, include: { installationByOrder: true, customer: true } }),
  ])
  if (!workers.length) return
  for (const [index, row] of orders.entries()) {
    const job = row.installationByOrder
    if (!job || job.status !== 'UNSCHEDULED') continue
    const scheduledAt = new Date(row.confirmedAt.getTime() + 7 * day)
    const technicianIds = [workers[index % workers.length].id]
    if (index < 30) technicianIds.push(workers[(index + 1) % workers.length].id)
    await db.$transaction(async tx => {
      const changed = await tx.installation.updateMany({
        where: { id: job.id, status: 'UNSCHEDULED' }, data: { scheduledAt, status: 'SCHEDULED' },
      })
      if (changed.count) await tx.installationAssignment.createMany({
        data: technicianIds.map((technicianId, assignment) => ({
          installationId: job.id, technicianId, assignmentRole: assignment ? 'Assistant' : 'Lead technician', assignedAt: row.confirmedAt,
        })),
        skipDuplicates: true,
      })
    })
  }
}

export async function seedOperations(db) {
  const [workers, support, equipment] = await Promise.all([
    technicians(db),
    db.user.findUniqueOrThrow({ where: { email: 'support@demo.suryadesk.test' } }),
    db.serializedAsset.findMany({
      where: { deliveredAt: { not: null }, serialNumber: { startsWith: 'SD-' }, product: { category: { in: ['INVERTER', 'BATTERY', 'CONTROLLER'] } } },
      orderBy: { serialNumber: 'asc' }, include: { warrantyByAsset: true },
    }),
  ])
  if (!workers.length) return
  const customers = await db.customer.findMany({ where: { id: { startsWith: 'DEMO-CUSTOMER-' } }, orderBy: { id: 'asc' }, take: 100 })
  const expired = equipment.filter(asset => asset.warrantyByAsset?.endAt < daysFrom(seedNow, -30))
  const coveredAssets = equipment.filter(asset => isCovered(asset.warrantyByAsset, seedNow))
  const testAssets = [...expired.slice(0, 10), ...coveredAssets.slice(0, 30)]
  const parts = await db.product.findMany({
    where: { sku: { in: ['DEMO-CONNECTOR', 'DEMO-SWITCH', 'DEMO-WIRING'] } }, orderBy: { sku: 'asc' },
  })
  const visits = [
    'Annual generation review and inverter firmware assessment.',
    'Bird guard inspection after a rooftop renovation.',
    'Thermal scan requested for a warm DC isolator.',
    'Production meter readings do not match the monitoring app.',
    'Customer requested a post-monsoon panel cleaning and cable inspection.',
  ]
  for (let index = 0; index < Math.min(100, customers.length); index++) {
    const asset = testAssets[index] ?? null
    const proposed = daysFrom(seedNow, index >= 90 ? -3 - (index % 6) / 5 : -6 - index * 1.6)
    const incidentAt = new Date(Math.max(proposed, asset ? daysFrom(asset.warrantyByAsset.startAt, 1) : 0))
    const [faultCode, description] = asset?.warrantyByAsset?.months === 24 && asset.serialNumber.includes('BATTERY')
      ? faults[3] : faults[index % 3]
    const state = ['OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED_PENDING_CONFIRMATION', 'CLOSED'][index % 6]
    const covered = isCovered(asset?.warrantyByAsset, incidentAt)
    const resolved = ['RESOLVED_PENDING_CONFIRMATION', 'CLOSED'].includes(state)
    const customer = asset ? customers.find(customer => customer.id === asset.customerId) : customers[index]
    if (!customer) continue
    const labour = !covered && resolved ? 650 + (index % 9) * 275 : 0
    const part = parts[index % parts.length]
    const ticketNumber = 'DEMO-TKT-' + String(index + 1).padStart(4, '0')
    await db.$transaction(async tx => {
      if (await tx.serviceTicket.findUnique({ where: { ticketNumber } })) return
      const ticket = await tx.serviceTicket.create({ data: {
        ticketNumber, customerId: customer.id, assetId: asset?.id, orderId: asset?.orderId,
        assignedToId: index % 6 >= 2 ? workers[index % workers.length].id : null,
        faultCode: asset ? faultCode : null, description: asset ? description : visits[index % visits.length],
        incidentAt, createdAt: incidentAt, status: state,
        priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'MEDIUM'][index % 5],
        coverageDecision: covered ? 'COVERED' : asset || resolved ? 'NOT_COVERED' : 'PENDING',
        coverageReason: covered ? 'Serial is covered at the incident date.' : 'No eligible serial coverage recorded.',
        laborCharge: labour,
        resolvedAt: resolved ? new Date(incidentAt.getTime() + day) : null,
        confirmedAt: state === 'CLOSED' ? new Date(incidentAt.getTime() + 2 * day) : null,
        customerConfirmationName: state === 'CLOSED' ? customer.name : null,
      } })
      const invoiceLines = [{ description: 'Maintenance visit labour', quantity: 1, unitPrice: labour, lineTotal: labour }]
      if (part && resolved && index % 3 !== 0) {
        const quantity = 1 + index % 2
        const balance = await tx.stockBalance.findUniqueOrThrow({ where: { productId: part.id } })
        if (balance.onHand - balance.reserved >= quantity) {
          const repair = await tx.ticketPart.create({ data: {
            ticketId: ticket.id, productId: part.id, quantity, costSnapshot: part.cost,
            chargeSnapshot: covered ? 0 : part.salePrice, createdAt: ticket.resolvedAt,
          } })
          await tx.stockBalance.update({ where: { productId: part.id }, data: { onHand: { decrement: quantity } } })
          await tx.stockMovement.create({ data: {
            productId: part.id, orderId: ticket.orderId, type: 'ADJUSTMENT', quantity: -quantity,
            unitCost: part.cost, actorId: support.id, referenceId: repair.id,
            reason: 'Service repair part', createdAt: ticket.resolvedAt,
          } })
          if (!covered) invoiceLines.push({
            description: part.name, quantity, unitPrice: part.salePrice, lineTotal: part.salePrice.mul(quantity),
          })
        }
      }
      if (!covered && resolved) {
        const total = invoiceLines.reduce((amount, line) => amount.plus(line.lineTotal), new Prisma.Decimal(0))
        await tx.invoice.create({ data: {
        invoiceNumber: 'DEMO-SVC-' + ticketNumber.slice(-4), customerId: customer.id, ticketId: ticket.id,
        subtotal: total, tax: 0, total, status: 'ISSUED', issuedAt: ticket.resolvedAt,
        invoiceLinesByInvoice: { create: invoiceLines },
        } })
      }
      await tx.auditLog.create({ data: {
        actorId: support.id, entityId: ticket.id, entityType: 'ServiceTicket', action: 'DEMO_IMPORT',
        summary: { status: state }, createdAt: incidentAt,
      } })
    })
  }
}

export async function seedServiceAssetCases(db) {
  const support = await db.user.findUniqueOrThrow({ where: { email: 'support@demo.suryadesk.test' } })
  const [exchange, diagnosis] = await db.serviceTicket.findMany({
    where: { ticketNumber: { startsWith: 'DEMO-TKT-' }, assetId: { not: null }, coverageDecision: 'COVERED',
      status: { in: ['OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS'] } },
    orderBy: { ticketNumber: 'asc' }, take: 2,
    include: { asset: true, ticketPartsByTicket: true },
  })
  if (exchange && !exchange.ticketPartsByTicket.some(row => row.replacementAssetId)) {
    const spare = await db.serializedAsset.findFirst({
      where: { serialNumber: { startsWith: 'SD-' }, status: 'IN_STOCK', orderId: null, productId: exchange.asset.productId },
      orderBy: { serialNumber: 'desc' },
    })
    if (spare) await ticketsService(db).replace(exchange.id, {
      serialNumber: spare.serialNumber, chargePerUnit: '0.00',
    }, { ...support, capabilities: roleCapabilities[support.role] })
  }
  if (diagnosis) {
    await db.serializedAsset.updateMany({
      where: { id: diagnosis.assetId, status: { in: ['INSTALLED', 'DELIVERED'] } }, data: { status: 'UNDER_REPAIR' },
    })
  }
}
