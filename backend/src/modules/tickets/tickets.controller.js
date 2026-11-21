export function ticketsController(tickets) {
  const action = (method, status = 200) => async (request, response) => {
    const data = await tickets[method](request.validated.params.id, request.validated.body, request.user)
    response.status(status).json({ success: true, data })
  }
  return {
    async create(request, response) {
      response.status(201).json({ success: true, data: await tickets.create(request.validated.body, request.user) })
    },
    async list(request, response) {
      response.json({ success: true, ...await tickets.list(request.validated.query, request.user) })
    },
    async detail(request, response) {
      response.json({ success: true, data: await tickets.detail(request.validated.params.id, request.user) })
    },
    update: action('update'),
    part: action('part', 201),
    replace: action('replace', 201),
    resolve: action('resolve'),
    confirm: action('confirm'),
  }
}
