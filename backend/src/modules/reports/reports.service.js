import { Prisma } from '@prisma/client'
import { adminOverview } from './admin-overview.js'

const day = 86400_000
const india = 330 * 60_000
const zero = new Prisma.Decimal(0)

export function range(query, now = new Date()) {
  if (query.period === 'custom') return { from: query.from, to: query.to }
  const local = new Date(now.getTime() + india)
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - india
  if (query.period === 'today') return { from: new Date(midnight), to: new Date(midnight + day) }
  if (query.period === 'week') {
    const monday = midnight - ((local.getUTCDay() + 6) % 7) * day
    return { from: new Date(monday), to: new Date(monday + 7 * day) }
  }
  return {
    from: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - india),
    to: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - india),
  }
}

function dates({ from, to }) {
  return { gte: from, lt: to }
}

async function profitability(tx, { from, to }, page, limit) {
  return tx.$queryRaw`
    WITH selected AS (
      SELECT id, "orderNumber", "customerId", "confirmedAt", status, subtotal
      FROM "Order"
      WHERE "confirmedAt" >= ${from} AND "confirmedAt" < ${to} AND status <> 'CANCELLED'
      ORDER BY "confirmedAt" DESC, id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}
    )
    SELECT o.id, o."orderNumber", o."confirmedAt", o.status,
      c.name AS "customerName", o.subtotal AS revenue,
      COALESCE(material.cost, 0) AS "materialCost",
      ROUND(COALESCE(labor.cost, 0), 2) AS "laborCost", ROUND(labor.minutes, 2) AS "laborMinutes",
      COALESCE(other.cost, 0) AS "otherCost",
      CASE WHEN costs.complete THEN
        ROUND(o.subtotal - COALESCE(material.cost, 0) - COALESCE(labor.cost, 0) - COALESCE(other.cost, 0), 2)
      END AS margin,
      costs.complete AS "costComplete"
    FROM selected o
    JOIN "Customer" c ON c.id = o."customerId"
    LEFT JOIN LATERAL (
      SELECT SUM(m.quantity * m."unitCost") AS cost, COUNT(m."unitCost") AS entries
      FROM "StockMovement" m WHERE m."orderId" = o.id AND m.type = 'DISPATCH'
    ) material ON true
    LEFT JOIN LATERAL (
      SELECT SUM(EXTRACT(EPOCH FROM (w."endAt" - w."startAt")) / 3600 * w."hourlyCostSnapshot") AS cost,
        SUM(EXTRACT(EPOCH FROM (w."endAt" - w."startAt")) / 60) AS minutes,
        COUNT(w.id) AS entries
      FROM "Installation" i JOIN "WorkLog" w ON w."installationId" = i.id WHERE i."orderId" = o.id
    ) labor ON true
    LEFT JOIN LATERAL (SELECT SUM(j.amount) AS cost FROM "JobCost" j WHERE j."orderId" = o.id) other ON true
    CROSS JOIN LATERAL (
      SELECT (o.status = 'COMPLETED' AND labor.entries > 0
        AND (NOT EXISTS (SELECT 1 FROM "OrderLine" l WHERE l."orderId" = o.id AND l."lineKind" = 'MATERIAL')
          OR material.entries > 0)) AS complete
    ) costs
    ORDER BY o."confirmedAt" DESC, o.id DESC
  `
}

