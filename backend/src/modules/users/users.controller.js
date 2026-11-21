export function usersController(users) {
  return {
    async list(request, response) {
      response.json({ success: true, ...await users.list(request.validated.query) })
    },
    async options(request, response) {
      const data = await users.options(request.validated.query.kind, request.user)
      response.json({ success: true, data })
    },
    async create(request, response) {
      response.status(201).json({ success: true, data: await users.create(request.validated.body, request.user) })
    },
    async update(request, response) {
      const data = await users.update(request.validated.params.id, request.validated.body, request.user)
      response.json({ success: true, data })
    },
  }
}
