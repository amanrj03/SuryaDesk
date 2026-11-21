export function installationsController(installations) {
  const action = method => async (request, response) => {
    const data = await installations[method](request.validated.params.id, request.validated.body, request.user)
    response.json({ success: true, data })
  }
  return {
    async list(request, response) {
      response.json({ success: true, ...await installations.list(request.validated.query, request.user) })
    },
    async detail(request, response) {
      response.json({ success: true, data: await installations.detail(request.validated.params.id, request.user) })
    },
    update: action('update'),
    complete: action('complete'),
  }
}
