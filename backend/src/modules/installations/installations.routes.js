import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { installationsController } from './installations.controller.js'
import * as schema from './installations.schema.js'
import { installationsService } from './installations.service.js'

export function installationsRoutes(db, auth) {
  const router = Router()
  const controller = installationsController(installationsService(db))
  const read = authorize('installations:read')
  router.use('/installations', authenticate(auth))
  router.get('/installations', read, validate({ query: schema.query }), controller.list)
  router.get('/installations/:id', read, validate({ params: schema.params }), controller.detail)
  router.patch('/installations/:id', read, validate({ params: schema.params, body: schema.update }), controller.update)
  router.post('/installations/:id/complete', authorize('installations:complete_assigned'),
    validate({ params: schema.params, body: schema.complete }), controller.complete)
  return router
}
