import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { installationsRoutes } from './modules/installations/installations.routes.js'
import { attachmentsRoutes } from './modules/attachments/attachments.routes.js'
import { warrantiesRoutes } from './modules/warranties/warranties.routes.js'
import { dispatchRoutes } from './modules/dispatch/dispatch.routes.js'
import { inventoryRoutes } from './modules/inventory/inventory.routes.js'
import { paymentsRoutes } from './modules/payments/payments.routes.js'
import { ordersRoutes } from './modules/orders/orders.routes.js'
import { quotesRoutes } from './modules/quotes/quotes.routes.js'
import { catalogRoutes } from './modules/catalog/catalog.routes.js'
import { surveysRoutes } from './modules/surveys/surveys.routes.js'
import { leadsRoutes } from './modules/leads/leads.routes.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { authService } from './modules/auth/auth.service.js'
import { errorHandler } from './middleware/errorHandler.js'

export function createApp({ CORS_ORIGIN, JWT_SECRET }, database) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      callback(null, origin === CORS_ORIGIN)
    },
    credentials: true,
  }))
  app.use(express.json({ limit: '64kb' }))

  app.get('/api/v1/health', (_request, response) => {
    response.json({ success: true, data: { status: 'ok' } })
  })
  if (database) {
    const auth = authService(database, JWT_SECRET)
    app.use('/api/v1/auth', authRoutes(auth))
    app.use('/api/v1', installationsRoutes(database, auth))
    app.use('/api/v1', attachmentsRoutes(database, auth))
    app.use('/api/v1', warrantiesRoutes(database, auth))
    app.use('/api/v1', dispatchRoutes(database, auth))
    app.use('/api/v1', inventoryRoutes(database, auth))
    app.use('/api/v1', paymentsRoutes(database, auth))
    app.use('/api/v1', ordersRoutes(database, auth))
    app.use('/api/v1', quotesRoutes(database, auth))
    app.use('/api/v1', catalogRoutes(database, auth))
    app.use('/api/v1', surveysRoutes(database, auth))
    app.use('/api/v1', leadsRoutes(database, auth))
  }

  app.use((_request, response) => {
    response.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint not found.', details: null },
    })
  })
  app.use(errorHandler)

  return app
}
