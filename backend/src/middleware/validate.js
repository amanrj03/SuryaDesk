import { ApiError } from '../utils/ApiError.js'

export function validate(schemas) {
  return (request, _response, next) => {
    request.validated = {}
    for (const [key, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(request[key])
      if (!result.success) {
        return next(new ApiError(400, 'VALIDATION_ERROR', 'Check the supplied fields.',
          result.error.issues.map(({ path, message }) => ({ path, message }))))
      }
      request.validated[key] = result.data
    }
    next()
  }
}
