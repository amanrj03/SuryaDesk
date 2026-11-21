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
      await tickets.part(ticket.id, { productId: part.id, quantity: 2, chargePerUnit: '75.25' }, support)
      await tickets.update(ticket.id, { laborCharge: '450.00' }, support)
      await assert.rejects(tickets.resolve(ticket.id, { coverageDecision: 'COVERED', resolutionNotes: 'Repaired' }, support), { code: 'INVALID_TRANSITION' })
      const resolution = { coverageDecision: 'NOT_COVERED', resolutionNotes: 'Replaced both connectors.' }
      const resolved = await tickets.resolve(ticket.id, resolution, support)
      assert.equal(resolved.status, 'RESOLVED_PENDING_CONFIRMATION')
      assert.equal(resolved.invoiceByTicket.total.toFixed(2), '600.50')
      await tickets.resolve(ticket.id, resolution, support)
      assert.equal(await tx.invoice.count({ where: { ticketId: ticket.id } }), 1)
      const closed = await tickets.confirm(ticket.id, { customerConfirmationName: 'Customer' }, support)
      assert.equal(closed.status, 'CLOSED')
      throw new Error('Rollback service fixture')
    }), { message: 'Rollback service fixture' })
  } finally {
    await db.$disconnect()
  }
})
