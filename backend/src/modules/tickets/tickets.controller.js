export function ticketsController(tickets) {
  const action = (method, status = 200) => async (request, response) => {
    const data = await tickets[method](request.validated.params.id, request.validated.body, request.user)
    response.status(status).json({ success: true, data })
  }
  return {
    async labourRate(_request, response) {
      response.json({ success: true, data: await tickets.labourRate() })
    },
    async updateLabourRate(request, response) {
      response.json({ success: true, data: await tickets.updateLabourRate(request.validated.body, request.user) })
    },
    async create(request, response) {
      response.status(201).json({ success: true, data: await tickets.create(request.validated.body, request.user) })
    },
    async list(request, response) {
      response.json({ success: true, ...await tickets.list(request.validated.query, request.user) })
    },
    async detail(request, response) {
      response.json({ success: true, data: await tickets.detail(request.validated.params.id, request.user) })
    },
    async partOptions(request, response) {
      response.json({ success: true, data: await tickets.partOptions(request.validated.params.id, request.user) })
    },
    update: action('update'),
    part: action('part', 201),
    replace: action('replace', 201),
    reportRepair: action('reportRepair'),
    resolve: action('resolve'),
    confirm: action('confirm'),
  }
}