async function operational(tx, window) {
  const orderStates = await tx.order.groupBy({
    by: ['status'], where: { confirmedAt: dates(window) }, _count: { _all: true },
  })
  const openTickets = await tx.serviceTicket.count({ where: { status: { not: 'CLOSED' } } })
  const openInstallations = await tx.installation.count({ where: { status: { not: 'COMPLETED' } } })
  const [stock] = await tx.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" p
    LEFT JOIN "StockBalance" b ON b."productId" = p.id
    WHERE p."isActive" AND COALESCE(b."onHand" - b.reserved, 0) <= p."reorderLevel"`
  const staffHours = await tx.$queryRaw`
    SELECT u.name, u.id, ROUND(SUM(EXTRACT(EPOCH FROM (w."endAt" - w."startAt")) / 3600), 2) AS hours,
      ROUND(SUM(EXTRACT(EPOCH FROM (w."endAt" - w."startAt")) / 3600 * w."hourlyCostSnapshot"), 2) AS cost
    FROM "WorkLog" w JOIN "User" u ON u.id = w."technicianId"
    WHERE w."startAt" >= ${window.from} AND w."startAt" < ${window.to}
    GROUP BY u.name, u.id ORDER BY u.name, u.id
  `
  return { orderStates, openTickets, openInstallations, lowStock: stock.count, staffHours }
}

export function reportsService(db) {
  return {
    adminOverview: query => db.$transaction(tx => adminOverview(tx, range(query)), { isolationLevel: 'RepeatableRead' }),
    async overview(query) {
      const window = range(query)
      return db.$transaction(async tx => {
        const within = dates(window)
        const sales = await tx.order.aggregate({
          where: { confirmedAt: within, status: { not: 'CANCELLED' } }, _sum: { subtotal: true }, _count: true,
        })
        const cash = await tx.payment.aggregate({ where: { receivedAt: within, voidedAt: null }, _sum: { amount: true } })
        const invoiced = await tx.invoice.aggregate({ where: { issuedAt: within, status: { notIn: ['VOID', 'DRAFT'] } }, _sum: { total: true } })
        const [expenses] = await tx.$queryRaw`
          SELECT COALESCE(SUM(m.quantity * m."unitCost"), 0) AS purchases
          FROM "StockMovement" m WHERE m.type = 'RECEIPT' AND m."createdAt" >= ${window.from} AND m."createdAt" < ${window.to}
        `
        const series = await tx.$queryRaw`
          SELECT to_char(("receivedAt" + INTERVAL '5 hours 30 minutes')::date, 'YYYY-MM-DD') AS date,
            SUM(amount) AS cash
          FROM "Payment" WHERE "voidedAt" IS NULL AND "receivedAt" >= ${window.from} AND "receivedAt" < ${window.to}
          GROUP BY 1 ORDER BY 1
        `
        const operations = await operational(tx, window)
        return { ...window, orderCount: sales._count, revenue: sales._sum.subtotal ?? zero,
          cashCollected: cash._sum.amount ?? zero, invoicesIssued: invoiced._sum.total ?? zero,
          purchases: expenses.purchases, series, ...operations }
      }, { isolationLevel: 'RepeatableRead' })
    },
    operations: query => db.$transaction(tx => operational(tx, range(query)), { isolationLevel: 'RepeatableRead' }),
    async profitability({ page, limit, ...query }) {
      const window = range(query)
      return db.$transaction(async tx => {
        const data = await profitability(tx, window, page, limit)
        const total = await tx.order.count({ where: { confirmedAt: dates(window), status: { not: 'CANCELLED' } } })
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
      }, { isolationLevel: 'RepeatableRead' })
    },
    async export(query) {
      const window = range(query)
      if (query.type === 'profitability') return profitability(db, window, 1, 10000)
      if (query.type === 'orders') return db.order.findMany({
        where: { confirmedAt: dates(window) }, orderBy: { confirmedAt: 'desc' }, take: 10000,
        select: { orderNumber: true, status: true, confirmedAt: true, subtotal: true, tax: true, total: true },
      })
      if (query.type === 'tickets') return db.serviceTicket.findMany({
        where: { incidentAt: dates(window) }, orderBy: { incidentAt: 'desc' }, take: 10000,
        select: { ticketNumber: true, status: true, priority: true, coverageDecision: true, incidentAt: true },
      })
      const { openTickets, openInstallations, lowStock } = await operational(db, window)
      return [{ openTickets, openInstallations, lowStock }]
    },
  }
}
