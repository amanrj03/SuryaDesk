import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { invoiceController } from './invoices.controller.js'
import * as schema from './invoices.schema.js'
import { invoiceService } from './invoices.service.js'

export function invoiceRoutes(db, auth) {
  const router = Router()
  const controller = invoiceController(invoiceService(db))
  const read = authorize('invoices:read')
  const manage = authorize('invoices:manage')
  router.use('/invoices', authenticate(auth))
  router.get('/invoices', read, validate({ query: schema.query }), controller.list)
  router.get('/invoices/:id', read, validate({ params: schema.params }), controller.detail)
  router.post('/invoices', manage, validate({ body: schema.create }), controller.create)
  router.post('/invoices/:id/issue', manage, validate({ params: schema.params, body: schema.issue }), controller.issue)
  return router
}
