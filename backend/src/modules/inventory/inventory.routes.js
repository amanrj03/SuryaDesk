import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { inventoryController } from './inventory.controller.js'
import * as schema from './inventory.schema.js'
import { inventoryService } from './inventory.service.js'

export function inventoryRoutes(db, auth) {
  const router = Router()
  const staff = authenticate(auth)
  const controller = inventoryController(inventoryService(db))
  router.get('/inventory', staff, authorize('inventory:read'), validate({ query: schema.inventory }), controller.inventory)
  router.get('/assets', staff, authorize('inventory:read'), validate({ query: schema.assets }), controller.assets)
  router.post('/inventory/receipts', staff, authorize('inventory:write'), validate({ body: schema.receipt }), controller.receive)
  return router
}
