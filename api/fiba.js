// Proxy prema FIBA LiveStats (Genius Sports) — njihov server ne dopušta
// čitanje izravno iz preglednika (CORS), pa aplikacija ide kroz nas.
// Kešira se 10 s na CDN-u da live praćenje ne tuče njihov servis.
import { requireAuth } from './_lib/utils.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  const id = String(req.query.id || '').replace(/\D/g, '')
  if (!id || id.length < 5 || id.length > 10) return res.status(400).json({ ok: false, error: 'bad-id' })
  try {
    const r = await fetch(`https://fibalivestats.dcd.shared.geniussports.com/data/${id}/data.json`, { cache: 'no-store' })
    if (!r.ok) return res.status(404).json({ ok: false, error: 'not-found' })
    const data = await r.json()
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30')
    return res.status(200).json(data)
  } catch {
    return res.status(502).json({ ok: false, error: 'upstream' })
  }
}
