import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { warrantiesController } from './warranties.controller.js'
import * as schema from './warranties.schema.js'
import { warrantiesService } from './warranties.service.js'

export function warrantiesRoutes(db, auth) {
  const router = Router()
  const staff = authenticate(auth)
  const read = authorize('warranties:read')
  const controller = warrantiesController(warrantiesService(db))
  router.get('/warranties', staff, read, validate({ query: schema.query }), controller.list)
  router.get('/assets/:serial/warranty', staff, read,
    validate({ params: schema.serial, query: schema.coverage }), controller.lookup)
  return router
}
