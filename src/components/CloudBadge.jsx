import React from 'react'

// Status oblaka: klik pokušava ponovnu sinkronizaciju.
const LABEL = {
  sync: { text: 'Sinkronizacija…', cls: 'sync' },
  ok: { text: 'Oblak · zajednička arhiva', cls: 'ok' },
  offline: { text: 'Bez interneta · lokalna kopija', cls: 'warn' },
  'no-blob': { text: 'Oblak nije uključen · lokalna kopija', cls: 'warn' },
  none: null, // nema backenda (lokalni razvoj / GitHub Pages) — ne prikazuj ništa
}

export default function CloudBadge({ cloud, onSync }) {
  const l = LABEL[cloud?.status]
  if (!l) return null
  return (
    <button
      type="button"
      className={`cloud-badge ${l.cls}`}
      onClick={onSync}
      title="Klik za ponovnu sinkronizaciju"
    >
      <span className="dot" />{l.text}
    </button>
  )
}
