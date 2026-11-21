export function warrantiesController(warranties) {
  return {
    async lookup(request, response) {
      const data = await warranties.lookup(request.validated.params.serial, request.validated.query)
      response.json({ success: true, data })
    },
    async list(request, response) {
      response.json({ success: true, ...await warranties.list(request.validated.query) })
    },
  }
}
