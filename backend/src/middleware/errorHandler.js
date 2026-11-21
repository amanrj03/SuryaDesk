import { Prisma } from '@prisma/client'
import { ApiError } from '../utils/ApiError.js'

export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error)

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') error = new ApiError(409, 'CONFLICT', 'A record with these details already exists.')
    if (error.code === 'P2025') error = new ApiError(404, 'NOT_FOUND', 'Record not found.')
  }

  if (error instanceof ApiError) {
    return response.status(error.status).json({ success: false, error: {
      code: error.code, message: error.message, details: error.details,
    } })
  }

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
