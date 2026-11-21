import { Prisma } from '@prisma/client'

const day = 86400_000
const reference = (prefix, order) => prefix + order.id.slice(-4)
const tracked = ['DOCUMENTS_PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID']

export async function seedFinance(db) {
  const rows = await db.order.findMany({
    where: { id: { startsWith: 'DEMO-ORDER-' } }, orderBy: { id: 'asc' },
    include: {
      paymentsByOrder: { where: { voidedAt: null }, orderBy: { receivedAt: 'asc' } },
      orderLinesByOrder: true, quotation: { include: { lead: true } },
    },
  })
  let subsidyCount = 0
  for (const order of rows) {
    const paid = order.paymentsByOrder.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0))
    const issueAt = new Date(order.confirmedAt.getTime() + day)
    const appStage = tracked[subsidyCount % tracked.length]
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`
      if (order.status === 'CANCELLED') return
      if (!await tx.invoice.findUnique({ where: { orderId: order.id } })) {
        const complete = paid.gte(order.total)
        await tx.invoice.create({ data: {
          invoiceNumber: reference('DEMO-INV-', order), customerId: order.customerId, orderId: order.id,
          subtotal: order.subtotal, tax: order.tax, total: order.total, issuedAt: issueAt,
          dueAt: new Date(issueAt.getTime() + 30 * day),
          status: complete ? 'PAID' : paid.gt(0) ? 'PARTIALLY_PAID' : 'ISSUED',
          paidAt: complete ? new Date(Math.max(issueAt.getTime(), order.paymentsByOrder.at(-1)?.receivedAt.getTime() ?? 0)) : null,
          invoiceLinesByInvoice: { createMany: { data: order.orderLinesByOrder.map(line => ({
            description: line.descriptionSnapshot, quantity: line.quantity, unitPrice: line.unitPriceSnapshot, lineTotal: line.lineTotal,
          })) } },
        } })
      }
      if (order.quotation.lead.subsidyInterest) {
        const status = order.status === 'COMPLETED' ? appStage : 'DOCUMENTS_PENDING'
        const submitted = status !== 'DOCUMENTS_PENDING'
        const decided = submitted && status !== 'SUBMITTED'
        await tx.subsidyApplication.upsert({ where: { orderId: order.id }, update: {}, create: {
          orderId: order.id, status, createdAt: issueAt,
          reference: submitted ? reference('DEMO-SUB-', order) : null,
          submittedAt: submitted ? new Date(issueAt.getTime() + 8 * day) : null,
          decisionAt: decided ? new Date(issueAt.getTime() + 18 * day) : null,
          documentChecklist: { identity: true, utilityBill: true, installationCertificate: submitted, bankDetails: submitted },
          notes: 'Illustrative local record for subsidy tracking.',
        } })
      }
    })
    if (order.quotation.lead.subsidyInterest) subsidyCount++
  }
}
