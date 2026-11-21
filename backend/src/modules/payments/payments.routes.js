import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { paymentsController } from './payments.controller.js'
import * as schema from './payments.schema.js'
import { paymentsService } from './payments.service.js'

export function paymentsRoutes(db, auth) {
  const router = Router()
  const staff = authenticate(auth)
  const controller = paymentsController(paymentsService(db))
  router.post('/orders/:id/payments', staff, authorize('payments:record'),
    validate({ params: schema.params, body: schema.payment }), controller.record)
  router.get('/orders/:id/payments', staff, authorize('payments:read'),
    validate({ params: schema.params }), controller.orderPayments)
  router.get('/payments', staff, authorize('payments:read'),
    validate({ query: schema.query }), controller.list)
  return router
}
