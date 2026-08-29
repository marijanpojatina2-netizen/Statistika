import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base se postavlja preko env varijable radi GitHub Pages (/Statistika/)
export default defineConfig({
  plugins: [react()],
  base: process.env.APP_BASE || '/',
  build: { outDir: 'dist' },
})
