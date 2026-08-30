// ---------------------------------------------------------------------------
// Zajedničko za sve API funkcije: provjera prijave (kolačić ks_auth) i
// spremanje JSON kolekcija u Vercel Blob (jedna datoteka po zapisu, pa više
// trenera može istovremeno spremati bez sudara).
// ---------------------------------------------------------------------------
import { createHash, timingSafeEqual } from 'node:crypto'
import { list, put, del, get } from '@vercel/blob'

/** Isti izračun kao u middleware.js — kolačić vrijedi dok se lozinka ne promijeni. */
export const authToken = (pass) =>
  createHash('sha256').update(`ks-auth-v1|${pass}`).digest('hex')

const safeEq = (a, b) => {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b))
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

const cookies = (req) => Object.fromEntries(
  (req.headers.cookie || '').split(';').map((c) => {
    const i = c.indexOf('=')
    return i < 0 ? [c.trim(), ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()]
  }),
)

export function isAuthed(req) {
  const pass = process.env.STAT_PASS
  if (!pass) return true // lozinka još nije postavljena — otvoreno (i postavi je!)
  const tok = cookies(req).ks_auth
  return !!tok && safeEq(tok, authToken(pass))
}

export function requireAuth(req, res) {
  if (isAuthed(req)) return true
  res.status(401).json({ ok: false, error: 'auth' })
  return false
}

export const passMatches = (candidate) => {
  const pass = process.env.STAT_PASS
  return !pass || safeEq(candidate || '', pass)
}

// Store može biti Private ili Public (bira se pri stvaranju u Vercelu, ne
// može se mijenjati) — SDK traži da se način navede u kodu, pa probamo oba.
async function withAccess(fn) {
  let err
  for (const access of ['private', 'public']) {
    try { return await fn(access) } catch (e) { err = e }
  }
  throw err
}

const streamToJson = async (stream) => JSON.parse(await new Response(stream).text())

/**
 * GET  → cijela kolekcija (niz JSON zapisa)
 * POST → spremi zapis (tijelo mora imati .id); prepisuje postojeći s istim id-em
 * DELETE ?id=… → obriši zapis
 */
export function collectionHandler(prefix) {
  return async function handler(req, res) {
    if (!requireAuth(req, res)) return
    try {
      if (req.method === 'GET') {
        const { blobs } = await list({ prefix: `${prefix}/` })
        const items = await Promise.all(blobs.map(async (b) => {
          try {
            // useCache:false — CDN bi inače do minute vraćao staru verziju nakon prepisivanja
            const r = await withAccess((access) => get(b.pathname, { access, useCache: false }))
            return r?.stream ? await streamToJson(r.stream) : null
          } catch { return null }
        }))
        return res.status(200).json(items.filter(Boolean))
      }
      if (req.method === 'POST') {
        const item = req.body
        if (!item || typeof item !== 'object' || !item.id) {
          return res.status(400).json({ ok: false, error: 'bad-item' })
        }
        await withAccess((access) => put(`${prefix}/${String(item.id).replace(/[^\w.-]/g, '_')}.json`, JSON.stringify(item), {
          access,
          contentType: 'application/json',
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 60,
        }))
        return res.status(200).json({ ok: true })
      }
      if (req.method === 'DELETE') {
        const id = String(req.query.id || '').replace(/[^\w.-]/g, '_')
        if (!id) return res.status(400).json({ ok: false, error: 'no-id' })
        const { blobs } = await list({ prefix: `${prefix}/${id}.json` })
        await Promise.all(blobs.map((b) => del(b.url)))
        return res.status(200).json({ ok: true })
      }
      return res.status(405).json({ ok: false, error: 'method' })
    } catch (e) {
      // Najčešći uzrok: Blob store nije spojen na projekt (nema tokena)
      const noBlob = !process.env.BLOB_READ_WRITE_TOKEN
      console.error('API error', prefix, e?.message)
      return res.status(noBlob ? 503 : 500).json({ ok: false, error: noBlob ? 'no-blob' : 'server' })
    }
  }
}
