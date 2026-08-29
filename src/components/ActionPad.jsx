import React from 'react'
import { EV, TEAM } from '../model/events.js'

/**
 * Akcijska ploča. Igrač se može odabrati prije ILI poslije akcije —
 * `act` prima spec, a ekran ga dovrši kad zna igrača.
 */
export default function ActionPad({ game, act, oppName, onOpenSub, onOpenLineup, showSub }) {
  const shot = (value, made) => act({
    kind: 'shot', made, value,
    label: `${value === 1 ? 'SB' : `${value}P`} ${made ? 'pogodak' : 'promašaj'}`,
  })
  const simple = (type, label, payload) => act({ kind: 'simple', type, label, payload })
  const opp = (specs, toast) => act({ kind: 'team', specs, toast })

  return (
    <div className="pad">
      <div className="shot">
        <div className="pad-label">Šut</div>
        <div className="grid2">
          <button className="btn good" onClick={() => shot(2, true)}>2P ✓</button>
          <button className="btn bad" onClick={() => shot(2, false)}>2P ✗</button>
          <button className="btn good" onClick={() => shot(3, true)}>3P ✓</button>
          <button className="btn bad" onClick={() => shot(3, false)}>3P ✗</button>
          <button className="btn good" onClick={() => shot(1, true)}>SB ✓</button>
          <button className="btn bad" onClick={() => shot(1, false)}>SB ✗</button>
        </div>
      </div>

      <div>
        <div className="pad-label">Skok i akcije</div>
        <div className="grid4">
          <button className="btn" onClick={() => simple(EV.REBOUND, 'Skok napadački', { off: true })}>Skok N</button>
          <button className="btn" onClick={() => simple(EV.REBOUND, 'Skok obrambeni', { off: false })}>Skok O</button>
          <button className="btn" onClick={() => simple(EV.ASSIST, 'Asistencija')}>AST</button>
          <button className="btn" onClick={() => simple(EV.BLOCK, 'Blokada')}>BLK</button>
          <button className="btn" onClick={() => act({ kind: 'steal', label: 'Ukradena lopta' })}>STL</button>
          <button className="btn" onClick={() => simple(EV.TURNOVER, 'Izgubljena lopta')}>TO</button>
          <button className="btn warn" onClick={() => act({ kind: 'foul', label: 'Prekršaj' })}>Prekršaj</button>
          <button className="btn" onClick={() => act({ kind: 'foulDrawn', label: 'Izborena osobna' })}>Izb. os.</button>
        </div>
      </div>

      <div>
        <div className="pad-label">Momčad</div>
        <div className={showSub ? 'grid3' : 'grid2'}>
          <button className="btn" onClick={() => opp([{ type: EV.TIMEOUT, playerId: null }], 'Time-out')}>Time-out</button>
          {showSub && <button className="btn" onClick={onOpenSub}>Zamjena</button>}
          <button className="btn" onClick={onOpenLineup}>Postava</button>
        </div>
      </div>

      <div>
        <div className="pad-label">Protivnik · {oppName}</div>
        <div className="grid3">
          <button className="btn opp" onClick={() => opp([{ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: true, value: 2, x: null, y: null } }], 'Protivnik +2')}>+2</button>
          <button className="btn opp" onClick={() => opp([{ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: true, value: 3, x: null, y: null } }], 'Protivnik +3')}>+3</button>
          <button className="btn opp" onClick={() => opp([{ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: true, value: 1, x: null, y: null } }], 'Protivnik +1')}>+1</button>
          <button className="btn opp" onClick={() => act({ kind: 'oppFoul', label: 'Prekršaj protivnika' })}>Prekršaj</button>
          <button className="btn opp" onClick={() => opp([{ type: EV.TURNOVER, team: TEAM.OPP, playerId: null }], 'Izgubljena protivnika')}>Izgubljena</button>
          <button className="btn opp" onClick={() => opp([{ type: EV.TIMEOUT, team: TEAM.OPP, playerId: null }], 'Time-out protivnika')}>Time-out</button>
        </div>
        {game.trackOpponentShots && (
          <div className="grid3" style={{ marginTop: 7 }}>
            <button className="btn opp" onClick={() => opp([{ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: false, value: 2, x: null, y: null } }], 'Protivnik 2P ✗')}>2P ✗</button>
            <button className="btn opp" onClick={() => opp([{ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: false, value: 3, x: null, y: null } }], 'Protivnik 3P ✗')}>3P ✗</button>
            <button className="btn opp" onClick={() => opp([{ type: EV.SHOT, team: TEAM.OPP, playerId: null, payload: { made: false, value: 1, x: null, y: null } }], 'Protivnik SB ✗')}>SB ✗</button>
          </div>
        )}
      </div>
    </div>
  )
}
