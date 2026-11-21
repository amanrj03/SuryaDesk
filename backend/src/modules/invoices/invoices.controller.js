export function invoiceController(invoices) {
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
    async issue(request, response) {
      const data = await invoices.issue(request.validated.params.id, request.validated.body, request.user)
      response.json({ success: true, data })
    },
  }
}
