import React from 'react'
import PlayerButton from './PlayerButton.jsx'

export default function RosterPanel({ stats, game, selectedId, onSelect, subMode, subOutId, onOpenLineup }) {
  const onCourt = stats.players.filter((r) => r.onCourt)
  const bench = stats.players.filter((r) => !r.onCourt)
  const twoCols = bench.length > 6

  return (
    <>
      <div className="section-title">Na parketu ({onCourt.length})</div>
      <div className="col" style={{ gap: 6 }}>
        {onCourt.map((r) => (
          <PlayerButton
            key={r.player.id}
            row={r}
            trackTime={game.trackTime}
            showMinutes
            selected={selectedId === r.player.id || subOutId === r.player.id}
            onClick={() => onSelect(r.player.id, true)}
          />
        ))}
        {onCourt.length === 0 && (
          <div className="hint err">
            Nema igrača na parketu — bez toga se akcije nemaju kome pripisati.
            <button className="btn sm wide" style={{ marginTop: 8 }} onClick={onOpenLineup}>
              Postavi petorku
            </button>
          </div>
        )}
      </div>

      <div className="section-title" style={{ marginTop: 6 }}>
        Klupa ({bench.length}) {subMode && '— odaberi tko ulazi'}
      </div>
      <div className="bench-wrap grow">
        <div className={`bench-grid ${twoCols ? 'two' : ''}`}>
          {bench.map((r) => (
            <PlayerButton
              key={r.player.id}
              row={r}
              bench
              dense={twoCols}
              trackTime={game.trackTime}
              showMinutes
              selected={selectedId === r.player.id}
              onClick={() => onSelect(r.player.id, false)}
            />
          ))}
        </div>
      </div>
    </>
  )
}
