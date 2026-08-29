import React, { useState } from 'react'

/**
 * Ručno postavljanje petorke usred utakmice i dodavanje igrača u roster.
 * Koristi se kad se postava razišla sa stanjem na parketu ili kad netko
 * zakasni na utakmicu.
 */
export default function LineupPanel({ game, stats, onSave, onAddPlayer, onClose }) {
  const current = stats.players.filter((r) => r.onCourt).map((r) => r.player.id)
  const [picked, setPicked] = useState(current)
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')

  const toggle = (id) => setPicked((s) => (
    s.includes(id) ? s.filter((x) => x !== id) : (s.length >= 5 ? s : [...s, id])
  ))

  const add = () => {
    if (!number.trim() || !name.trim()) return
    const p = onAddPlayer(number, name)
    setNumber('')
    setName('')
    if (p && picked.length < 5) setPicked((s) => [...s, p.id])
  }

  const need = Math.min(5, game.roster.length) - picked.length

  return (
    <div className="panel" style={{ padding: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="section-title">Postava na parketu — tapni igrače ({picked.length}/5)</div>
        <button className="btn sm ghost" onClick={onClose}>Zatvori</button>
      </div>

      <div className="grid4" style={{ marginTop: 8 }}>
        {game.roster.map((p) => {
          const on = picked.includes(p.id)
          return (
            <button key={p.id} className={`btn ${on ? 'primary' : ''}`} onClick={() => toggle(p.id)}>
              {on ? '✓ ' : ''}#{p.number} {p.name}
            </button>
          )
        })}
      </div>

      <div className="section-title" style={{ marginTop: 12 }}>Dodaj igrača u roster</div>
      <div className="row" style={{ marginTop: 6, gap: 6 }}>
        <input
          type="text" inputMode="numeric" placeholder="Br." value={number}
          onChange={(e) => setNumber(e.target.value)} style={{ width: 90 }}
        />
        <input
          type="text" placeholder="Ime i prezime" value={name}
          onChange={(e) => setName(e.target.value)} className="grow"
        />
        <button className="btn" disabled={!number.trim() || !name.trim()} onClick={add}>Dodaj</button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Novi igrač ide na klupu i odmah se može staviti u postavu.
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="btn primary grow"
          disabled={picked.length === 0}
          onClick={() => { onSave(picked); onClose() }}
        >
          Potvrdi postavu {need > 0 ? `(${picked.length}/5)` : ''}
        </button>
      </div>
      {need > 0 && picked.length > 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Možeš potvrditi i s manje od 5 igrača — minutaža i +/- se računaju za one koje odabereš.
        </div>
      )}
    </div>
  )
}
