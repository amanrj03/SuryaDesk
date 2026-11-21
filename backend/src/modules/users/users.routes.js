import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { usersController } from './users.controller.js'
import * as schema from './users.schema.js'
import { usersService } from './users.service.js'

export function usersRoutes(db, auth) {
  const router = Router()
  const controller = usersController(usersService(db))
  const manage = authorize('users:manage')
  router.use('/users', authenticate(auth))
  router.get('/users/options', validate({ query: schema.options }), controller.options)
  router.get('/users', manage, validate({ query: schema.list }), controller.list)
  router.post('/users', manage, validate({ body: schema.create }), controller.create)
  router.patch('/users/:id', manage, validate({ params: schema.params, body: schema.update }), controller.update)
  return router
}
