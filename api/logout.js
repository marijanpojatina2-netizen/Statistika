export default function handler(req, res) {
  res.setHeader('Set-Cookie', 'ks_auth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax')
  res.status(200).json({ ok: true })
}
