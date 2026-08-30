import React, { useEffect, useRef, useState } from 'react'
import { newId } from '../model/events.js'
import { newGame } from '../model/game.js'
import Crest from '../components/Crest.jsx'
import CloudBadge from '../components/CloudBadge.jsx'

const blank = () => ({ id: newId(), number: '', name: '' })

export default function SetupScreen({
  onStart, templates = [], onSaveTemplate, onDeleteTemplate, onOpenArchive, archiveCount = 0,
  cloud, onSync, coach = '', onLogout,
}) {
  const [homeName, setHomeName] = useState('')
  const [awayName, setAwayName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [competition, setCompetition] = useState('')
  const [quarterLength, setQuarterLength] = useState(10)
  const [quarterCount, setQuarterCount] = useState(4)
  const [trackTime, setTrackTime] = useState(false)
  const [trackOpponentShots, setTrackOpponentShots] = useState(false)
  const [weAreHome, setWeAreHome] = useState(true)
  const [roster, setRoster] = useState(() => Array.from({ length: 6 }, blank))
  const [starters, setStarters] = useState([])

  const valid = roster.filter((p) => p.name.trim() && String(p.number).trim())
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

  const applyTemplate = (t) => {
    setHomeName(t.homeName || '')
    setAwayName(t.awayName || '')
    setCompetition(t.competition || '')
    setQuarterLength(t.quarterLength ?? 10)
    setQuarterCount(t.quarterCount ?? 4)
    setTrackTime(!!t.trackTime)
    setTrackOpponentShots(!!t.trackOpponentShots)
    setWeAreHome(t.weAreHome !== false)
    const rows = (t.roster || []).map((p) => ({ id: newId(), number: String(p.number), name: p.name }))
    setRoster(rows.length ? rows : Array.from({ length: 6 }, blank))
    touched.current = false
    setStarters(rows.slice(0, 5).map((p) => p.id))
  }

  const saveAsTemplate = () => {
    if (!onSaveTemplate || valid.length === 0) return
    const name = prompt('Naziv predloška:', homeName || 'Naša ekipa')
    if (!name) return
    onSaveTemplate({
      id: newId(), name: name.trim(), savedAt: Date.now(),
      homeName, awayName, competition,
      quarterLength: Number(quarterLength) || 10,
      quarterCount: Number(quarterCount) || 4,
      trackTime, trackOpponentShots, weAreHome,
      roster: valid.map((p) => ({ number: p.number, name: p.name.trim() })),
    })
  }

  const blockReason = valid.length === 0
    ? 'Upiši barem jednog igrača — broj dresa i ime.'
    : starters.length < needStarters
      ? `Odaberi još ${needStarters - starters.length} za startnu petorku (tapni ime dolje).`
      : null

  const start = () => {
    if (!canStart) return
    onStart(newGame({
      homeName: homeName || 'KK Dinamo', awayName: awayName || 'Protivnik', date, competition,
      quarterLength, quarterCount, trackTime, trackOpponentShots, weAreHome,
      roster: valid, starters,
    }))
  }

  return (
    <div className="setup">
      <div className="row" style={{ justifyContent: 'space-between', paddingBottom: 6, gap: 16 }}>
        <div className="row" style={{ gap: 14, minWidth: 0 }}>
          <Crest name={weAreHome ? homeName : awayName} />
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title">Nova utakmica</h1>
            <div className="page-sub">{(weAreHome ? homeName : awayName) || 'KK Dinamo'} · statistika</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <CloudBadge cloud={cloud} onSync={onSync} />
          {archiveCount > 0 && (
            <button className="btn ghost" onClick={onOpenArchive} style={{ height: 42 }}>
              Arhiva i sezona ({archiveCount})
            </button>
          )}
        </div>
      </div>

      {coach && (
        <div className="row" style={{ justifyContent: 'space-between', margin: '-6px 2px 0' }}>
          <div className="muted" style={{ fontSize: 13.5 }}>
            Prijavljen: <b style={{ color: 'var(--text-3)' }}>{coach}</b>
          </div>
          {onLogout && (
            <button
              className="btn ghost"
              style={{ minHeight: 34, padding: '0 12px', fontSize: 13 }}
              onClick={() => { if (confirm('Odjaviti se? Za ponovni ulazak treba klupska lozinka.')) onLogout() }}
            >
              Odjava
            </button>
          )}
        </div>
      )}

      {templates.length > 0 && (
        <div className="panel" style={{ padding: '18px 20px' }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Predlošci · tap puni ekipe i roster</div>
          <div className="col" style={{ gap: 8 }}>
            {templates.map((t) => (
              <div className="row" key={t.id}>
                <button className="btn accent grow" style={{ justifyContent: 'flex-start' }} onClick={() => applyTemplate(t)}>
                  {t.name}
                  <span className="muted" style={{ fontWeight: 500, fontSize: 12, fontFamily: 'var(--f-ui)' }}>
                    · {(t.roster || []).length} igrača{t.competition ? ` · ${t.competition}` : ''}{t.coach ? ` · ${t.coach}` : ''}
                  </span>
                </button>
                <button className="btn ghost" style={{ width: 44, padding: 0 }} onClick={() => onDeleteTemplate && onDeleteTemplate(t.id)} aria-label="Obriši predložak">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel" style={{ padding: '18px 20px' }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Podaci o utakmici</div>
        <div className="form-grid">
          <div className="field">
            <label>Domaćin</label>
            <input type="text" value={homeName} onChange={(e) => setHomeName(e.target.value)} placeholder="npr. KK Dinamo" />
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
            <input type="text" inputMode="numeric" value={quarterLength} onChange={(e) => setQuarterLength(e.target.value)} />
          </div>
          <div className="field">
            <label>Broj četvrtina</label>
            <input type="text" inputMode="numeric" value={quarterCount} onChange={(e) => setQuarterCount(e.target.value)} />
          </div>
          <div className="field">
            <label>Vodi vrijeme</label>
            <div className="switch">
              <button className={trackTime ? 'on' : ''} onClick={() => setTrackTime(true)}>Tajmer</button>
              <button className={!trackTime ? 'on' : ''} onClick={() => setTrackTime(false)}>Po četvrtinama</button>
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

      <div className="panel" style={{ padding: '18px 20px' }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div className="section-title">Roster · {valid.length} igrača</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" disabled={valid.length === 0} onClick={saveAsTemplate}>Spremi kao predložak</button>
            <button className="btn accent" style={{ minHeight: 38 }} onClick={addRow}>+ Dodaj igrača</button>
          </div>
        </div>
        <div className="roster-grid">
          {roster.map((p) => (
            <div className="roster-row" key={p.id}>
              <input type="text" inputMode="numeric" value={p.number} placeholder="Br." onChange={(e) => setRow(p.id, { number: e.target.value })} />
              <input type="text" value={p.name} placeholder="Ime i prezime" onChange={(e) => setRow(p.id, { name: e.target.value })} />
              <button className="btn ghost" onClick={() => delRow(p.id)} aria-label="Obriši">✕</button>
            </div>
          ))}
        </div>
      </div>

      <div
        className="panel"
        style={{ padding: '18px 20px', borderColor: canStart ? 'rgba(47,191,113,.45)' : undefined }}
      >
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div className="section-title">Startna petorka · {starters.length}/{needStarters || 5}</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" style={{ minHeight: 36 }} disabled={valid.length === 0} onClick={pickFirstFive}>Prvih 5</button>
            <button className="btn ghost" style={{ minHeight: 36 }} disabled={starters.length === 0} onClick={clearStarters}>Očisti</button>
          </div>
        </div>
        <div className="starter-grid">
          {valid.map((p) => (
            <button
              key={p.id}
              className={`starter ${starters.includes(p.id) ? 'on' : ''}`}
              onClick={() => toggleStarter(p.id)}
            >
              <span className="n">#{p.number}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            </button>
          ))}
        </div>
        {valid.length === 0 && <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>Prvo upiši igrače u roster iznad.</div>}
      </div>

      {blockReason && <div className="hint err">{blockReason}</div>}

      <button className="btn xl primary wide" disabled={!canStart} onClick={start}>Pokreni utakmicu</button>
    </div>
  )
}
