import { isCovered } from '../src/modules/warranties/coverage.js'

const day = 86400_000
const faults = [
  ['E031', 'Inverter display shows an insulation fault after rainfall.'],
  ['E017', 'System stopped producing after a grid interruption.'],
  ['E104', 'Intermittent communications and missing production readings.'],
  ['E052', 'Battery backup is unavailable when the grid drops.'],
]

export async function seedOperations(db) {
  const [workers, support, orders, equipment] = await Promise.all([
    db.user.findMany({ where: { role: 'TECHNICIAN', email: { endsWith: '@demo.suryadesk.test' } }, orderBy: { email: 'asc' } }),
    db.user.findUniqueOrThrow({ where: { email: 'support@demo.suryadesk.test' } }),
    db.order.findMany({ where: { id: { startsWith: 'DEMO-ORDER-' }, status: { not: 'CANCELLED' } },
      orderBy: { id: 'asc' }, include: { installationByOrder: true, customer: true } }),
    db.serializedAsset.findMany({
      where: { deliveredAt: { not: null }, serialNumber: { startsWith: 'SD-' }, product: { category: { in: ['INVERTER', 'BATTERY', 'CONTROLLER'] } } },
      orderBy: { serialNumber: 'asc' }, include: { warrantyByAsset: true },
    }),
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

  const customers = await db.customer.findMany({ where: { id: { startsWith: 'DEMO-CUSTOMER-' } }, orderBy: { id: 'asc' }, take: 100 })
  const start = new Date('2026-07-10T06:00:00.000Z')
  for (let index = 0; index < Math.min(100, customers.length); index++) {
    const asset = index < Math.min(40, equipment.length) ? equipment[index] : null
    const incidentAt = new Date(start.getTime() + index * day)
    const [faultCode, description] = faults[index % faults.length]
    const state = ['OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED_PENDING_CONFIRMATION', 'CLOSED'][index % 6]
    const covered = isCovered(asset?.warrantyByAsset, incidentAt)
    const resolved = ['RESOLVED_PENDING_CONFIRMATION', 'CLOSED'].includes(state)
    const customer = asset ? customers.find(customer => customer.id === asset.customerId) : customers[index]
    if (!customer) continue
    const ticketNumber = 'DEMO-TKT-' + String(index + 1).padStart(4, '0')
    await db.$transaction(async tx => {
      if (await tx.serviceTicket.findUnique({ where: { ticketNumber } })) return
      const ticket = await tx.serviceTicket.create({ data: {
        ticketNumber, customerId: customer.id, assetId: asset?.id, orderId: asset?.orderId,
        assignedToId: index % 6 >= 2 ? workers[index % workers.length].id : null,
        faultCode: asset ? faultCode : null, description: asset ? description : 'Customer requested a rooftop solar maintenance visit.',
        incidentAt, createdAt: incidentAt, status: state,
        priority: ['LOW', 'MEDIUM', 'HIGH', 'MEDIUM'][index % 4],
        coverageDecision: covered ? 'COVERED' : asset || resolved ? 'NOT_COVERED' : 'PENDING',
        coverageReason: covered ? 'Serial is covered at the incident date.' : 'No eligible serial coverage recorded.',
        laborCharge: !covered && resolved ? 850 : 0,
        resolvedAt: resolved ? new Date(incidentAt.getTime() + day) : null,
        confirmedAt: state === 'CLOSED' ? new Date(incidentAt.getTime() + 2 * day) : null,
        customerConfirmationName: state === 'CLOSED' ? customer.name : null,
      } })
      if (!covered && resolved) await tx.invoice.create({ data: {
        invoiceNumber: 'DEMO-SVC-' + ticketNumber.slice(-4), customerId: customer.id, ticketId: ticket.id,
        subtotal: 850, tax: 0, total: 850, status: 'ISSUED', issuedAt: ticket.resolvedAt,
        invoiceLinesByInvoice: { create: { description: 'Maintenance visit labour', quantity: 1, unitPrice: 850, lineTotal: 850 } },
      } })
      await tx.auditLog.create({ data: {
        actorId: support.id, entityId: ticket.id, entityType: 'ServiceTicket', action: 'DEMO_IMPORT',
        summary: { status: state }, createdAt: incidentAt,
      } })
    })
  }
}
