import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { procurementController } from './procurement.controller.js'
import * as schema from './procurement.schema.js'
import { procurementService } from './procurement.service.js'

export function procurementRoutes(db, auth) {
  const router = Router()
  const controller = procurementController(procurementService(db))
  const read = authorize('inventory:read')
  const write = authorize('inventory:write')
  router.use(['/suppliers', '/purchases'], authenticate(auth))
  router.get('/suppliers', read, validate({ query: schema.query }), controller.suppliers)
  router.post('/suppliers', write, validate({ body: schema.supplier }), controller.createSupplier)
  router.get('/purchases', read, validate({ query: schema.orders }), controller.purchases)
  router.post('/purchases', write, validate({ body: schema.purchase }), controller.create)
  router.post('/purchases/:id/order', write, validate({ params: schema.params }), controller.order)
  router.post('/purchases/:id/receive', write, validate({ params: schema.params, body: schema.receipt }), controller.receive)
  return router
}
