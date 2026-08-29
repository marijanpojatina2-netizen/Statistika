import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useGame } from '../state/GameContext.jsx'
import { EV } from '../model/events.js'
import useWakeLock from '../hooks/useWakeLock.js'
import Scoreboard from '../components/Scoreboard.jsx'
import RosterPanel from '../components/RosterPanel.jsx'
import ActionPad from '../components/ActionPad.jsx'
import SubPanel from '../components/SubPanel.jsx'
import PlayByPlay from '../components/PlayByPlay.jsx'
import BoxScore from '../components/BoxScore.jsx'

const SELECTION_TIMEOUT = 8000  // nedovrsen unos se sam ponistava

export default function GameScreen({ onExit }) {
  const { game, clock, stats, push, undo, toggleClock, setClock, nextPeriod, setTrackTime } = useGame()
  const [tab, setTab] = useState('unos')
  const [selectedId, setSelectedId] = useState(null)
  const [subOpen, setSubOpen] = useState(false)
  const [flash, setFlash] = useState(null)
  const [toast, setToast] = useState(null)
  const selTimer = useRef(null)

  useWakeLock(!!game && game.status === 'live')

  // Nedovrsen unos (odabran igrac bez akcije) se ponistava nakon 8 s.
  useEffect(() => {
    clearTimeout(selTimer.current)
    if (selectedId) selTimer.current = setTimeout(() => setSelectedId(null), SELECTION_TIMEOUT)
    return () => clearTimeout(selTimer.current)
  }, [selectedId])

  const confirmFeedback = useCallback((kind, text) => {
    setFlash({ kind, at: Date.now() })
    setToast({ text, at: Date.now() })
    if (navigator.vibrate) { try { navigator.vibrate(25) } catch { /* ignore */ } }
    setTimeout(() => setFlash(null), 300)
    setTimeout(() => setToast(null), 1700)
  }, [])

  const byId = Object.fromEntries(game.roster.map((p) => [p.id, p]))
  const selPlayer = selectedId ? byId[selectedId] : null

  /** Zapisi akciju (jedan ili vise evenata kao jednu undo-grupu). */
  const act = useCallback((specs) => {
    const list = Array.isArray(specs) ? specs : [specs]
    push(list)
    const first = list[0]
    const kind = first.type === EV.SHOT ? (first.payload?.made ? 'good' : 'bad') : null
    confirmFeedback(kind, 'Zapisano')
    setSelectedId(null)
  }, [push, confirmFeedback])

  const doUndo = useCallback(() => {
    const n = undo()
    confirmFeedback(null, n ? `Poništeno (${n})` : 'Nema što poništiti')
    setSelectedId(null)
  }, [undo, confirmFeedback])

  const selectPlayer = (id) => setSelectedId((cur) => (cur === id ? null : id))

  return (
    <div className="app no-scroll">
      <Scoreboard
        game={game}
        clock={clock}
        stats={stats}
        onToggleClock={toggleClock}
        onSetClock={setClock}
        onNextPeriod={nextPeriod}
      />

      <div className="tabs">
        <button className={`tab ${tab === 'unos' ? 'on' : ''}`} onClick={() => setTab('unos')}>Unos</button>
        <button className={`tab ${tab === 'log' ? 'on' : ''}`} onClick={() => setTab('log')}>Log ({game.events.length})</button>
        <button className={`tab ${tab === 'stat' ? 'on' : ''}`} onClick={() => setTab('stat')}>Statistika</button>
        <div className="grow" />
        <button className="btn sm bad" onClick={doUndo} style={{ marginBottom: 6 }}>↶ UNDO</button>
        <button className="btn sm ghost" onClick={onExit} style={{ marginBottom: 6 }}>Izbornik</button>
      </div>

      {tab === 'unos' && (
        <div className="main">
          <div className="side panel" style={{ padding: 8, overflow: 'auto' }}>
            <RosterPanel
              stats={stats}
              game={game}
              selectedId={selectedId}
              onSelect={selectPlayer}
            />
          </div>
          <div className="work">
            {subOpen ? (
              <SubPanel stats={stats} act={act} onClose={() => setSubOpen(false)} />
            ) : (
              <div className="panel" style={{ padding: 10 }}>
                <ActionPad
                  game={game}
                  selectedId={selectedId}
                  selectedName={selPlayer ? `#${selPlayer.number} ${selPlayer.name}` : ''}
                  act={act}
                  onOpenSub={() => setSubOpen(true)}
                />
              </div>
            )}
            <div className="panel" style={{ padding: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="section-title">Vodi vrijeme</span>
                <div className="switch" style={{ width: 220 }}>
                  <button className={game.trackTime ? 'on' : ''} onClick={() => setTrackTime(true)}>DA</button>
                  <button className={!game.trackTime ? 'on' : ''} onClick={() => setTrackTime(false)}>NE</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div style={{ padding: 10, overflow: 'auto', flex: 1 }}>
          <PlayByPlay game={game} />
        </div>
      )}

      {tab === 'stat' && (
        <div style={{ padding: 10, overflow: 'auto', flex: 1 }}>
          <BoxScore game={game} stats={stats} />
        </div>
      )}

      {flash && <div className={`flash ${flash.kind || ''}`} key={flash.at} />}
      {toast && <div className="toast" key={toast.at}>{toast.text}</div>}
    </div>
  )
}
