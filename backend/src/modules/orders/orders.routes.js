import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { ordersController } from './orders.controller.js'
import * as schema from './orders.schema.js'
import { ordersService } from './orders.service.js'

export function ordersRoutes(db, auth) {
  const router = Router()
  const staff = authenticate(auth)
  const orders = ordersController(ordersService(db))
  router.post('/quotes/:id/convert-to-order', staff, authorize('orders:create'),
    validate({ params: schema.params, body: schema.convert }), orders.convert)
  router.get('/orders', staff, authorize('orders:read'), validate({ query: schema.query }), orders.list)
  router.get('/orders/:id', staff, authorize('orders:read'), validate({ params: schema.params }), orders.detail)
  return router
}
