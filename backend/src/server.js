import { createApp } from './app.js'
import { readConfig } from './config/env.js'

const config = readConfig()
const server = createApp(config).listen(config.PORT, () => {
  console.log(`SuryaDesk API listening on port ${config.PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(error => {
      if (error) {
        console.error(error)
        process.exitCode = 1
      }
    })
  })
}
