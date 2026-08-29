import React from 'react'
import { EV, TEAM } from '../model/events.js'

/**
 * Klasicni gumbi za brzi unos (bez dijagrama terena).
 * `act(specs)` prima jedan ili vise event-spec objekata koji cine jednu grupu.
 */
export default function ActionPad({ game, selectedId, selectedName, act, onOpenSub }) {
  const need = !selectedId
  const P = (type, payload = {}) => ({ type, playerId: selectedId, payload })

  return (
    <div className="actions">
      <div className={need ? 'hint' : 'hint'} style={need ? {} : { background: 'var(--green-soft)', borderColor: 'var(--green)', color: 'var(--green)' }}>
        {need ? 'Odaberi igrača pa akciju →' : `Odabran: ${selectedName}`}
      </div>

      <div className="section-title">Šut</div>
      <div className="grid4">
        <button className="btn good lg" disabled={need} onClick={() => act(P(EV.SHOT, { made: true, value: 2, x: null, y: null }))}>2P ✓</button>
        <button className="btn bad lg" disabled={need} onClick={() => act(P(EV.SHOT, { made: false, value: 2, x: null, y: null }))}>2P ✗</button>
        <button className="btn good lg" disabled={need} onClick={() => act(P(EV.SHOT, { made: true, value: 3, x: null, y: null }))}>3P ✓</button>
        <button className="btn bad lg" disabled={need} onClick={() => act(P(EV.SHOT, { made: false, value: 3, x: null, y: null }))}>3P ✗</button>
        <button className="btn good" disabled={need} onClick={() => act(P(EV.SHOT, { made: true, value: 1, x: null, y: null }))}>SB ✓</button>
        <button className="btn bad" disabled={need} onClick={() => act(P(EV.SHOT, { made: false, value: 1, x: null, y: null }))}>SB ✗</button>
      </div>

      <div className="section-title">Skok i akcije</div>
      <div className="grid4">
        <button className="btn" disabled={need} onClick={() => act(P(EV.REBOUND, { off: true }))}>Skok NAP</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.REBOUND, { off: false }))}>Skok OBR</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.ASSIST))}>AST</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.BLOCK))}>BLK</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.STEAL))}>STL</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.TURNOVER))}>TO</button>
        <button className="btn warn" disabled={need} onClick={() => act(P(EV.FOUL, { kind: 'personal' }))}>Prekršaj</button>
        <button className="btn" disabled={need} onClick={() => act(P(EV.FOUL_DRAWN))}>Izborena os.</button>
      </div>

      <div className="section-title">Momčadski / protivnik</div>
      <div className="grid4">
        <button className="btn" onClick={() => act({ type: EV.REBOUND, playerId: null, payload: { off: true } })}>Mom. skok NAP</button>
        <button className="btn" onClick={() => act({ type: EV.REBOUND, playerId: null, payload: { off: false } })}>Mom. skok OBR</button>
        <button className="btn" onClick={() => act({ type: EV.TIMEOUT, playerId: null })}>Minuta odmora</button>
        <button className="btn" onClick={onOpenSub}>Zamjena</button>
      </div>
      <div className="grid4">
        <button className="btn primary" onClick={() => act({ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: true, value: 1, x: null, y: null } })}>Prot. +1</button>
        <button className="btn primary" onClick={() => act({ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: true, value: 2, x: null, y: null } })}>Prot. +2</button>
        <button className="btn primary" onClick={() => act({ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: true, value: 3, x: null, y: null } })}>Prot. +3</button>
        <button className="btn warn" onClick={() => act({ type: EV.FOUL, team: TEAM.OPP, playerId: null, payload: { kind: 'personal' } })}>Prot. prekršaj</button>
      </div>
      {game.trackOpponentShots && (
        <div className="grid4">
          <button className="btn bad" onClick={() => act({ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: false, value: 2, x: null, y: null } })}>Prot. 2P ✗</button>
          <button className="btn bad" onClick={() => act({ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: false, value: 3, x: null, y: null } })}>Prot. 3P ✗</button>
          <button className="btn bad" onClick={() => act({ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: false, value: 1, x: null, y: null } })}>Prot. SB ✗</button>
          <button className="btn" onClick={() => act({ type: EV.TURNOVER, team: TEAM.OPP, playerId: null })}>Prot. TO</button>
        </div>
      )}
    </div>
  )
}
