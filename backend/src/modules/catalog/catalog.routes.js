import { Router } from 'express'
import { authenticate, authorize } from '../../middleware/authenticate.js'
import { validate } from '../../middleware/validate.js'
import { catalogController } from './catalog.controller.js'
import * as schema from './catalog.schema.js'
import { catalogService } from './catalog.service.js'

export function catalogRoutes(database, auth) {
  const router = Router()
  const controller = catalogController(catalogService(database))
  const read = authorize('catalog:read')
  const manage = authorize('catalog:manage')
  router.use(['/products', '/packages'], authenticate(auth))
  router.get('/products', read, validate({ query: schema.products }), controller.products)
  router.get('/packages', read, validate({ query: schema.packages }), controller.packages)
  router.get('/packages/:id', read, validate({ params: schema.params }), controller.packageDetail)
  router.post('/products', manage, validate({ body: schema.product }), controller.createProduct)
  router.patch('/products/:id', manage, validate({ params: schema.params, body: schema.productPatch }), controller.updateProduct)
  router.post('/packages', manage, validate({ body: schema.packageBody }), controller.createPackage)
  router.patch('/packages/:id', manage, validate({ params: schema.params, body: schema.packagePatch }), controller.updatePackage)
  return router
}
