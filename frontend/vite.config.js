import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { demoAccounts } from './dev/demoAccounts.js'

export default defineConfig({
  plugins: [react(), tailwind(), demoAccounts()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': (process.env.SURYADESK_API_TARGET ?? 'http://localhost:3000') },
  },
})
