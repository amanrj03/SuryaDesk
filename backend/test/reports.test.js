import assert from 'node:assert/strict'
import test from 'node:test'
import { createDatabase } from '../src/lib/prisma.js'
import { range, reportsService } from '../src/modules/reports/reports.service.js'

test('report periods use India-local midnight and Monday week starts', () => {
  const now = new Date('2026-11-21T20:35:00Z')
  assert.equal(range({ period: 'today' }, now).from.toISOString(), '2026-11-21T18:30:00.000Z')
  assert.equal(range({ period: 'week' }, now).from.toISOString(), '2026-11-15T18:30:00.000Z')
  assert.equal(range({ period: 'month' }, now).from.toISOString(), '2026-10-31T18:30:00.000Z')
})

test('report counts and cash reconcile to PostgreSQL without counting payments as sales', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const db = createDatabase(process.env.DATABASE_URL)
  try {
    const period = { period: 'custom', from: new Date('2026-04-01Z'), to: new Date('2026-10-01Z') }
    const date = { gte: period.from, lt: period.to }
    const reports = reportsService(db)
    const overview = await reports.overview(period)
    const profit = await reports.profitability({ ...period, page: 1, limit: 20 })
    const cash = await db.payment.aggregate({ where: { receivedAt: date, voidedAt: null }, _sum: { amount: true } })
    const orders = await db.order.aggregate({
      where: { confirmedAt: date, status: { not: 'CANCELLED' } }, _sum: { subtotal: true }, _count: true,
    })
    assert.ok(overview.cashCollected.equals(cash._sum.amount ?? 0))
    assert.ok(overview.revenue.equals(orders._sum.subtotal ?? 0))
    assert.equal(profit.meta.total, orders._count)
    assert.ok(profit.data.every(row =>
      row.revenue.minus(row.materialCost).minus(row.laborCost).minus(row.otherCost).minus(row.margin).abs().lte('0.01')))
    const csvRows = await reports.export({ ...period, type: 'orders' })
    assert.ok(csvRows.length >= Math.min(orders._count, 10000))
  } finally {
    await db.$disconnect()
  }
})
