// POST { name, password } → postavlja kolačić ks_auth (vrijedi 180 dana).
// Lozinka je zajednička klupska (STAT_PASS u Vercelu); ime trenera se pamti
// na uređaju i upisuje uz svaku spremljenu utakmicu.
import { authToken, passMatches } from './_lib/utils.js'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' })
  const { password } = req.body || {}
  if (!passMatches(password)) return res.status(403).json({ ok: false, error: 'wrong-pass' })
  const pass = process.env.STAT_PASS
  if (pass) {
    res.setHeader('Set-Cookie',
      `ks_auth=${authToken(pass)}; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax`)
  }
  return res.status(200).json({ ok: true })
}
