import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base se postavlja preko env varijable radi GitHub Pages (/Statistika/)
export default defineConfig({
  plugins: [react()],
  // Relativna baza: ista se objava služi i na / i na /statistika/.
  // GitHub Pages workflow i dalje šalje APP_BASE=/Statistika/.
  base: process.env.APP_BASE || (process.env.VERCEL ? '/stats/' : './'),
  build: { outDir: 'dist' },
})
