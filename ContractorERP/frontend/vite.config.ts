import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// In development the React app runs on :5173 and forwards /api to the .NET API,
// so the browser sees one origin (same as production).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5080',
      '/health': 'http://localhost:5080',
    },
  },
  test: {
    environment: 'node',
  },
})
