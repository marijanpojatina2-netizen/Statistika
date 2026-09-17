// Proxy prema FIBA LiveStats (Genius Sports) — njihov server ne dopušta
// čitanje izravno iz preglednika (CORS), pa aplikacija ide kroz nas.
// Kešira se 10 s na CDN-u da live praćenje ne tuče njihov servis.
// Bez prijave: proksira isključivo javne podatke lige (i middleware ga pušta).
export default async function handler(req, res) {
  const id = String(req.query.id || '').replace(/\D/g, '')
  if (!id || id.length < 5 || id.length > 10) return res.status(400).json({ ok: false, error: 'bad-id' })
  try {
    const r = await fetch(`https://fibalivestats.dcd.shared.geniussports.com/data/${id}/data.json`, {
      cache: 'no-store',
      headers: {
        // Genius zna odbijati zahtjeve bez browserskih zaglavlja
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        Accept: 'application/json, text/javascript, */*',
        Referer: `https://fibalivestats.dcd.shared.geniussports.com/u/HKS/${id}/`,
      },
    })
    if (!r.ok) return res.status(502).json({ ok: false, error: `fiba-${r.status}` })
    const data = await r.json()
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30')
    return res.status(200).json(data)
  } catch (e) {
    return res.status(502).json({ ok: false, error: `upstream:${String(e && e.message ? e.message : e).slice(0, 80)}` })
  }
}
