import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const buildTime = String(Date.now());

// https://vite.dev/config/
// No proxy needed — apifootball.com uses query param auth (no CORS issues)
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'generate-version-file',
      closeBundle() {
        try {
          const distDir = path.resolve(__dirname, 'dist');
          if (fs.existsSync(distDir)) {
            fs.writeFileSync(path.join(distDir, 'version.txt'), buildTime);
            console.log(`\n=== Generated version.txt with build timestamp: ${buildTime} ===\n`);
          }
        } catch (e) {
          console.error('Failed to generate version.txt:', e);
        }
      }
    }
  ],
  define: {
    __APP_VERSION__: JSON.stringify(buildTime),
  }
})

