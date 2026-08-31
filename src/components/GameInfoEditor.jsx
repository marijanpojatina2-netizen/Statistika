import React, { useState } from 'react'

/** Naknadno uređivanje podataka utakmice (ekipe, datum, natjecanje). */
export default function GameInfoEditor({ game, onSave, onClose }) {
  const [homeName, setHomeName] = useState(game.homeName || '')
  const [awayName, setAwayName] = useState(game.awayName || '')
  const [date, setDate] = useState(game.date || '')
  const [competition, setCompetition] = useState(game.competition || '')

  return (
    <div className="panel" style={{ padding: 12, marginTop: 10 }}>
      <div className="section-title" style={{ marginBottom: 10 }}>Uredi podatke utakmice</div>
      <div className="form-grid">
        <div className="field">
          <label>Domaćin</label>
          <input type="text" value={homeName} onChange={(e) => setHomeName(e.target.value)} />
        </div>
        <div className="field">
          <label>Gost</label>
          <input type="text" value={awayName} onChange={(e) => setAwayName(e.target.value)} />
        </div>
        <div className="field">
          <label>Datum</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Natjecanje</label>
          <input type="text" value={competition} onChange={(e) => setCompetition(e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn good grow"
          onClick={() => { onSave({ homeName: homeName.trim(), awayName: awayName.trim(), date, competition: competition.trim() }); onClose() }}
        >
          Spremi
        </button>
        <button className="btn ghost" onClick={onClose}>Odustani</button>
      </div>
    </div>
  )
}
