import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { reportsController } from './reports.controller.js'
import * as schema from './reports.schema.js'
import { reportsService } from './reports.service.js'

export function reportsRoutes(db, auth) {
  const router = Router()
  const controller = reportsController(reportsService(db))
  const view = authorize('reports:view')
  router.use('/reports', authenticate(auth))
  router.get('/reports/overview', view, validate({ query: schema.period }), controller.overview)
  router.get('/reports/operations', view, validate({ query: schema.period }), controller.operations)
  router.get('/reports/profitability', authorize('reports:financial'),
    validate({ query: schema.profitability }), controller.profitability)
  router.get('/reports/export', authorize('reports:export'), validate({ query: schema.exportQuery }), controller.export)
  return router
}
