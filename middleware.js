/**
 * Vercel Edge Middleware — zaključava aplikaciju lozinkom.
 *
 * Umjesto sirovog browser-popupa (Basic Auth) prijava ide preko vlastitog
 * login ekrana (/login.html): trener upiše ime i klupsku lozinku, server
 * postavi kolačić ks_auth i sve dalje prolazi bez pitanja (180 dana).
 *
 * Postavke u Vercelu (Project → Settings → Environment Variables):
 *   STAT_PASS = zajednička lozinka za trenere (OBAVEZNO — bez nje je otvoreno)
 *
 * Offline i dalje radi: service worker kešira aplikaciju nakon prve prijave,
 * pa u dvorani bez interneta middleware uopće nije na putu.
 */
export const config = { matcher: '/(.*)' }

// Bez prijave smiju samo login ekran i ono što mu treba za prikaz.
const OPEN = [
  /^\/login\.html$/,
  /^\/api\/login$/,
  /^\/fonts\.css$/,
  /^\/fonts\//,
  /^\/crest\.(jpg|png)$/,
  /^\/icon-192\.png$/,
]

async function authToken(pass) {
  const data = new TextEncoder().encode(`ks-auth-v1|${pass}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function cookie(request, name) {
  const raw = request.headers.get('cookie') || ''
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

export default async function middleware(request) {
  const pass = process.env.STAT_PASS
  if (!pass) return // lozinka još nije postavljena — pusti (i postavi je!)

  const url = new URL(request.url)
  // Ista aplikacija živi i na /stats/… i /statistika/… (rewrite) — makni prefiks za provjeru.
  const m = url.pathname.match(/^\/(stats|statistika)(?=\/|$)/)
  const prefix = m ? m[0] : ''
  const path = (prefix ? url.pathname.slice(prefix.length) : url.pathname) || '/'

  if (OPEN.some((re) => re.test(path))) return

  const tok = cookie(request, 'ks_auth')
  if (tok && tok === await authToken(pass)) return

  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: false, error: 'auth' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }
  const login = `${prefix}/login.html`
  return Response.redirect(new URL(login, request.url), 302)
}
