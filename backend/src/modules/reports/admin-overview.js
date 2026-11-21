export async function adminOverview(tx, { from, to }) {
  const [counts] = await tx.$queryRaw`
    SELECT
      (SELECT count(*)::int FROM "Customer") AS "totalCustomers",
      (SELECT count(*)::int FROM "Customer" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}) AS "customers",
      (SELECT count(*)::int FROM "Lead" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}) AS "enquiries",
      (SELECT count(*)::int FROM "Quotation" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}) AS "quotations",
      (SELECT count(*)::int FROM "Quotation" WHERE "acceptedAt" >= ${from} AND "acceptedAt" < ${to}) AS "acceptedQuotations",
      (SELECT count(*)::int FROM "Order" WHERE "confirmedAt" >= ${from} AND "confirmedAt" < ${to}) AS "orders",
      (SELECT count(*)::int FROM "Order" WHERE status NOT IN ('COMPLETED','CANCELLED')) AS "activeProjects",
      (SELECT count(*)::int FROM "SiteSurvey" WHERE status IN ('SCHEDULED','IN_PROGRESS','SUBMITTED')) AS "pendingSurveys",
      (SELECT count(*)::int FROM "Installation" i JOIN "Order" o ON o.id = i."orderId"
        WHERE i.status <> 'COMPLETED' AND o.status <> 'CANCELLED') AS "pendingInstallations",
      (SELECT count(*)::int FROM "ServiceTicket" WHERE status NOT IN ('RESOLVED_PENDING_CONFIRMATION','CLOSED')) AS "openTickets",
      (SELECT count(*)::int FROM "ServiceTicket" WHERE "resolvedAt" >= ${from} AND "resolvedAt" < ${to}) AS "resolvedTickets",
      (SELECT count(*)::int FROM "SubsidyApplication" WHERE status NOT IN ('PAID','REJECTED')) AS "pendingSubsidies",
      (SELECT COALESCE(SUM(GREATEST(o.total - COALESCE(p.paid, 0), 0)), 0)
        FROM "Order" o LEFT JOIN (
          SELECT "orderId", SUM(amount) AS paid FROM "Payment" WHERE "voidedAt" IS NULL GROUP BY "orderId"
        ) p ON p."orderId" = o.id WHERE o.status <> 'CANCELLED') AS "outstanding",
      (SELECT COALESCE(SUM(total), 0) FROM "Invoice" WHERE "ticketId" IS NOT NULL AND status = 'ISSUED') AS "outstandingServiceInvoices"
  `
  const [inventory] = await tx.$queryRaw`
    SELECT COUNT(*)::int AS products, COALESCE(SUM(b."onHand"), 0)::int AS "onHand",
      COALESCE(SUM(b.reserved), 0)::int AS reserved,
      COUNT(*) FILTER (WHERE COALESCE(b."onHand" - b.reserved, 0) <= p."reorderLevel")::int AS "lowStock"
    FROM "Product" p LEFT JOIN "StockBalance" b ON b."productId" = p.id WHERE p."isActive"
  `
  const lowStockItems = await tx.$queryRaw`
    SELECT p.id, p.sku, p.name, p."reorderLevel", COALESCE(b."onHand" - b.reserved, 0) AS available
    FROM "Product" p LEFT JOIN "StockBalance" b ON b."productId" = p.id
    WHERE p."isActive" AND COALESCE(b."onHand" - b.reserved, 0) <= p."reorderLevel"
    ORDER BY COALESCE(b."onHand" - b.reserved, 0) - p."reorderLevel", p.sku LIMIT 8
  `
  const [finance] = await tx.$queryRaw`
    WITH entries AS (
      SELECT "confirmedAt" AS at, subtotal AS revenue, 0::numeric AS expense
      FROM "Order" WHERE status <> 'CANCELLED' AND "confirmedAt" >= ${from} AND "confirmedAt" < ${to}
      UNION ALL
      SELECT "createdAt", 0, quantity * "unitCost" FROM "StockMovement"
      WHERE type = 'DISPATCH' AND "createdAt" >= ${from} AND "createdAt" < ${to}
      UNION ALL
      SELECT "startAt", 0, EXTRACT(EPOCH FROM ("endAt" - "startAt")) / 3600 * "hourlyCostSnapshot"
      FROM "WorkLog" WHERE "startAt" >= ${from} AND "startAt" < ${to}
      UNION ALL
      SELECT "incurredAt", 0, amount FROM "JobCost" WHERE "incurredAt" >= ${from} AND "incurredAt" < ${to}
      UNION ALL
      SELECT "createdAt", 0, quantity * "costSnapshot" FROM "TicketPart"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
    ), daily AS (
      SELECT (at + INTERVAL '5 hours 30 minutes')::date AS date,
        SUM(revenue) AS revenue, COALESCE(SUM(expense), 0) AS expense
      FROM entries GROUP BY 1
    )
    SELECT COALESCE(SUM(revenue), 0) AS revenue, COALESCE(SUM(ROUND(expense, 2)), 0) AS expenses,
      COALESCE(jsonb_agg(jsonb_build_object('date', date, 'revenue', revenue::text,
        'expenses', ROUND(expense, 2)::text) ORDER BY date), '[]'::jsonb) AS series
    FROM daily
  `
  const projectStatuses = await tx.order.groupBy({
    by: ['status'], where: { confirmedAt: { gte: from, lt: to } }, _count: { _all: true }, orderBy: { status: 'asc' },
  })
  const activity = await tx.auditLog.findMany({
    where: { createdAt: { gte: from, lt: to } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 12,
    select: { id: true, action: true, entityType: true, createdAt: true, actor: { select: { name: true } } },
  })
  return {
    from, to, ...counts, inventory, lowStockItems, ...finance, projectStatuses, activity,
    outstandingCustomerPayments: counts.outstanding.plus(counts.outstandingServiceInvoices),
  }
}
