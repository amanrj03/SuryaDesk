export function surveysController(surveys) {
  return {
    async schedule(request, response) {
      const data = await surveys.schedule(request.validated.params.id, request.validated.body, request.user)
      response.status(201).json({ success: true, data })
    },
    async list(request, response) {
      response.json({ success: true, ...await surveys.list(request.validated.query, request.user) })
    },
    async detail(request, response) {
      const data = await surveys.detail(request.validated.params.id, request.user)
      response.json({ success: true, data })
    },
    async record(request, response) {
      const data = await surveys.record(request.validated.params.id, request.validated.body, request.user)
      response.json({ success: true, data })
    },
    async approve(request, response) {
      const data = await surveys.approve(request.validated.params.id, request.validated.body, request.user)
      response.json({ success: true, data })
    },
  }
}
