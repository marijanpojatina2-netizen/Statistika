import React from 'react'

/**
 * Lančani upit — nenametljiva traka na dnu, nikad modal.
 * Ne blokira daljnji unos; sama nestaje ili se zatvori na ✕.
 */
export default function ChainBar({ title, note, options, onClose }) {
  return (
    <div className="prompt-bar">
      <div className="pb-head">
        <span className="pb-title">{title}</span>
        {note && <span className="muted" style={{ fontSize: 12 }}>{note}</span>}
        <span className="grow" />
        <button className="btn sm ghost" onClick={onClose} aria-label="Zatvori">✕</button>
      </div>
      <div className="pb-row">
        {options.map((o) => (
          <button key={o.key} className={`btn ${o.cls || ''}`} onClick={o.onClick}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
