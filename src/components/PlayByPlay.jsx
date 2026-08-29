import React, { useMemo } from 'react'
import { EV, TEAM, describeEvent } from '../model/events.js'
import { fmtClock } from '../model/derive.js'

export default function PlayByPlay({ game, onSelectEvent }) {
  const byId = useMemo(() => Object.fromEntries(game.roster.map((p) => [p.id, p])), [game.roster])

  // redni broj unutar cetvrtine (za nacin bez vremena)
  const ordinals = useMemo(() => {
    const m = {}
    const counters = {}
    for (const e of game.events) {
      counters[e.period] = (counters[e.period] || 0) + 1
      m[e.id] = counters[e.period]
    }
    return m
  }, [game.events])

  const list = [...game.events].reverse()

  return (
    <div className="pbp">
      {list.length === 0 && <div className="muted">Još nema unosa.</div>}
      {list.map((ev) => {
        const cls = ev.type === EV.SHOT ? (ev.made ? 'made' : 'miss') : ''
        return (
          <button
            key={ev.id}
            className={`pbp-item ${cls} ${ev.team === TEAM.OPP ? 'opp' : ''}`}
            onClick={() => onSelectEvent && onSelectEvent(ev)}
          >
            <span className="t">
              {ev.period}Č · {game.trackTime ? fmtClock(ev.clock) : `#${ordinals[ev.id]}`}
            </span>
            <span>{describeEvent(ev, byId, game)}</span>
            <span className="muted" style={{ fontSize: 12 }}>uredi</span>
          </button>
        )
      })}
    </div>
  )
}
