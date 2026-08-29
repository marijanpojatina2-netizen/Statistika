import React, { useState } from 'react'
import { EV } from '../model/events.js'

export default function SubPanel({ stats, onClose, act, initialOutId = null }) {
  const [pairs, setPairs] = useState([])   // [{outId, inId}]
  const [outId, setOutId] = useState(initialOutId)

  const usedOut = new Set(pairs.map((p) => p.outId))
  const usedIn = new Set(pairs.map((p) => p.inId))
  const onCourt = stats.players.filter((r) => r.onCourt && !usedOut.has(r.player.id))
  const bench = stats.players.filter((r) => !r.onCourt && !usedIn.has(r.player.id))
  const byId = Object.fromEntries(stats.players.map((r) => [r.player.id, r.player]))
  const label = (id) => `#${byId[id]?.number} ${byId[id]?.name}`

  const pickIn = (inId) => {
    if (!outId) return
    setPairs((p) => [...p, { outId, inId }])
    setOutId(null)
  }

  const confirm = () => {
    if (pairs.length === 0) return onClose()
    act(pairs.map((p) => ({ type: EV.SUB, playerId: null, payload: { inId: p.inId, outId: p.outId } })))
    onClose()
  }

  return (
    <div className="panel" style={{ padding: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="section-title">Zamjena — {outId ? 'odaberi tko ULAZI' : 'odaberi tko IZLAZI'}</div>
        <button className="btn sm ghost" onClick={onClose}>Zatvori</button>
      </div>

      <div className="section-title" style={{ marginTop: 8 }}>Izlazi (parket)</div>
      <div className="grid4">
        {onCourt.map((r) => (
          <button key={r.player.id} className={`btn ${outId === r.player.id ? 'primary' : ''}`} onClick={() => setOutId(r.player.id)}>
            #{r.player.number} {r.player.name}
          </button>
        ))}
      </div>

      <div className="section-title" style={{ marginTop: 8 }}>Ulazi (klupa)</div>
      <div className="grid4">
        {bench.map((r) => (
          <button key={r.player.id} className="btn" disabled={!outId} onClick={() => pickIn(r.player.id)}>
            #{r.player.number} {r.player.name}
          </button>
        ))}
      </div>

      {pairs.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 10 }}>Pripremljene zamjene</div>
          <div className="col" style={{ gap: 4 }}>
            {pairs.map((p, i) => (
              <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
                <span>↑ {label(p.inId)} &nbsp;/&nbsp; ↓ {label(p.outId)}</span>
                <button className="btn sm ghost" onClick={() => setPairs((x) => x.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary grow" disabled={pairs.length === 0} onClick={confirm}>
          Potvrdi {pairs.length > 0 ? `(${pairs.length})` : ''}
        </button>
      </div>
    </div>
  )
}
