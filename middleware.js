/**
 * Vercel Edge Middleware — zaključava cijelu aplikaciju lozinkom (HTTP Basic).
 *
 * Postavke u Vercelu (Project → Settings → Environment Variables):
 *   STAT_PASS = lozinka koju treneri upisuju (OBAVEZNO — bez nje je stranica otvorena)
 *   STAT_USER = korisničko ime (neobavezno, zadano "dinamo")
 *
 * Radi i offline: nakon prve prijave service worker kešira aplikaciju, pa u
 * dvorani bez interneta ništa ne pita.
 */
export const config = { matcher: '/(.*)' }

export default function middleware(request) {
  const pass = process.env.STAT_PASS
  if (!pass) return // lozinka još nije postavljena — pusti (i postavi je!)

  const user = process.env.STAT_USER || 'dinamo'
  const header = request.headers.get('authorization') || ''
  if (header.startsWith('Basic ')) {
    try {
      const [u, p] = atob(header.slice(6)).split(':')
      if (u === user && p === pass) return
    } catch { /* neispravno zaglavlje — traži prijavu */ }
  }
  return new Response('Potrebna je prijava.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="KK Dinamo statistika", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
