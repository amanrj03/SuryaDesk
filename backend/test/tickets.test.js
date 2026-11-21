import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { ticketsService } from '../src/modules/tickets/tickets.service.js'

test('uncovered repair bills parts and labour and requires customer confirmation', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  const key = randomUUID()
  try {
    await assert.rejects(db.$transaction(async tx => {
      const user = await tx.user.create({ data: {
        name: 'Support fixture', email: key + '@example.invalid', role: 'SUPPORT', passwordHash: 'fixture',
      } })
      const support = { ...user, capabilities: ['tickets:manage', 'tickets:resolve'] }
      const customer = await tx.customer.create({ data: { name: 'Ticket fixture', address: 'Test residence', phone: '+910000000000' } })
      const part = await tx.product.create({ data: {
        sku: key, name: 'Connector fixture', category: 'WIRING', unit: 'unit', cost: 50, salePrice: '75.25',
        serialized: false, warrantyMonths: 0, reorderLevel: 0,
        stockBalanceByProduct: { create: { onHand: 2, reserved: 0 } },
      } })
      const tickets = ticketsService({ $transaction: callback => callback(tx) })
      const ticket = await tickets.create({ customerId: customer.id, description: 'Loose connectors', priority: 'MEDIUM' }, support)
      await assert.rejects(tickets.confirm(ticket.id, { customerConfirmationName: 'Customer' }, support), { code: 'INVALID_TRANSITION' })
      await assert.rejects(tickets.part(ticket.id, { productId: part.id, quantity: 3, chargePerUnit: '75.25' }, support), { code: 'INSUFFICIENT_STOCK' })
      await tickets.update(ticket.id, { laborCharge: '450.00' }, support)
      const worker = await tx.user.create({ data: {
        name: 'Technician fixture', email: 'tech-' + key + '@example.invalid', role: 'TECHNICIAN', passwordHash: 'fixture',
      } })
      const technician = { ...worker, capabilities: ['tickets:manage', 'tickets:report_repair', 'installations:complete_assigned'] }
      const report = { repairNotes: 'Replaced both connectors and checked output.' }
      const used = { productId: part.id, quantity: 2 }
      await assert.rejects(tickets.part(ticket.id, used, technician), { code: 'NOT_FOUND' })
      await tickets.update(ticket.id, { assignedToId: worker.id }, support)
      await assert.rejects(tickets.part(ticket.id, used, technician), { code: 'INVALID_TRANSITION' })
      await assert.rejects(tickets.reportRepair(ticket.id, report, technician), { code: 'INVALID_TRANSITION' })
      await tickets.update(ticket.id, { status: 'IN_PROGRESS' }, technician)
      await assert.rejects(tickets.reportRepair(ticket.id, report, { ...technician, id: user.id }), { code: 'NOT_FOUND' })
      await assert.rejects(tickets.part(ticket.id, { ...used, chargePerUnit: '1.00' }, technician), { code: 'FORBIDDEN' })
      const recordedPart = await tickets.part(ticket.id, used, technician)
      assert.equal(recordedPart.chargeSnapshot.toFixed(2), '75.25')
      assert.equal((await tx.stockBalance.findUniqueOrThrow({ where: { productId: part.id } })).onHand, 0)
      const reported = await tickets.reportRepair(ticket.id, report, technician)
      assert.equal(reported.repairNotes, report.repairNotes)
      assert.equal(reported.status, 'IN_PROGRESS')
      assert.deepEqual((await tickets.reportRepair(ticket.id, report, technician)).repairReportedAt, reported.repairReportedAt)
      await assert.rejects(tickets.part(ticket.id, used, technician), { code: 'INVALID_TRANSITION' })
      await assert.rejects(tickets.resolve(ticket.id, { coverageDecision: 'COVERED', resolutionNotes: 'Repaired' }, support), { code: 'INVALID_TRANSITION' })
      const resolution = { coverageDecision: 'NOT_COVERED', resolutionNotes: 'Replaced both connectors.' }
      const resolved = await tickets.resolve(ticket.id, resolution, support)
      assert.equal(resolved.status, 'RESOLVED_PENDING_CONFIRMATION')
      assert.equal(resolved.invoiceByTicket.total.toFixed(2), '600.50')
      await tickets.resolve(ticket.id, resolution, support)
      assert.equal(await tx.invoice.count({ where: { ticketId: ticket.id } }), 1)
      const closed = await tickets.confirm(ticket.id, { customerConfirmationName: 'Customer' }, support)
      assert.equal(closed.status, 'CLOSED')
      await assert.rejects(tickets.reportRepair(ticket.id, report, technician), { code: 'INVALID_TRANSITION' })
      throw new Error('Rollback service fixture')
    }), { message: 'Rollback service fixture' })
  } finally {
    await db.$disconnect()
  }
})
