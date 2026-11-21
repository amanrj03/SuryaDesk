export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error)

  const malformed = error.type === 'entity.parse.failed'
  const oversized = error.type === 'entity.too.large'
  const status = malformed ? 400 : oversized ? 413 : 500
  const code = malformed ? 'INVALID_JSON' : oversized ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR'
  const message = malformed ? 'Request body must contain valid JSON.'
    : oversized ? 'Request body exceeds the allowed size.'
      : 'An unexpected error occurred.'

  if (status === 500) console.error(error)
  response.status(status).json({ success: false, error: { code, message, details: null } })
}
