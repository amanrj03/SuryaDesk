import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { authenticate } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { ApiError } from '../../utils/ApiError.js'
import { authController } from './auth.controller.js'
import { loginBody } from './auth.schema.js'

export function authRoutes(auth) {
  const router = Router()
  const controller = authController(auth)
  const requireStaff = authenticate(auth)
  const limit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_request, _response, next) {
      next(new ApiError(429, 'RATE_LIMITED', 'Too many login attempts. Try again later.'))
    },
  })
  router.post('/login', limit, validate({ body: loginBody }), controller.login)
  router.get('/me', requireStaff, controller.me)
  router.post('/logout', requireStaff, controller.logout)
  return router
}
