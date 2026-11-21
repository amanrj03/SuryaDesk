import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { quotesController } from './quotes.controller.js'
import * as schema from './quotes.schema.js'
import { quotesService } from './quotes.service.js'

export function quotesRoutes(database, auth) {
  const router = Router()
  const controller = quotesController(quotesService(database))
  router.use('/quotes', authenticate(auth))
  router.post('/quotes', authorize('quotes:create'), validate({ body: schema.create }), controller.create)
  router.get('/quotes', authorize('quotes:read'), validate({ query: schema.list }), controller.list)
  router.get('/quotes/:id', authorize('quotes:read'), validate({ params: schema.params }), controller.detail)
  for (const action of ['send', 'accept', 'reject']) {
    router.post('/quotes/:id/' + action, authorize(action === 'send' ? 'quotes:send' : 'quotes:accept'),
      validate({ params: schema.params, body: schema[action] }), controller[action])
  }
  return router
}
