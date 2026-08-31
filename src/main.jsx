import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// ---------------------------------------------------------------------------
// Mobitel u LANDSCAPEU dobiva identičan raspored kao tablet, samo skaliran:
// viewport se postavi na fiksnih 1120px pa preglednik sve proporcionalno
// smanji da stane u širinu ekrana. U portraitu ostaje pravi mobilni raspored.
// ---------------------------------------------------------------------------
const LANDSCAPE_LAYOUT_WIDTH = 1120
const isPhone = () => Math.min(window.screen.width, window.screen.height) < 620

function applyViewport() {
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  const landscape = window.matchMedia('(orientation: landscape)').matches
  meta.setAttribute('content', isPhone() && landscape
    ? `width=${LANDSCAPE_LAYOUT_WIDTH}, user-scalable=no, viewport-fit=cover`
    : 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
}
applyViewport()
window.matchMedia('(orientation: landscape)').addEventListener('change', applyViewport)
window.addEventListener('orientationchange', applyViewport)

createRoot(document.getElementById('root')).render(<App />)

// Registracija service workera — aplikacija radi potpuno offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
