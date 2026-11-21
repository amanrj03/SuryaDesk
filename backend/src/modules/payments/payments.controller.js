export function paymentsController(payments) {
  return {
    async record(request, response) {
      const { created, ...data } = await payments.record(request.validated.params.id, request.validated.body, request.user)
      response.status(created ? 201 : 200).json({ success: true, data })
    },
    async orderPayments(request, response) {
      response.json({ success: true, data: await payments.orderPayments(request.validated.params.id) })
    },
    async list(request, response) {
      response.json({ success: true, ...await payments.list(request.validated.query) })
    },
  }
}
