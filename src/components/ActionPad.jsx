import React from 'react'
import { EV, TEAM } from '../model/events.js'

/**
 * Klasicni gumbi za brzi unos (bez dijagrama terena).
 * `act(specs)` prima jedan ili vise event-spec objekata koji cine jednu grupu.
 * `compact` skracuje natpise za mobilni raspored.
 */
export default function ActionPad({ game, selectedId, selectedName, act, onOpenSub, compact }) {
  const need = !selectedId
  const P = (type, payload = {}) => ({ type, playerId: selectedId, payload })
  const L = (full, short) => (compact ? short : full)

  const shot = (value, made) => act(P(EV.SHOT, { made, value, x: null, y: null }))
  const oppShot = (value, made) => act({
    type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made, value, x: null, y: null },
  })

  return (
    <div className="actions">
      <div className={`hint ${need ? '' : 'ok'}`}>
        {need ? 'Odaberi igrača pa akciju →' : `Odabran: ${selectedName}`}
      </div>

      <div className="section-title">Šut</div>
      <div className="grid4">
        <button className="btn good lg" disabled={need} onClick={() => shot(2, true)}>2P ✓</button>
        <button className="btn bad lg" disabled={need} onClick={() => shot(2, false)}>2P ✗</button>
        <button className="btn good lg" disabled={need} onClick={() => shot(3, true)}>3P ✓</button>
        <button className="btn bad lg" disabled={need} onClick={() => shot(3, false)}>3P ✗</button>
        <button className="btn good" disabled={need} onClick={() => shot(1, true)}>SB ✓</button>
        <button className="btn bad" disabled={need} onClick={() => shot(1, false)}>SB ✗</button>
      </div>

      <div className="section-title">Skok i akcije</div>
      <div className="grid4">
        <button className="btn" disabled={need} onClick={() => act(P(EV.REBOUND, { off: true }))}>{L('Skok NAP', 'Skok N')}</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.REBOUND, { off: false }))}>{L('Skok OBR', 'Skok O')}</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.ASSIST))}>AST</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.BLOCK))}>BLK</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.STEAL))}>STL</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.TURNOVER))}>TO</button>
        <button className="btn warn" disabled={need} onClick={() => act(P(EV.FOUL, { kind: 'personal' }))}>Prekršaj</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.FOUL_DRAWN))}>{L('Izborena os.', 'Izb. os.')}</button>
      </div>

      <div className="section-title">Momčadski / protivnik</div>
      <div className="grid4">
        <button className="btn" onClick={() => act({ type: EV.REBOUND, playerId: null, payload: { off: true } })}>{L('Mom. skok NAP', 'Mom. NAP')}</button>
        <button className="btn" onClick={() => act({ type: EV.REBOUND, playerId: null, payload: { off: false } })}>{L('Mom. skok OBR', 'Mom. OBR')}</button>
        <button className="btn" onClick={() => act({ type: EV.TIMEOUT, playerId: null })}>{L('Minuta odmora', 'Time-out')}</button>
        <button className="btn" onClick={onOpenSub}>Zamjena</button>
      </div>
      <div className="grid4">
        <button className="btn primary" onClick={() => oppShot(1, true)}>Prot. +1</button>
        <button className="btn primary" onClick={() => oppShot(2, true)}>Prot. +2</button>
        <button className="btn primary" onClick={() => oppShot(3, true)}>Prot. +3</button>
        <button className="btn warn" onClick={() => act({ type: EV.FOUL, team: TEAM.OPP, playerId: null, payload: { kind: 'personal' } })}>{L('Prot. prekršaj', 'Prot. PF')}</button>
      </div>
      {game.trackOpponentShots && (
        <div className="grid4">
          <button className="btn bad" onClick={() => oppShot(2, false)}>Prot. 2P ✗</button>
          <button className="btn bad" onClick={() => oppShot(3, false)}>Prot. 3P ✗</button>
          <button className="btn bad" onClick={() => oppShot(1, false)}>Prot. SB ✗</button>
          <button className="btn" onClick={() => act({ type: EV.TURNOVER, team: TEAM.OPP, playerId: null })}>Prot. TO</button>
        </div>
      )}
    </div>
  )
}
