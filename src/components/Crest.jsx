import React, { useState } from 'react'

/**
 * Grb kluba. Datoteka ide u public/ kao `crest.png` ili `crest.jpg`.
 * Bez nje se prikazuju inicijali ekipe, a bez imena ikona aplikacije.
 */
function initials(name) {
  const words = (name || '').split(/\s+/).filter(Boolean).filter((w) => !/^kk$/i.test(w))
  const src = words.length ? words : (name || '').split(/\s+/).filter(Boolean)
  return src.slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

export default function Crest({ name, small }) {
  const base = import.meta.env.BASE_URL
  const sources = [`${base}crest.png`, `${base}crest.jpg`]
  const [step, setStep] = useState(0)
  const cls = `crest ${small ? 'sm' : ''}`

  if (step < sources.length) {
    return (
      <div className={cls}>
        <img src={sources[step]} alt={name || 'Grb kluba'} onError={() => setStep((n) => n + 1)} />
      </div>
    )
  }
  const text = initials(name)
  return (
    <div className={cls}>
      {text || <img src={`${base}icon-192.png`} alt="" />}
    </div>
  )
}
