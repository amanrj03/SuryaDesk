export function authController(auth) {
  return {
    async login(request, response) {
      const data = await auth.login(request.validated.body)
      response.set('Cache-Control', 'no-store').json({ success: true, data })
    },
    me(request, response) {
      const { sessionId, ...data } = request.user
      response.set('Cache-Control', 'no-store').json({ success: true, data })
    },
    async logout(request, response) {
      await auth.logout(request.user.sessionId)
      response.json({ success: true, data: { loggedOut: true } })
    },
  }
}
