import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { params } from './orders.schema.js'
import { trackingService } from './tracking.service.js'

const lookup = z.strictObject({ token: z.string().trim().min(1).max(2048) })

export function trackingRoutes(db, auth, secret) {
  const router = Router()
  const tracking = trackingService(db, secret)
  const limit = rateLimit({
    windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, error: { message: 'Too many tracking requests. Try again in a minute.' } },
  })
  router.post('/orders/:id/tracking-link', authenticate(auth), authorize('orders:share_tracking'),
    validate({ params }), async (request, response) => {
      response.set('Cache-Control', 'no-store')
      response.json({ success: true, data: await tracking.issue(request.validated.params.id) })
    })
  router.post('/public/tracking', limit, validate({ body: lookup }), async (request, response) => {
    response.set('Cache-Control', 'no-store')
    response.json({ success: true, data: await tracking.lookup(request.validated.body.token) })
  })
  return router
}
