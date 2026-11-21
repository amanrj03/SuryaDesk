import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { ApiError } from '../../utils/ApiError.js'
import { leadsController } from './leads.controller.js'
import * as schema from './leads.schema.js'
import { leadsService } from './leads.service.js'

export function leadsRoutes(database, auth) {
  const router = Router()
  const leads = leadsController(leadsService(database))
  const limit = rateLimit({
    windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    handler(_request, _response, next) {
      next(new ApiError(429, 'RATE_LIMITED', 'Too many enquiries. Try again later.'))
    },
  })
  router.post('/public/enquiries', limit, validate({ body: schema.enquiry }), leads.enquiry)
  router.use('/leads', authenticate(auth))
  router.get('/leads', authorize('leads:read'), validate({ query: schema.query }), leads.list)
  router.post('/leads', authorize('leads:write'), validate({ body: schema.createLead }), leads.create)
  router.get('/leads/:id', authorize('leads:read'), validate({ params: schema.params }), leads.detail)
  router.patch('/leads/:id', authorize('leads:write'), validate({ params: schema.params, body: schema.patch }), leads.update)
  router.post('/leads/:id/activities', authorize('leads:write'), validate({ params: schema.params, body: schema.activity }), leads.activity)
  return router
}
