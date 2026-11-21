const prefix = startsWith => ({ startsWith })
const ids = rows => ({ in: rows.map(row => row.id) })
const select = { id: true }

export async function clearDemoData(tx) {
  const customers = ids(await tx.customer.findMany({ where: { id: prefix('DEMO-CUSTOMER-') }, select }))
  const leads = ids(await tx.lead.findMany({ where: { id: prefix('DEMO-LEAD-') }, select }))
  const surveys = ids(await tx.siteSurvey.findMany({ where: { id: prefix('DEMO-SURVEY-') }, select }))
  const quotes = ids(await tx.quotation.findMany({ where: { id: prefix('DEMO-QUOTATION-') }, select }))
  const orders = ids(await tx.order.findMany({ where: { id: prefix('DEMO-ORDER-') }, select }))
  const tickets = ids(await tx.serviceTicket.findMany({ where: { ticketNumber: prefix('DEMO-TKT-') }, select }))
  const purchases = ids(await tx.purchaseOrder.findMany({ where: { purchaseNumber: prefix('DEMO-PO-') }, select }))
  const invoices = ids(await tx.invoice.findMany({ where: {
    OR: [{ orderId: orders, invoiceNumber: prefix('DEMO-INV-') }, { ticketId: tickets, invoiceNumber: prefix('DEMO-SVC-') }],
  }, select }))
  const dispatches = ids(await tx.dispatch.findMany({ where: { orderId: orders, dispatchNumber: prefix('DEMO-DSP-') }, select }))
  const installations = ids(await tx.installation.findMany({ where: { orderId: orders }, select }))
  const subsidies = ids(await tx.subsidyApplication.findMany({ where: { orderId: orders }, select }))
  const products = ids(await tx.product.findMany({ where: { sku: prefix('DEMO-') }, select }))
  const packages = ids(await tx.solarPackage.findMany({ where: { code: prefix('DEMO-') }, select }))
  const movements = await tx.stockMovement.findMany({
    where: { productId: products }, select: { orderId: true, referenceId: true },
  })
  const demoOrders = new Set(orders.in)
  const demoPurchases = new Set(purchases.in)
  const demoRepairs = new Set((await tx.ticketPart.findMany({ where: { ticketId: tickets }, select })).map(row => row.id))
  if (movements.some(row => !demoOrders.has(row.orderId) &&
      !demoPurchases.has(row.referenceId) && !demoRepairs.has(row.referenceId) && !row.referenceId?.startsWith('DEMO-RECEIPT-'))) {
    throw new Error('A demo product has stock activity outside the seed. Reset cancelled to protect that stock.')
  }

  const owners = [
    { ownerType: 'INSTALLATION', ownerId: installations }, { ownerType: 'SURVEY', ownerId: surveys },
    { ownerType: 'TICKET', ownerId: tickets }, { ownerType: 'SUBSIDY', ownerId: subsidies },
  ]
  if (await tx.attachment.findFirst({ where: { OR: owners, NOT: { id: prefix('DEMO-') } }, select })) {
    throw new Error('A demo record has a manually uploaded attachment. Reset cancelled to protect that file.')
  }
  const media = await tx.attachment.findMany({ where: { OR: owners, id: prefix('DEMO-') }, select: { storageKey: true } })
  const entities = { Customer: customers, Lead: leads, SiteSurvey: surveys, Quotation: quotes, Order: orders,
    Dispatch: dispatches, Installation: installations, ServiceTicket: tickets, SubsidyApplication: subsidies,
    Invoice: invoices, PurchaseOrder: purchases, Product: products, SolarPackage: packages }
  await tx.auditLog.deleteMany({ where: { OR: Object.entries(entities).map(([entityType, entityId]) => ({ entityType, entityId })) } })
  await tx.invoiceLine.deleteMany({ where: { invoiceId: invoices } })
  await tx.invoice.deleteMany({ where: { id: invoices } })
  await tx.workLog.deleteMany({ where: { OR: [{ installationId: installations }, { ticketId: tickets }] } })
  await tx.installationAssignment.deleteMany({ where: { installationId: installations } })
  await tx.installation.deleteMany({ where: { id: installations } })
  await tx.attachment.deleteMany({ where: { OR: owners, id: prefix('DEMO-') } })
  await tx.ticketPart.deleteMany({ where: { ticketId: tickets } })
  await tx.serviceTicket.deleteMany({ where: { id: tickets } })
  await tx.subsidyApplication.deleteMany({ where: { id: subsidies } })
  await tx.dispatchItem.deleteMany({ where: { dispatchId: dispatches } })
  await tx.warranty.deleteMany({ where: { orderId: orders } })
  await tx.serializedAsset.deleteMany({ where: { productId: products, serialNumber: prefix('SD-') } })
  await tx.dispatch.deleteMany({ where: { id: dispatches } })
  await tx.stockMovement.deleteMany({ where: { productId: products } })
  await tx.stockBalance.deleteMany({ where: { productId: products } })
  await tx.jobCost.deleteMany({ where: { orderId: orders } })
  await tx.payment.deleteMany({ where: { orderId: orders } })
  await tx.orderLine.deleteMany({ where: { orderId: orders } })
  await tx.order.deleteMany({ where: { id: orders } })
  await tx.quotationLine.deleteMany({ where: { quotationId: quotes } })
  await tx.quotation.deleteMany({ where: { id: quotes } })
  await tx.siteSurvey.deleteMany({ where: { id: surveys } })
  await tx.leadActivity.deleteMany({ where: { leadId: leads } })
  await tx.lead.deleteMany({ where: { id: leads } })
  await tx.customer.deleteMany({ where: { id: customers } })
  await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: purchases } })
  await tx.purchaseOrder.deleteMany({ where: { id: purchases } })
  await tx.supplier.deleteMany({ where: { code: prefix('DEMO-SUP-') } })
  await tx.packageComponent.deleteMany({ where: { packageId: packages } })
  await tx.solarPackage.deleteMany({ where: { id: packages } })
  await tx.product.deleteMany({ where: { id: products } })
  return media.map(row => row.storageKey)
}
