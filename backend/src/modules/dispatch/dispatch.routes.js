import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { dispatchController } from './dispatch.controller.js'
import * as schema from './dispatch.schema.js'
import { dispatchService } from './dispatch.service.js'

export function dispatchRoutes(db, auth) {
  const router = Router()
  const staff = authenticate(auth)
  const controller = dispatchController(dispatchService(db))
  const prepare = authorize('dispatch:prepare')
  router.post('/orders/:id/dispatches', staff, prepare,
    validate({ params: schema.params, body: schema.draft }), controller.draft)
  router.use('/dispatches', staff)
  router.get('/dispatches', prepare, validate({ query: schema.query }), controller.list)
  router.get('/dispatches/:id', prepare, validate({ params: schema.params }), controller.detail)
  router.get('/dispatches/:id/allocation-options', authorize('dispatch:allocate'),
    validate({ params: schema.params }), controller.allocationOptions)
  router.post('/dispatches/:id/allocate', authorize('dispatch:allocate'),
    validate({ params: schema.params, body: schema.allocation }), controller.allocate)
  router.post('/dispatches/:id/dispatch', authorize('dispatch:complete'),
    validate({ params: schema.params, body: schema.dispatch }), controller.dispatch)
  router.post('/dispatches/:id/deliver', authorize('dispatch:deliver'),
    validate({ params: schema.params, body: schema.deliver }), controller.deliver)
  return router
}
