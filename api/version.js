// Javno (bez prijave): koji je commit trenutno objavljen — za dijagnostiku.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    sha: (process.env.VERCEL_GIT_COMMIT_SHA || 'nepoznato').slice(0, 7),
    at: process.env.VERCEL_GIT_COMMIT_MESSAGE ? undefined : undefined,
  })
}
