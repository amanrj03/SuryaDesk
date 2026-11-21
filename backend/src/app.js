import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { errorHandler } from './middleware/errorHandler.js'

export function createApp({ CORS_ORIGIN }) {
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
  app.use((_request, response) => {
    response.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint not found.', details: null },
    })
  })
  app.use(errorHandler)

  return app
}
