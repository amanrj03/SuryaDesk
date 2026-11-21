export function quotesController(quotes) {
  const transition = status => async (request, response) => {
    const data = await quotes.transition(request.validated.params.id, status, request.validated.body, request.user)
    response.json({ success: true, data })
  }
  return {
    async create(request, response) {
      const data = await quotes.create(request.validated.body, request.user)
      response.status(201).json({ success: true, data })
    },
    async list(request, response) {
      response.json({ success: true, ...await quotes.list(request.validated.query) })
    },
    async detail(request, response) {
      response.json({ success: true, data: await quotes.detail(request.validated.params.id) })
    },
    send: transition('SENT'),
    accept: transition('ACCEPTED'),
    reject: transition('REJECTED'),
  }
}
