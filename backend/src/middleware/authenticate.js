import { ApiError } from '../utils/ApiError.js'

export function authenticate(auth) {
  return async (request, _response, next) => {
    const token = request.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    request.user = await auth.verify(token)
    next()
  }
}

export function authorize(capability) {
  return (request, _response, next) => {
    if (!request.user?.capabilities.includes(capability)) {
      return next(new ApiError(403, 'FORBIDDEN', 'You do not have permission for this action.'))
    }
    next()
  }
}
