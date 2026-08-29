import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../state/GameContext.jsx'
import { EV, TEAM } from '../model/events.js'
import { shotValue } from '../model/court.js'
import useWakeLock from '../hooks/useWakeLock.js'
import useIsMobile from '../hooks/useIsMobile.js'
import Scoreboard from '../components/Scoreboard.jsx'
import RosterPanel from '../components/RosterPanel.jsx'
import PlayerChip from '../components/PlayerChip.jsx'
import ActionPad from '../components/ActionPad.jsx'
import SubPanel from '../components/SubPanel.jsx'
import PlayByPlay from '../components/PlayByPlay.jsx'
import BoxScore from '../components/BoxScore.jsx'
import Court from '../components/Court.jsx'
import ShotChart, { positionedShots } from '../components/ShotChart.jsx'

const SELECTION_TIMEOUT = 8000  // nedovrsen unos se sam ponistava

export default function GameScreen({ onExit }) {
  const { game, clock, stats, push, undo, toggleClock, setClock, nextPeriod } = useGame()
  const [tab, setTab] = useState('unos')
  const [statTab, setStatTab] = useState('box')
  const [mode, setMode] = useState('teren')      // mobitel: teren ili klasicni gumbi
  const [selectedId, setSelectedId] = useState(null)
  const [pendingShot, setPendingShot] = useState(null)
  const [subOpen, setSubOpen] = useState(false)
  const [benchOpen, setBenchOpen] = useState(false)
  const [flash, setFlash] = useState(null)
  const [toast, setToast] = useState(null)
  const selTimer = useRef(null)
  const shotTimer = useRef(null)
  const isMobile = useIsMobile()

  useWakeLock(!!game && game.status === 'live')

  // Nedovrsen unos (odabran igrac bez akcije) se ponistava nakon 8 s.
  useEffect(() => {
    clearTimeout(selTimer.current)
    if (selectedId && !pendingShot) selTimer.current = setTimeout(() => setSelectedId(null), SELECTION_TIMEOUT)
    return () => clearTimeout(selTimer.current)
  }, [selectedId, pendingShot])

  // Isto vrijedi i za poziciju suta koja ceka pogodak/promasaj.
  useEffect(() => {
    clearTimeout(shotTimer.current)
    if (pendingShot) shotTimer.current = setTimeout(() => setPendingShot(null), SELECTION_TIMEOUT)
    return () => clearTimeout(shotTimer.current)
  }, [pendingShot])

  const confirmFeedback = useCallback((kind, text) => {
    setFlash({ kind, at: Date.now() })
    setToast({ text, at: Date.now() })
    if (navigator.vibrate) { try { navigator.vibrate(25) } catch { /* ignore */ } }
    setTimeout(() => setFlash(null), 300)
    setTimeout(() => setToast(null), 1700)
  }, [])

  const byId = Object.fromEntries(game.roster.map((p) => [p.id, p]))
  const selPlayer = selectedId ? byId[selectedId] : null
  const selLabel = selPlayer ? `#${selPlayer.number} ${selPlayer.name}` : ''

  /** Zapisi akciju (jedan ili vise evenata kao jednu undo-grupu). */
  const act = useCallback((specs) => {
    const list = Array.isArray(specs) ? specs : [specs]
    push(list)
    const first = list[0]
    const kind = first.type === EV.SHOT ? (first.payload?.made ? 'good' : 'bad') : null
    confirmFeedback(kind, 'Zapisano')
    setSelectedId(null)
    setPendingShot(null)
  }, [push, confirmFeedback])

  const doUndo = useCallback(() => {
    const n = undo()
    confirmFeedback(null, n ? `Poništeno (${n})` : 'Nema što poništiti')
    setSelectedId(null)
    setPendingShot(null)
  }, [undo, confirmFeedback])

  const selectPlayer = (id) => setSelectedId((cur) => (cur === id ? null : id))

  // --- unos suta preko dijagrama: igrac -> pozicija -> pogodak/promasaj -----
  const pickPosition = useCallback((x, y) => {
    if (!selectedId) {
      confirmFeedback(null, 'Prvo odaberi igrača')
      return
    }
    setPendingShot({ x, y })
    if (navigator.vibrate) { try { navigator.vibrate(12) } catch { /* ignore */ } }
  }, [selectedId, confirmFeedback])

  const resolveShot = (made) => {
    if (!pendingShot || !selectedId) return
    act({
      type: EV.SHOT,
      playerId: selectedId,
      payload: { made, value: shotValue(pendingShot.x, pendingShot.y), x: pendingShot.x, y: pendingShot.y },
    })
  }

  const courtShots = useMemo(() => positionedShots(game), [game.events]) // eslint-disable-line

  const onCourt = stats.players.filter((r) => r.onCourt)
  const bench = stats.players.filter((r) => !r.onCourt)

  const pad = (
    <ActionPad
      game={game}
      selectedId={selectedId}
      selectedName={selLabel}
      act={act}
      compact
      onOpenSub={() => setSubOpen(true)}
    />
  )

  const courtBlock = (
    <div className="court-wrap">
      {/* dok traka čeka pogodak/promašaj uputa je suvišna i samo troši visinu */}
      {!pendingShot && (
        <div className={`hint ${selectedId ? 'ok' : ''}`}>
          {selectedId
            ? `${selLabel} — tapni poziciju`
            : 'Odaberi igrača pa poziciju šuta'}
        </div>
      )}
      <Court shots={courtShots} pending={pendingShot} onPick={pickPosition} />
      {!isMobile && (
        <div className="court-legend">
          <span><span className="dot" />pogodak</span>
          <span><span className="x">✕</span>promašaj</span>
          <span className="grow" />
          <span>2P/3P se određuje iz pozicije</span>
        </div>
      )}
    </div>
  )

  return (
    <div className="app no-scroll">
      <Scoreboard
        game={game}
        clock={clock}
        stats={stats}
        onToggleClock={toggleClock}
        onSetClock={setClock}
        onNextPeriod={nextPeriod}
        compact={isMobile}
      />

      <div className="tabs">
        <button className={`tab ${tab === 'unos' ? 'on' : ''}`} onClick={() => setTab('unos')}>Unos</button>
        <button className={`tab ${tab === 'log' ? 'on' : ''}`} onClick={() => setTab('log')}>
          Log{isMobile ? '' : ` (${game.events.length})`}
        </button>
        <button className={`tab ${tab === 'stat' ? 'on' : ''}`} onClick={() => setTab('stat')}>
          {isMobile ? 'Stat' : 'Statistika'}
        </button>
        <div className="grow" />
        <button className="btn sm bad" onClick={doUndo} style={{ marginBottom: 5 }}>↶ UNDO</button>
        <button className="btn sm ghost" onClick={onExit} style={{ marginBottom: 5 }}>☰</button>
      </div>

      {tab === 'unos' && (isMobile ? (
        // --- mobitel: sve stane na jedan ekran ---
        <div className={`m-wrap ${pendingShot ? 'pending' : ''}`}>
          <div className="m-strip">
            {onCourt.map((r) => (
              <PlayerChip
                key={r.player.id}
                row={r}
                trackTime={game.trackTime}
                selected={selectedId === r.player.id}
                onClick={() => selectPlayer(r.player.id)}
              />
            ))}
          </div>

          <button className="btn sm ghost wide" onClick={() => setBenchOpen((v) => !v)}>
            Klupa ({bench.length}) {benchOpen ? '▲' : '▼'}
          </button>
          {benchOpen && (
            <div className="m-bench">
              {bench.map((r) => (
                <PlayerChip
                  key={r.player.id}
                  row={r}
                  bench
                  trackTime={game.trackTime}
                  selected={selectedId === r.player.id}
                  onClick={() => selectPlayer(r.player.id)}
                />
              ))}
            </div>
          )}

          {!subOpen && (
            <div className="seg">
              <button className={mode === 'teren' ? 'on' : ''} onClick={() => setMode('teren')}>Teren</button>
              <button className={mode === 'gumbi' ? 'on' : ''} onClick={() => setMode('gumbi')}>Gumbi</button>
            </div>
          )}

          {/* teren se stisne u raspoloživu visinu; gumbi smiju skrolati */}
          <div className={!subOpen && mode === 'teren' ? 'm-pane-court' : 'm-pane-scroll'}>
            {subOpen
              ? <SubPanel stats={stats} act={act} onClose={() => setSubOpen(false)} />
              : (mode === 'teren' ? courtBlock : pad)}
          </div>
        </div>
      ) : (
        // --- tablet landscape: igrači | teren | gumbi ---
        <div className="main main3">
          <div className="side panel" style={{ padding: 8 }}>
            <RosterPanel stats={stats} game={game} selectedId={selectedId} onSelect={selectPlayer} />
          </div>
          <div className="panel court-panel" style={{ padding: 8 }}>
            {courtBlock}
          </div>
          <div className="work">
            {subOpen
              ? <SubPanel stats={stats} act={act} onClose={() => setSubOpen(false)} />
              : <div className="panel" style={{ padding: 10 }}>{pad}</div>}
          </div>
        </div>
      ))}

      {tab === 'log' && (
        <div className="scroll-page">
          <PlayByPlay game={game} />
        </div>
      )}

      {tab === 'stat' && (
        <div className="scroll-page">
          <div className="seg" style={{ marginBottom: 10, maxWidth: 320 }}>
            <button className={statTab === 'box' ? 'on' : ''} onClick={() => setStatTab('box')}>Box score</button>
            <button className={statTab === 'shot' ? 'on' : ''} onClick={() => setStatTab('shot')}>Shot chart</button>
          </div>
          {statTab === 'box' ? <BoxScore game={game} stats={stats} /> : <ShotChart game={game} />}
        </div>
      )}

      {/* potvrda šuta — traka, nikad modal */}
      {pendingShot && (
        <div className="prompt-bar">
          <div className="shot-bar">
            <span className="who">
              {selLabel} · {shotValue(pendingShot.x, pendingShot.y)}P
            </span>
            <button className="btn good lg b-ok" onClick={() => resolveShot(true)}>✓ POGODAK</button>
            <button className="btn bad lg b-no" onClick={() => resolveShot(false)}>✗ PROMAŠAJ</button>
            <button className="btn ghost sm b-cancel" onClick={() => setPendingShot(null)}>Odustani</button>
          </div>
        </div>
      )}

      {flash && <div className={`flash ${flash.kind || ''}`} key={flash.at} />}
      {toast && <div className="toast" key={toast.at}>{toast.text}</div>}
    </div>
  )
}
