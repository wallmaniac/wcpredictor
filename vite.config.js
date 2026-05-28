import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// No proxy needed — apifootball.com uses query param auth (no CORS issues)
export default defineConfig({
  plugins: [react()],
})
