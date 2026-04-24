import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Every URL prefix the backend serves. When the browser hard-navigates to one
// of these (e.g. typing /settings into the address bar) we DON'T want Vite to
// proxy it — we want the SPA shell served so React Router can take over. When
// the frontend's JS makes a fetch call (Accept: application/json) we DO want
// it proxied to the backend at 8080.
const API_PATHS = [
  '/properties', '/underwriting', '/portfolio', '/market', '/markets',
  '/search', '/saved-searches', '/watchlists', '/health',
  '/clients', '/users', '/auth', '/copilot', '/reports',
  '/deal-rooms', '/alerts', '/settings', '/api', '/tour',
]

const bypassHtml = (req: { method?: string; headers: Record<string, string | string[] | undefined> }) => {
  const accept = req.headers.accept
  const acceptsHtml = typeof accept === 'string' && accept.includes('text/html')
  if (req.method === 'GET' && acceptsHtml) return '/index.html'
  return undefined
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      API_PATHS.map(p => [p, {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: bypassHtml,
      }])
    ),
  },
})
