import React, { useEffect, useState } from 'react'
import { EV, TEAM, describeEvent } from '../model/events.js'
import { shotValue } from '../model/court.js'
import { fmtClock } from '../model/derive.js'
import Court from './Court.jsx'

const TYPES = [
  [EV.SHOT, 'Šut'],
  [EV.REBOUND, 'Skok'],
  [EV.ASSIST, 'Asistencija'],
  [EV.STEAL, 'Ukradena lopta'],
  [EV.BLOCK, 'Blokada'],
  [EV.TURNOVER, 'Izgubljena lopta'],
  [EV.FOUL, 'Prekršaj'],
  [EV.FOUL_DRAWN, 'Izborena osobna'],
  [EV.TIMEOUT, 'Minuta odmora'],
  [EV.DEADBALL, 'Lopta van'],
]
const STRUCTURAL = [EV.LINEUP, EV.SUB, EV.PERIOD_START, EV.PERIOD_END]
const FOUL_KINDS = [
  ['personal', 'Osobna'],
  ['offensive', 'Napadačka'],
  ['technical', 'Tehnička'],
  ['unsportsmanlike', 'Nesportska'],
]

/** Uređivanje jednog eventa iz play-by-playa. Sve izvedene brojke se preračunaju same. */
export default function EventEditor({ game, event, onSave, onDelete, onClose }) {
  const [d, setD] = useState(() => ({ ...event }))
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { setD({ ...event }); setConfirmDelete(false) }, [event])

  const structural = STRUCTURAL.includes(d.type)
  const isOpp = d.team === TEAM.OPP
  const set = (patch) => setD((v) => ({ ...v, ...patch }))
  const byId = Object.fromEntries(game.roster.map((p) => [p.id, p]))

  const mins = d.clock == null ? 0 : Math.floor(d.clock / 60)
  const secs = d.clock == null ? 0 : Math.round(d.clock % 60)
  const setClockParts = (m, s) => set({ clock: Math.max(0, m * 60 + s) })

  const setPosition = (x, y) => set({ x, y, value: shotValue(x, y) })

  const save = () => {
    const next = {
      type: d.type,
      team: d.team || TEAM.US,
      playerId: isOpp ? null : (d.playerId || null),
      period: Number(d.period) || 1,
      clock: game.trackTime ? (d.clock ?? null) : null,
    }
    if (d.type === EV.SHOT) {
      next.made = !!d.made
      next.value = Number(d.value) || 2
      next.x = d.x ?? null
      next.y = d.y ?? null
    }
    if (d.type === EV.REBOUND) next.off = !!d.off
    if (d.type === EV.FOUL) next.kind = d.kind || 'personal'
    onSave(next)
  }

  return (
    <div className="panel" style={{ padding: 12, marginBottom: 10, borderColor: 'var(--blue-line)' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="section-title">
          Uredi unos — {d.period}Č {game.trackTime && d.clock != null ? `· ${fmtClock(d.clock)}` : ''}
        </div>
        <button className="btn sm ghost" onClick={onClose}>Zatvori</button>
      </div>

      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        {describeEvent(event, byId, game)}
      </div>

      {structural ? (
        <div className="hint">
          Postava, zamjene i granice četvrtina se ne uređuju ovdje — mogu se samo obrisati.
          Brisanje zamjene mijenja tko je bio na parketu, pa i minutažu i +/-.
        </div>
      ) : (
        <div className="grid-form">
          <div className="field">
            <label>Ekipa</label>
            <div className="switch">
              <button className={!isOpp ? 'on' : ''} onClick={() => set({ team: TEAM.US })}>Mi</button>
              <button className={isOpp ? 'on' : ''} onClick={() => set({ team: TEAM.OPP, playerId: null })}>Protivnik</button>
            </div>
          </div>

          <div className="field">
            <label>Igrač</label>
            <select
              value={d.playerId || ''}
              disabled={isOpp}
              onChange={(e) => set({ playerId: e.target.value || null })}
            >
              <option value="">— momčadski, bez igrača —</option>
              {game.roster.map((p) => (
                <option key={p.id} value={p.id}>#{p.number} {p.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Akcija</label>
            <select value={d.type} onChange={(e) => set({ type: e.target.value })}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Četvrtina</label>
            <input
              type="number" min="1" max="9"
              value={d.period}
              onChange={(e) => set({ period: Number(e.target.value) })}
            />
          </div>

          {game.trackTime && (
            <div className="field">
              <label>Vrijeme do kraja četvrtine</label>
              <div className="row">
                <input type="number" min="0" max="59" value={mins} onChange={(e) => setClockParts(Number(e.target.value), secs)} />
                <span>:</span>
                <input type="number" min="0" max="59" value={secs} onChange={(e) => setClockParts(mins, Number(e.target.value))} />
              </div>
            </div>
          )}

          {d.type === EV.SHOT && (
            <>
              <div className="field">
                <label>Rezultat</label>
                <div className="switch">
                  <button className={d.made ? 'on' : ''} onClick={() => set({ made: true })}>Pogodak</button>
                  <button className={!d.made ? 'on' : ''} onClick={() => set({ made: false })}>Promašaj</button>
                </div>
              </div>
              <div className="field">
                <label>Vrsta {d.x != null && '(određena pozicijom)'}</label>
                <div className="switch">
                  {[1, 2, 3].map((v) => (
                    <button
                      key={v}
                      className={Number(d.value) === v ? 'on' : ''}
                      disabled={d.x != null && v !== 1}
                      onClick={() => set({ value: v, ...(v === 1 ? { x: null, y: null } : {}) })}
                    >
                      {v === 1 ? 'SB' : `${v}P`}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {d.type === EV.REBOUND && (
            <div className="field">
              <label>Vrsta skoka</label>
              <div className="switch">
                <button className={d.off ? 'on' : ''} onClick={() => set({ off: true })}>Napadački</button>
                <button className={!d.off ? 'on' : ''} onClick={() => set({ off: false })}>Obrambeni</button>
              </div>
            </div>
          )}

          {d.type === EV.FOUL && (
            <div className="field">
              <label>Vrsta prekršaja</label>
              <select value={d.kind || 'personal'} onChange={(e) => set({ kind: e.target.value })}>
                {FOUL_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {!structural && d.type === EV.SHOT && Number(d.value) !== 1 && (
        <div style={{ marginTop: 10 }}>
          <div className="section-title">
            Pozicija šuta {d.x != null ? `— ${shotValue(d.x, d.y)}P` : '— nije unesena'}
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
            <Court
              shots={d.x != null ? [{ x: d.x, y: d.y, made: !!d.made }] : []}
              onPick={setPosition}
              style={{ maxWidth: 300 }}
            />
            <button className="btn sm ghost" disabled={d.x == null} onClick={() => set({ x: null, y: null })}>
              Ukloni poziciju
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        {!structural && <button className="btn primary grow" onClick={save}>Spremi izmjene</button>}
        {confirmDelete ? (
          <>
            <button className="btn bad" onClick={onDelete}>Da, obriši</button>
            <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Odustani</button>
          </>
        ) : (
          <button className="btn bad" onClick={() => setConfirmDelete(true)}>Obriši unos</button>
        )}
      </div>
    </div>
  )
}
