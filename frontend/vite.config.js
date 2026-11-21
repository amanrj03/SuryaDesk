import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': (process.env.SURYADESK_API_TARGET ?? 'http://localhost:3000') },
  },
})
