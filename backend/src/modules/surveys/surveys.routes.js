import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { surveysController } from './surveys.controller.js'
import * as schema from './surveys.schema.js'
import { surveysService } from './surveys.service.js'

export function surveysRoutes(database, auth) {
  const router = Router()
  const requireStaff = authenticate(auth)
  const controller = surveysController(surveysService(database))
  router.post('/leads/:id/surveys', requireStaff, authorize('surveys:schedule'),
    validate({ params: schema.params, body: schema.schedule }), controller.schedule)
  router.use('/surveys', requireStaff)
  router.get('/surveys', authorize('surveys:read'), validate({ query: schema.list }), controller.list)
  router.get('/surveys/:id', authorize('surveys:read'), validate({ params: schema.params }), controller.detail)
  router.patch('/surveys/:id', authorize('surveys:record'),
    validate({ params: schema.params, body: schema.record }), controller.record)
  router.post('/surveys/:id/approve', authorize('surveys:approve'),
    validate({ params: schema.params, body: schema.approval }), controller.approve)
  return router
}
