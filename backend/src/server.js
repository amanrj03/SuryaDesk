import { createApp } from './app.js'
import { readRuntimeConfig } from './config/env.js'
import { createDatabase } from './lib/prisma.js'

const config = readRuntimeConfig()
const database = createDatabase(config.DATABASE_URL)
await database.$connect()
const server = createApp(config, database).listen(config.PORT, () => {
  console.log(`SuryaDesk API listening on port ${config.PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async error => {
      await database.$disconnect()
      if (error) {
        console.error(error)
        process.exitCode = 1
      }
    })
  })
}
