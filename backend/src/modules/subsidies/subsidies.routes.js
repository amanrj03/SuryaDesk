import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { subsidiesController } from './subsidies.controller.js'
import * as schema from './subsidies.schema.js'
import { subsidiesService } from './subsidies.service.js'

export function subsidiesRoutes(db, auth) {
  const router = Router()
  const controller = subsidiesController(subsidiesService(db))
  const manage = authorize('subsidies:manage')
  router.use('/subsidies', authenticate(auth))
  router.get('/subsidies', authorize('subsidies:read'), validate({ query: schema.query }), controller.list)
  router.post('/subsidies', manage, validate({ body: schema.create }), controller.create)
  router.patch('/subsidies/:id', manage, validate({ params: schema.params, body: schema.update }), controller.update)
  return router
}
