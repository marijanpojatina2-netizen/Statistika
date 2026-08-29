import React, { useRef, useState } from 'react'
import { fmtClock } from '../model/derive.js'

/** Grb-nadomjestak: inicijali kluba (npr. "KK Zagreb" -> "KZ"). */
function initials(name) {
  const words = (name || '').split(/\s+/).filter(Boolean).filter((w) => !/^kk$/i.test(w))
  const src = words.length ? words : (name || '?').split(/\s+/).filter(Boolean)
  return src.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
}

export default function Scoreboard({ game, clock, stats, onToggleClock, onSetClock, onNextPeriod, compact }) {
  const [editing, setEditing] = useState(false)
  const [confirmNext, setConfirmNext] = useState(false)
  const holdRef = useRef(null)
  const heldRef = useRef(false)

  const usScore = stats.score.us
  const oppScore = stats.score.opp
  const leftName = game.weAreHome ? game.homeName : game.awayName
  const rightName = game.weAreHome ? game.awayName : game.homeName
  const leftScore = game.weAreHome ? usScore : oppScore
  const rightScore = game.weAreHome ? oppScore : usScore

  const p = clock.period
  const usFouls = stats.teamFouls[p]?.us || 0
  const oppFouls = stats.teamFouls[p]?.opp || 0

  const down = () => {
    heldRef.current = false
    holdRef.current = setTimeout(() => { heldRef.current = true; setEditing(true) }, 550)
  }
  const up = () => {
    clearTimeout(holdRef.current)
    if (!heldRef.current) onToggleClock()
  }

  const foulChip = (n, label) => (
    <span className={`chip ${n >= 5 ? 'bonus' : n === 4 ? 'near' : ''}`}>
      {label} {n}{n >= 5 ? ' BONUS' : ''}
    </span>
  )

  return (
    <>
      <div className={`scoreboard ${compact ? 'compact' : ''}`}>
        <div className="sb-team">
          <div className="sb-txt">
            <div className="sb-name">{leftName}</div>
            <div className="sb-score">{leftScore}</div>
            <div className="row wrap" style={{ gap: 4, marginTop: 2 }}>
              {foulChip(game.weAreHome ? usFouls : oppFouls, 'PF')}
              {game.weAreHome && <span className="chip">TO {stats.timeouts.us}</span>}
            </div>
          </div>
          <div className="sb-crest">{initials(leftName)}</div>
        </div>

        <div className="sb-mid">
          <div className="sb-period">{compact ? `${p}. Č` : `${p}. četvrtina`}</div>

          {game.trackTime && (
            <button
              className={`sb-clock ${game.clock.running ? 'running' : ''}`}
              onPointerDown={down}
              onPointerUp={up}
              onPointerLeave={() => clearTimeout(holdRef.current)}
            >
              {fmtClock(clock.secs)}
            </button>
          )}

          {confirmNext ? (
            <div className="row" style={{ gap: 5 }}>
              <button
                className={`btn good ${game.trackTime || compact ? 'sm' : ''}`}
                onClick={() => { onNextPeriod(); setConfirmNext(false) }}
              >
                {compact ? '✓' : 'Potvrdi'}
              </button>
              <button
                className={`btn ghost ${game.trackTime || compact ? 'sm' : ''}`}
                onClick={() => setConfirmNext(false)}
              >
                {compact ? '✕' : 'Odustani'}
              </button>
            </div>
          ) : (
            <div className="row" style={{ gap: 5 }}>
              {game.trackTime && (
                <button className="btn sm ghost" onClick={() => setEditing((v) => !v)}>Uredi</button>
              )}
              <button
                className={`btn ${game.trackTime ? 'sm' : (compact ? 'primary' : 'primary lg')}`}
                onClick={() => setConfirmNext(true)}
                style={game.trackTime || compact ? undefined : { minWidth: 200 }}
              >
                {compact ? `${p + 1}. Č →` : (game.trackTime ? 'Sljedeća →' : 'Sljedeća četvrtina →')}
              </button>
            </div>
          )}
        </div>

        <div className="sb-team right">
          <div className="sb-crest">{initials(rightName)}</div>
          <div className="sb-txt" style={{ textAlign: 'right' }}>
            <div className="sb-name">{rightName}</div>
            <div className="sb-score">{rightScore}</div>
            <div className="row wrap" style={{ gap: 4, marginTop: 2, justifyContent: 'flex-end' }}>
              {!game.weAreHome && <span className="chip">TO {stats.timeouts.us}</span>}
              {foulChip(game.weAreHome ? oppFouls : usFouls, 'PF')}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <ClockEditor
          game={game}
          clock={clock}
          onClose={() => setEditing(false)}
          onSave={(period, secs) => { onSetClock(period, secs); setEditing(false) }}
        />
      )}
    </>
  )
}

function ClockEditor({ game, clock, onClose, onSave }) {
  const total = Math.round(clock.secs ?? game.quarterLength * 60)
  const [m, setM] = useState(Math.floor(total / 60))
  const [s, setS] = useState(total % 60)
  const [p, setP] = useState(clock.period)
  return (
    <div className="panel" style={{ margin: '8px 10px', padding: 10 }}>
      <div className="section-title">Ručno podešavanje sata i četvrtine</div>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <div className="field" style={{ width: 110 }}>
          <label>Četvrtina</label>
          <input type="number" min="1" max="9" value={p} onChange={(e) => setP(Number(e.target.value))} />
        </div>
        <div className="field" style={{ width: 110 }}>
          <label>Minute</label>
          <input type="number" min="0" max="59" value={m} onChange={(e) => setM(Number(e.target.value))} />
        </div>
        <div className="field" style={{ width: 110 }}>
          <label>Sekunde</label>
          <input type="number" min="0" max="59" value={s} onChange={(e) => setS(Number(e.target.value))} />
        </div>
        <div className="grow" />
        <button className="btn ghost" onClick={onClose}>Odustani</button>
        <button className="btn primary" onClick={() => onSave(p, m * 60 + s)}>Spremi</button>
      </div>
    </div>
  )
}
