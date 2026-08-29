import React from 'react'

/** Središnji upit — koristi se za lančane upite i odabir igrača. */
export default function PromptModal({ title, note, options, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {note && <div className="modal-note">{note}</div>}
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Zatvori">✕</button>
        </div>
        <div className="modal-grid">
          {options.map((o) => (
            <button key={o.key} className={`btn ${o.cls || ''}`} onClick={o.onClick}>{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
