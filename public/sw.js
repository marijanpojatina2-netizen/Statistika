/* Service worker — potpuno offline radi u dvorani bez interneta. */
const CACHE = 'ks-v1'

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE)
    // Ljuska aplikacije; ostalo se kesira pri prvom dohvatu.
    await c.addAll(['./', './manifest.webmanifest', './icon-192.png', './icon-512.png']).catch(() => {})
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Navigacija: prvo mreza, pa kes (da nova verzija dođe kad ima interneta).
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req)
        const c = await caches.open(CACHE)
        c.put('./', res.clone())
        return res
      } catch {
        const c = await caches.open(CACHE)
        return (await c.match('./')) || (await c.match(req)) || Response.error()
      }
    })())
    return
  }

  // Resursi: prvo kes (imena su hashirana pa nema zastarjelosti).
  e.respondWith((async () => {
    const c = await caches.open(CACHE)
    const hit = await c.match(req)
    if (hit) return hit
    try {
      const res = await fetch(req)
      if (res.ok) c.put(req, res.clone())
      return res
    } catch {
      return hit || Response.error()
    }
  })())
})
