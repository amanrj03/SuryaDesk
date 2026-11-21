import { createServer } from 'node:http'
import { createApp } from '../../backend/src/app.js'
import { readRuntimeConfig } from '../../backend/src/config/env.js'
import { createDatabase } from '../../backend/src/lib/prisma.js'

const config = readRuntimeConfig()
const database = createDatabase(config.DATABASE_URL)
const inbox = new Map()
const app = createApp(config, database, {
  sendCustomerEmail: async ({ email, message }) => inbox.set(email, message),
})

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  if (url.pathname !== '/__e2e/customer-code') return app(request, response)
  const email = url.searchParams.get('email')
  const code = inbox.get(email)?.match(/\b\d{6}\b/)?.[0]
  inbox.delete(email)
  response.writeHead(code ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ code }))
})

await database.$connect()
server.listen(config.PORT, '127.0.0.1')
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => database.$disconnect()))
}
