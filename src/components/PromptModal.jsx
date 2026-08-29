import React, { useRef } from 'react'

/**
 * Središnji upit — lančana pitanja i odabir igrača.
 * Tap izvan kartice = odustani, i NIŠTA drugo. Prvih 120 ms se klikovi
 * ignoriraju da duh-klik dodira koji je modal otvorio ne napravi ništa.
 */
export default function PromptModal({ title, note, options, onClose }) {
  const openedAt = useRef(Date.now())
  const guard = (fn) => (e) => {
    if (Date.now() - openedAt.current < 120) return
    fn(e)
  }
  return (
    <div className="modal-overlay" onClick={guard(onClose)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {note && <div className="modal-note">{note}</div>}
          </div>
          <button className="modal-x" onClick={guard(onClose)} aria-label="Zatvori">✕</button>
        </div>
        <div className="modal-grid">
          {options.map((o) => (
            <button key={o.key} className={`btn ${o.cls || ''}`} onClick={guard(o.onClick)}>{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
