export function ordersController(orders) {
  return {
    async convert(request, response) {
      const { order, created } = await orders.convert(request.validated.params.id, request.validated.body, request.user)
      response.status(created ? 201 : 200).json({ success: true, data: order })
    },
    async cost(request, response) {
      const data = await orders.cost(request.validated.params.id, request.validated.body, request.user)
      response.status(201).json({ success: true, data })
    },
    async list(request, response) {
      response.json({ success: true, ...await orders.list(request.validated.query) })
    },
    async detail(request, response) {
      response.json({ success: true, data: await orders.detail(request.validated.params.id) })
    },
  }
}
