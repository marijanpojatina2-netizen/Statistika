import React from 'react'

/**
 * Slobodna bacanja — traka na dnu koja NE blokira ostali unos.
 * Dok stoji, sve ostalo (zaostatak, time-out, zamjena) radi normalno.
 */
export default function FreeThrowBar({ title, onMade, onMiss, onStop }) {
  return (
    <div className="ftbar">
      <div style={{ minWidth: 0 }}>
        <div className="ftbar-title">{title}</div>
        <div className="ftbar-note">Ostali unosi (zaostatak, time-out, zamjena) rade normalno dok traju bacanja</div>
      </div>
      <div className="grow" />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn good" onClick={onMade}>✓ POGODAK</button>
        <button className="btn bad" onClick={onMiss}>✗ PROMAŠAJ</button>
        <button className="btn ghost" onClick={onStop}>Prekini</button>
      </div>
    </div>
  )
}
