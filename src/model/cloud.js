// ---------------------------------------------------------------------------
// Oblak — zajednička arhiva i predlošci za sve trenere (Vercel API + Blob).
//
// Relativne putanje ("api/…") rade i na / i na /statistika/. Kad backenda
// nema (GitHub Pages, lokalni preview), pozivi vraćaju HTML/404 pa se
// aplikacija uredno prebaci u lokalni način rada.
// ---------------------------------------------------------------------------

export class CloudError extends Error {
  constructor(reason) { super(reason); this.reason = reason }
}

// Na kkdinamo.hr/stats dokument je BEZ završne kose crte, pa bi relativni
// "api/…" promašio proxy — putanja se zato gradi iz Viteove baze ('/stats/').
const BASE = import.meta.env.BASE_URL

async function call(path, opts = {}) {
  let res
  try {
    res = await fetch(`${BASE}api/${path}`, { cache: 'no-store', ...opts })
  } catch {
    throw new CloudError('offline')
  }
  if (res.status === 401) {
    // Kolačić istekao ili obrisan — natrag na prijavu.
    window.location.href = `${BASE}login.html`
    throw new CloudError('auth')
  }
  if (res.status === 503) throw new CloudError('no-blob')
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) throw new CloudError('none') // nema backenda
  if (!res.ok) throw new CloudError('error')
  return res.json()
}

const post = (path, body) => call(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const cloudListGames = () => call('games')
export const cloudSaveGame = (game) => post('games', game)
export const cloudDeleteGame = (id) => call(`games?id=${encodeURIComponent(id)}`, { method: 'DELETE' })

export const cloudListTemplates = () => call('templates')
export const cloudSaveTemplate = (tpl) => post('templates', tpl)
export const cloudDeleteTemplate = (id) => call(`templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' })

// --- trener na ovom uređaju (upisan na login ekranu) -----------------------

export const getCoach = () => {
  try { return localStorage.getItem('ks.coach') || '' } catch { return '' }
}

export async function logoutCloud() {
  try { await fetch(`${BASE}api/logout`, { method: 'POST' }) } catch { /* offline — kolačić ostaje, svejedno vodi na login */ }
  window.location.href = `${BASE}login.html`
}
