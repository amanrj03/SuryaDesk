import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { customersController } from './customers.controller.js'
import * as schema from './customers.schema.js'
import { customersService } from './customers.service.js'

export function customersRoutes(db, auth) {
  const router = Router()
  const controller = customersController(customersService(db))
  router.use('/customers', authenticate(auth))
  router.get('/customers', validate({ query: schema.query }), controller.list)
  router.get('/customers/:id', validate({ params: schema.params }), controller.detail)
  return router
}
