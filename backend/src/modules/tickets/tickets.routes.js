import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { ticketsController } from './tickets.controller.js'
import * as schema from './tickets.schema.js'
import { ticketsService } from './tickets.service.js'

export function ticketsRoutes(db, auth) {
  const router = Router()
  const controller = ticketsController(ticketsService(db))
  const read = authorize('tickets:read')
  const manage = authorize('tickets:manage')
  router.use('/tickets', authenticate(auth))
  router.get('/tickets', read, validate({ query: schema.query }), controller.list)
  router.get('/tickets/:id', read, validate({ params: schema.params }), controller.detail)
  router.post('/tickets', authorize('tickets:create'), validate({ body: schema.create }), controller.create)
  router.patch('/tickets/:id', manage, validate({ params: schema.params, body: schema.update }), controller.update)
  router.post('/tickets/:id/parts', manage, validate({ params: schema.params, body: schema.part }), controller.part)
  router.post('/tickets/:id/replace', manage, validate({ params: schema.params, body: schema.replacement }), controller.replace)
  router.post('/tickets/:id/resolve', authorize('tickets:resolve'),
    validate({ params: schema.params, body: schema.resolve }), controller.resolve)
  router.post('/tickets/:id/confirm', authorize('tickets:confirm'),
    validate({ params: schema.params, body: schema.confirm }), controller.confirm)
  return router
}
