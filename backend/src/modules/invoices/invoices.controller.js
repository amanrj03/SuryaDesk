import { invoicePdf } from './invoice-pdf.js'

export function invoiceController(invoices, seller) {
  return {
    async create(request, response) {
      response.status(201).json({ success: true, data: await invoices.create(request.validated.body, request.user) })
    },
    async list(request, response) {
      response.json({ success: true, ...await invoices.list(request.validated.query) })
    },
    async detail(request, response) {
      response.json({ success: true, data: await invoices.detail(request.validated.params.id) })
    },
    async prepare(request, response) {
      const data = await invoices.create({ orderId: request.validated.params.id }, request.user, { forAllocatedOrder: true })
      response.json({ success: true, data })
    },
    async pdf(request, response) {
      const invoice = await invoices.download(request.validated.params.id)
      const file = await invoicePdf(invoice, seller)
      const name = invoice.invoiceNumber.replace(/^DEMO-/, '').replace(/[^A-Za-z0-9_-]/g, '-')
      response.set('Cache-Control', 'private, no-store').attachment(name + '.pdf').send(file)
    },
    async issue(request, response) {
      const data = await invoices.issue(request.validated.params.id, request.validated.body, request.user)
      response.json({ success: true, data })
    },
  }
}
