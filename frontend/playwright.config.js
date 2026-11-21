import { defineConfig } from '@playwright/test'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

loadEnvFile(fileURLToPath(new URL('../backend/.env', import.meta.url)))

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:55173', channel: 'msedge' },
  webServer: [
    {
      command: 'node --env-file=.env src/server.js',
      cwd: fileURLToPath(new URL('../backend', import.meta.url)),
      env: { PORT: '55300' },
      url: 'http://127.0.0.1:55300/api/v1/health',
      reuseExistingServer: false,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 55173',
      env: { SURYADESK_API_TARGET: 'http://127.0.0.1:55300' },
      url: 'http://127.0.0.1:55173/enquiry',
      reuseExistingServer: false,
    },
  ],
})
