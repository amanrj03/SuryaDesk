export function subsidiesController(subsidies) {
  return {
    async create(request, response) {
      const result = await subsidies.create(request.validated.body, request.user)
      response.status(result.existing ? 200 : 201).json({ success: true, data: result.data })
    },
    async list(request, response) {
      response.json({ success: true, ...await subsidies.list(request.validated.query) })
    },
    async detail(request, response) {
      response.json({ success: true, data: await subsidies.detail(request.validated.params.id) })
    },
    async update(request, response) {
      const data = await subsidies.update(request.validated.params.id, request.validated.body, request.user)
      response.json({ success: true, data })
    },
  }
}
