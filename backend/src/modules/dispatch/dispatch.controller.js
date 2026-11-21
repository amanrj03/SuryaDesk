export function dispatchController(service) {
  const action = method => async (request, response) => {
    const data = await service[method](request.validated.params.id, request.validated.body, request.user)
    response.json({ success: true, data })
  }
  return {
    async list(request, response) {
      response.json({ success: true, ...await service.list(request.validated.query) })
    },
    async detail(request, response) {
      response.json({ success: true, data: await service.detail(request.validated.params.id) })
    },
    async allocationOptions(request, response) {
      response.json({ success: true, data: await service.allocationOptions(request.validated.params.id) })
    },
    async draft(request, response) {
      const { row, created } = await service.draft(request.validated.params.id, request.validated.body, request.user)
      response.status(created ? 201 : 200).json({ success: true, data: row })
    },
    allocate: action('allocate'),
    dispatch: action('dispatch'),
    deliver: action('deliver'),
  }
}
