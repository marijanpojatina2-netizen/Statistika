import React, { useMemo } from 'react'
import { EV, describeEvent } from '../model/events.js'
import { fmtClock } from '../model/derive.js'

/** Kronološki log, najnoviji gore. Tap na redak otvara uređivanje, ✕ briše. */
export default function PlayByPlay({ game, onSelectEvent, onDelete, selectedId }) {
  const byId = useMemo(() => Object.fromEntries(game.roster.map((p) => [p.id, p])), [game.roster])
  const list = [...game.events].reverse()

  if (list.length === 0) return <div className="empty-note">Još nema unosa.</div>

  return (
    <div className="log-list">
      {list.map((ev) => (
        <div key={ev.id} className={`log-row ${selectedId === ev.id ? 'sel' : ''}`}>
          <span className="log-q">
            {ev.period}Č{game.trackTime && ev.clock != null ? ` · ${fmtClock(ev.clock)}` : ''}
          </span>
          <button className="log-text" onClick={() => onSelectEvent && onSelectEvent(ev)}>
            {describeEvent(ev, byId, game)}
          </button>
          {onDelete && ev.type !== EV.LINEUP && ev.type !== EV.PERIOD_START && (
            <button className="icon-btn" aria-label="Obriši unos" onClick={() => onDelete(ev)}>✕</button>
          )}
        </div>
      ))}
    </div>
  )
}
