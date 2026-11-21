export function leadsController(leads) {
  const success = (response, data, status = 200) => response.status(status).json({ success: true, data })
  return {
    async enquiry(request, response) {
      const { leadNumber, status } = await leads.create(request.validated.body)
      success(response, { leadNumber, status }, 201)
    },
    async create(request, response) {
      success(response, await leads.create(request.validated.body, request.user.id), 201)
    },
    async list(request, response) {
      response.json({ success: true, ...await leads.list(request.validated.query, request.user) })
    },
    async detail(request, response) {
      success(response, await leads.detail(request.validated.params.id, request.user))
    },
    async update(request, response) {
      success(response, await leads.update(request.validated.params.id, request.validated.body, request.user))
    },
    async activity(request, response) {
      success(response, await leads.addActivity(request.validated.params.id, request.validated.body, request.user), 201)
    },
  }
}
