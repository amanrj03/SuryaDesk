import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'

const seedEnvFile = new URL('../../backend/.env', import.meta.url)
const roleNames = ['admin', 'director', 'sales', 'surveyor', 'warehouse', 'technician', 'support', 'finance']
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function demoAccounts() {
  return {
    name: 'suryadesk-local-demo-accounts',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__suryadesk/demo-accounts', async (request, response) => {
        response.setHeader('Cache-Control', 'no-store')
        const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(request.headers.host ?? '')
        const forwarded = request.headers.forwarded || request.headers['x-forwarded-for'] || request.headers['x-forwarded-host']
        if (request.method !== 'GET' || !localHost || forwarded ||
            !loopbackAddresses.has(request.socket.remoteAddress) ||
            request.headers['sec-fetch-site'] !== 'same-origin') {
          response.statusCode = 404
          response.end()
          return
        }

        const config = await readFile(seedEnvFile, 'utf8').then(parseEnv).catch(() => ({}))
        const password = process.env.SEED_DEMO_PASSWORD ?? config.SEED_DEMO_PASSWORD
        if (!password || process.env.NODE_ENV === 'production' || config.NODE_ENV === 'production') {
          response.statusCode = 404
          response.end()
          return
        }

        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({
          password,
          accounts: roleNames.map(role => ({ role, email: role + '@demo.suryadesk.test' })),
        }))
      })
    },
  }
}
