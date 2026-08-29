import React, { useState } from 'react'
import { newId } from '../model/events.js'
import { newGame } from '../model/game.js'

const blank = () => ({ id: newId(), number: '', name: '' })

export default function SetupScreen({ onStart }) {
  const [homeName, setHomeName] = useState('')
  const [awayName, setAwayName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [competition, setCompetition] = useState('')
  const [quarterLength, setQuarterLength] = useState(10)
  const [quarterCount, setQuarterCount] = useState(4)
  const [trackTime, setTrackTime] = useState(false)
  const [trackOpponentShots, setTrackOpponentShots] = useState(false)
  const [weAreHome, setWeAreHome] = useState(true)
  const [roster, setRoster] = useState(() => Array.from({ length: 5 }, blank))
  const [starters, setStarters] = useState([])

  const valid = roster.filter((p) => p.name.trim() && String(p.number).trim())
  const canStart = valid.length >= 5 && starters.length === 5

  const setRow = (id, patch) => setRoster((r) => r.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const addRow = () => setRoster((r) => [...r, blank()])
  const delRow = (id) => {
    setRoster((r) => r.filter((p) => p.id !== id))
    setStarters((s) => s.filter((x) => x !== id))
  }

  const toggleStarter = (id) => setStarters((s) => (
    s.includes(id) ? s.filter((x) => x !== id) : (s.length >= 5 ? s : [...s, id])
  ))

  const start = () => {
    onStart(newGame({
      homeName: homeName || 'Domaći', awayName: awayName || 'Gosti', date, competition,
      quarterLength, quarterCount, trackTime, trackOpponentShots, weAreHome,
      roster: valid, starters,
    }))
  }

  return (
    <div className="setup">
      <h1 style={{ margin: 0, color: 'var(--blue)' }}>Nova utakmica</h1>

      <div className="panel" style={{ padding: 12 }}>
        <div className="grid-form">
          <div className="field">
            <label>Domaćin</label>
            <input type="text" value={homeName} onChange={(e) => setHomeName(e.target.value)} placeholder="npr. KK Naš klub" />
          </div>
          <div className="field">
            <label>Gost</label>
            <input type="text" value={awayName} onChange={(e) => setAwayName(e.target.value)} placeholder="npr. KK Protivnik" />
          </div>
          <div className="field">
            <label>Datum</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Natjecanje</label>
            <input type="text" value={competition} onChange={(e) => setCompetition(e.target.value)} placeholder="npr. Kadetska liga" />
          </div>
          <div className="field">
            <label>Naša ekipa je</label>
            <div className="switch">
              <button className={weAreHome ? 'on' : ''} onClick={() => setWeAreHome(true)}>Domaćin</button>
              <button className={!weAreHome ? 'on' : ''} onClick={() => setWeAreHome(false)}>Gost</button>
            </div>
          </div>
          <div className="field">
            <label>Trajanje četvrtine (min)</label>
            <input type="number" min="1" max="20" value={quarterLength} onChange={(e) => setQuarterLength(e.target.value)} />
          </div>
          <div className="field">
            <label>Broj četvrtina</label>
            <input type="number" min="1" max="6" value={quarterCount} onChange={(e) => setQuarterCount(e.target.value)} />
          </div>
          <div className="field">
            <label>Vodi vrijeme</label>
            <div className="switch">
              <button className={trackTime ? 'on' : ''} onClick={() => setTrackTime(true)}>DA — tajmer</button>
              <button className={!trackTime ? 'on' : ''} onClick={() => setTrackTime(false)}>NE — po četvrtinama</button>
            </div>
          </div>
          <div className="field">
            <label>Prati šuteve protivnika</label>
            <div className="switch">
              <button className={trackOpponentShots ? 'on' : ''} onClick={() => setTrackOpponentShots(true)}>DA</button>
              <button className={!trackOpponentShots ? 'on' : ''} onClick={() => setTrackOpponentShots(false)}>NE</button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="section-title">Naš roster ({valid.length} igrača)</div>
          <button className="btn sm" onClick={addRow}>+ Dodaj igrača</button>
        </div>
        <div className="col">
          {roster.map((p) => (
            <div className="roster-row" key={p.id}>
              <input type="text" inputMode="numeric" value={p.number} placeholder="Br." onChange={(e) => setRow(p.id, { number: e.target.value })} />
              <input type="text" value={p.name} placeholder="Ime i prezime" onChange={(e) => setRow(p.id, { name: e.target.value })} />
              <button className="btn sm ghost" onClick={() => delRow(p.id)} aria-label="Obriši">✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ padding: 12 }}>
        <div className="section-title">Startna petorka — odaberi 5 ({starters.length}/5)</div>
        <div className="grid4" style={{ marginTop: 8 }}>
          {valid.map((p) => (
            <button
              key={p.id}
              className={`btn ${starters.includes(p.id) ? 'primary' : ''}`}
              onClick={() => toggleStarter(p.id)}
            >
              #{p.number} {p.name}
            </button>
          ))}
        </div>
        {valid.length < 5 && <div className="muted" style={{ marginTop: 8 }}>Upiši barem 5 igrača (broj + ime).</div>}
      </div>

      <button className="btn primary lg wide" disabled={!canStart} onClick={start}>
        Pokreni utakmicu
      </button>
    </div>
  )
}
