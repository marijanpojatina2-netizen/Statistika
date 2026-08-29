import React, { useEffect, useRef, useState } from 'react'
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
  // Manje od 5 igraca (trening, 3x3) je dopusteno — trazi se onoliko koliko ih ima.
  const needStarters = Math.min(5, valid.length)
  const canStart = valid.length > 0 && starters.length === needStarters

  const touched = useRef(false)

  // Prijedlog startne petorke: prvih 5 upisanih. Korisnik ga slobodno mijenja.
  useEffect(() => {
    if (touched.current || valid.length < 5 || starters.length > 0) return
    setStarters(valid.slice(0, 5).map((p) => p.id))
  }, [valid.length]) // eslint-disable-line

  const setRow = (id, patch) => setRoster((r) => r.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const addRow = () => setRoster((r) => [...r, blank()])
  const delRow = (id) => {
    setRoster((r) => r.filter((p) => p.id !== id))
    setStarters((s) => s.filter((x) => x !== id))
  }

  const toggleStarter = (id) => {
    touched.current = true
    setStarters((s) => (
      s.includes(id) ? s.filter((x) => x !== id) : (s.length >= needStarters ? s : [...s, id])
    ))
  }
  const pickFirstFive = () => { touched.current = true; setStarters(valid.slice(0, needStarters).map((p) => p.id)) }
  const clearStarters = () => { touched.current = true; setStarters([]) }

  const blockReason = valid.length === 0
    ? 'Upiši barem jednog igrača — broj dresa i ime.'
    : starters.length < needStarters
      ? `Odaberi još ${needStarters - starters.length} ${needStarters - starters.length === 1 ? 'igrača' : 'igrača'} za startnu petorku (tapni na ime dolje).`
      : null

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

      <div
        className="panel"
        style={{ padding: 12, borderColor: starters.length === needStarters && needStarters > 0 ? 'var(--green)' : 'var(--red)', borderWidth: 2 }}
      >
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <div className="section-title">
            Startna petorka — tapni imena ({starters.length}/{needStarters || 5})
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm ghost" onClick={pickFirstFive} disabled={valid.length === 0}>Prvih {needStarters || 5}</button>
            <button className="btn sm ghost" onClick={clearStarters} disabled={starters.length === 0}>Očisti</button>
          </div>
        </div>
        <div className="grid4" style={{ marginTop: 8 }}>
          {valid.map((p) => {
            const on = starters.includes(p.id)
            return (
              <button key={p.id} className={`btn ${on ? 'primary' : ''}`} onClick={() => toggleStarter(p.id)}>
                {on ? '✓ ' : ''}#{p.number} {p.name}
              </button>
            )
          })}
        </div>
        {valid.length === 0 && <div className="muted" style={{ marginTop: 8 }}>Prvo upiši igrače u roster iznad.</div>}
      </div>

      {blockReason && (
        <div className="hint" style={{ background: 'var(--red-soft)', borderColor: 'var(--red)', color: 'var(--red)' }}>
          {blockReason}
        </div>
      )}

      <button className="btn primary lg wide" disabled={!canStart} onClick={start}>
        Pokreni utakmicu
      </button>
    </div>
  )
}
