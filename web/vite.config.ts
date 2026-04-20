import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/properties': 'http://localhost:8080',
      '/underwriting': 'http://localhost:8080',
      '/portfolio': 'http://localhost:8080',
      '/market': 'http://localhost:8080',
      '/search': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
})
