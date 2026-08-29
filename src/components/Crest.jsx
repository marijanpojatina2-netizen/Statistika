import React from 'react'

/** Grb kluba: prava slika iz public/crest.png ako postoji, inače inicijali. */
function initials(name) {
  const words = (name || '').split(/\s+/).filter(Boolean).filter((w) => !/^kk$/i.test(w))
  const src = words.length ? words : (name || '?').split(/\s+/).filter(Boolean)
  return src.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
}

export default function Crest({ name, small }) {
  const [broken, setBroken] = React.useState(false)
  const base = import.meta.env.BASE_URL
  // Pravi grb ide u public/crest.png; bez njega inicijali, a bez imena ikona aplikacije.
  if (!broken) {
    return (
      <div className={`crest ${small ? 'sm' : ''}`}>
        <img src={`${base}crest.png`} alt={name || 'Grb kluba'} onError={() => setBroken(true)} />
      </div>
    )
  }
  const text = initials(name)
  return (
    <div className={`crest ${small ? 'sm' : ''}`}>
      {text === '?' ? <img src={`${base}icon-192.png`} alt="" /> : text}
    </div>
  )
}
