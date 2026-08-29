import React, { useState } from 'react'

/** Ručno podešavanje sata i četvrtine kad se raziđe sa semaforom u dvorani. */
export default function ClockEditor({ game, clock, onClose, onSave }) {
  const total = Math.round(clock.secs ?? game.quarterLength * 60)
  const [m, setM] = useState(Math.floor(total / 60))
  const [s, setS] = useState(total % 60)
  const [p, setP] = useState(clock.period)

  return (
    <div className="panel" style={{ margin: '8px 20px', padding: 12 }}>
      <div className="section-title">Ručno podešavanje sata i četvrtine</div>
      <div className="row wrap" style={{ marginTop: 10 }}>
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
