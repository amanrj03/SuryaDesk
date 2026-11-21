export function procurementController(service) {
  return {
    async suppliers(request, response) {
      response.json({ success: true, ...await service.suppliers(request.validated.query) })
    },
    async createSupplier(request, response) {
      response.status(201).json({ success: true, data: await service.createSupplier(request.validated.body) })
    },
    async purchases(request, response) {
      response.json({ success: true, ...await service.purchases(request.validated.query) })
    },
    async create(request, response) {
      response.status(201).json({ success: true, data: await service.create(request.validated.body, request.user) })
    },
    async order(request, response) {
      response.json({ success: true, data: await service.order(request.validated.params.id, request.user) })
    },
    async receive(request, response) {
      const data = await service.receive(request.validated.params.id, request.validated.body, request.user)
      response.json({ success: true, data })
    },
  }
}
