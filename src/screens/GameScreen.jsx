import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import ChainBar from '../components/ChainBar.jsx'
import EventEditor from '../components/EventEditor.jsx'
import ShotChart, { positionedShots } from '../components/ShotChart.jsx'
import AdvancedStats from '../components/AdvancedStats.jsx'

const SELECTION_TIMEOUT = 8000   // nedovrsen unos se sam ponistava
const FOUL_LIMIT = 5

// Koliko dugo lancani upit stoji prije nego sam nestane. Flow slobodnih
// bacanja nema rok — bacanja traju, a traka ionako ne blokira ostali unos.
const CHAIN_TIMEOUT = {
  assist: 5000,
  rebound: 6000,
  stolen: 5000,
  foulcount: 6000,
  ftwho: 6000,
  ftcount: 8000,
  ft: 0,
}

export default function GameScreen({ onExit }) {
  const { game, clock, stats, push, pushInto, undo, updateEvent, deleteEvent, toggleClock, setClock, nextPeriod } = useGame()
  const [tab, setTab] = useState('unos')
  const [statTab, setStatTab] = useState('box')
  const [mode, setMode] = useState('teren')      // mobitel: teren ili klasicni gumbi
  const [selectedId, setSelectedId] = useState(null)
  const [pendingShot, setPendingShot] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [chain, setChain] = useState(null)
  const [subOpen, setSubOpen] = useState(false)
  const [subOutId, setSubOutId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [benchOpen, setBenchOpen] = useState(false)
  const [flash, setFlash] = useState(null)
  const [toast, setToast] = useState(null)
  const selTimer = useRef(null)
  const shotTimer = useRef(null)
  const actionTimer = useRef(null)
  const chainTimer = useRef(null)
  const isMobile = useIsMobile()

  useWakeLock(!!game && game.status === 'live')

  const byId = useMemo(
    () => Object.fromEntries(game.roster.map((p) => [p.id, p])),
    [game.roster],
  )
  const selPlayer = selectedId ? byId[selectedId] : null
  const selLabel = selPlayer ? `#${selPlayer.number} ${selPlayer.name}` : ''
  const onCourt = stats.players.filter((r) => r.onCourt)
  const bench = stats.players.filter((r) => !r.onCourt)

  // --- automatsko poništavanje nedovršenih unosa ---------------------------
  useEffect(() => {
    clearTimeout(selTimer.current)
    if (selectedId && !pendingShot) selTimer.current = setTimeout(() => setSelectedId(null), SELECTION_TIMEOUT)
    return () => clearTimeout(selTimer.current)
  }, [selectedId, pendingShot])

  useEffect(() => {
    clearTimeout(shotTimer.current)
    if (pendingShot) shotTimer.current = setTimeout(() => setPendingShot(null), SELECTION_TIMEOUT)
    return () => clearTimeout(shotTimer.current)
  }, [pendingShot])

  useEffect(() => {
    clearTimeout(actionTimer.current)
    if (pendingAction) actionTimer.current = setTimeout(() => setPendingAction(null), SELECTION_TIMEOUT)
    return () => clearTimeout(actionTimer.current)
  }, [pendingAction])

  useEffect(() => {
    clearTimeout(chainTimer.current)
    const ms = chain ? CHAIN_TIMEOUT[chain.kind] : 0
    if (chain && ms > 0) chainTimer.current = setTimeout(() => setChain(null), ms)
    return () => clearTimeout(chainTimer.current)
  }, [chain])

  const confirmFeedback = useCallback((kind, text) => {
    setFlash({ kind, at: Date.now() })
    setToast({ text, at: Date.now() })
    if (navigator.vibrate) { try { navigator.vibrate(25) } catch { /* ignore */ } }
    setTimeout(() => setFlash(null), 300)
    setTimeout(() => setToast(null), 1700)
  }, [])

  /** Koji lančani upit slijedi nakon zapisane akcije. */
  const nextChain = useCallback((spec, group) => {
    const team = spec.team || TEAM.US
    const pl = spec.payload || {}
    if (spec.type === EV.SHOT && pl.value !== 1) {
      if (team === TEAM.US && pl.made && spec.playerId) return { kind: 'assist', group, shooterId: spec.playerId }
      if (!pl.made) return { kind: 'rebound', group, byUs: team === TEAM.US }
    }
    if (spec.type === EV.TURNOVER && team === TEAM.US && spec.playerId) return { kind: 'stolen', group }
    if (spec.type === EV.FOUL && team === TEAM.US) return { kind: 'foulcount', group }
    if (spec.type === EV.FOUL && team === TEAM.OPP) return { kind: 'ftwho', group }
    return null
  }, [])

  /** Zapiši akciju (jedna undo-grupa) i otvori lančani upit ako slijedi. */
  const act = useCallback((specs) => {
    const list = Array.isArray(specs) ? specs : [specs]
    const first = list[0]

    // Akcija odabrana prije igrača — pričekaj da se tapne igrač.
    if (first.needsPlayer && !first.playerId) {
      setChain(null)
      setPendingShot(null)
      setPendingAction(list)
      if (navigator.vibrate) { try { navigator.vibrate(12) } catch { /* ignore */ } }
      return
    }

    // Ukradena lopta našeg igrača = izgubljena lopta protivnika (momčadski).
    const full = [...list]
    if (first.type === EV.STEAL && (first.team || TEAM.US) === TEAM.US) {
      full.push({ type: EV.TURNOVER, team: TEAM.OPP, playerId: null })
    }

    const group = push(full)
    const kind = first.type === EV.SHOT ? (first.payload?.made ? 'good' : 'bad') : null
    confirmFeedback(kind, 'Zapisano')
    setSelectedId(null)
    setPendingShot(null)
    setPendingAction(null)
    setChain(nextChain(first, group))

    // Peti prekršaj — igrač mora van, odmah otvori zamjenu.
    if (first.type === EV.FOUL && (first.team || TEAM.US) === TEAM.US && first.playerId) {
      const row = stats.players.find((r) => r.player.id === first.playerId)
      if (row && row.pf + 1 >= FOUL_LIMIT) {
        setSubOutId(first.playerId)
        setSubOpen(true)
      }
    }
  }, [push, confirmFeedback, nextChain, stats.players])

  const doUndo = useCallback(() => {
    const n = undo()
    confirmFeedback(null, n ? `Poništeno (${n})` : 'Nema što poništiti')
    setSelectedId(null)
    setPendingShot(null)
    setPendingAction(null)
    setChain(null)
  }, [undo, confirmFeedback])

  /** Tap na igrača dovršava akciju ili šut koji čeka, inače samo bira igrača. */
  const selectPlayer = (id) => {
    if (pendingAction) {
      act(pendingAction.map((sp) => (sp.needsPlayer ? { ...sp, playerId: id } : sp)))
      return
    }
    if (pendingShot && !pendingShot.playerId) {
      setPendingShot({ ...pendingShot, playerId: id })
      return
    }
    setSelectedId((cur) => (cur === id ? null : id))
  }

  // --- unos šuta preko dijagrama -------------------------------------------
  const pickPosition = useCallback((x, y) => {
    setChain(null)
    setPendingAction(null)
    // Igrač se bira poslije pozicije ako još nije odabran.
    setPendingShot({ x, y, playerId: selectedId })
    if (navigator.vibrate) { try { navigator.vibrate(12) } catch { /* ignore */ } }
  }, [selectedId])

  const resolveShot = (made) => {
    if (!pendingShot?.playerId) return
    act({
      type: EV.SHOT,
      playerId: pendingShot.playerId,
      payload: { made, value: shotValue(pendingShot.x, pendingShot.y), x: pendingShot.x, y: pendingShot.y },
    })
  }

  // --- lančani upiti --------------------------------------------------------
  const chained = (specs) => {
    pushInto(chain.group, Array.isArray(specs) ? specs : [specs])
    confirmFeedback(null, 'Zapisano')
  }

  /** Slobodno bacanje ide u vlastitu grupu — pojedinačni UNDO po bacanju. */
  const recordFreeThrow = (made) => {
    const { side, shooterId, total, idx } = chain
    push([{
      type: EV.SHOT,
      team: side === 'opp' ? TEAM.OPP : TEAM.US,
      playerId: side === 'opp' ? null : shooterId,
      payload: { made, value: 1, x: null, y: null },
    }])
    confirmFeedback(made ? 'good' : 'bad', `SB ${idx + 1}/${total}`)
    const last = idx + 1 >= total
    if (!last) {
      setChain({ ...chain, idx: idx + 1 })
    } else if (!made) {
      // promašeno zadnje bacanje — lopta je živa, pitaj za skok
      setChain({ kind: 'rebound', group: chain.group, byUs: side !== 'opp' })
    } else {
      setChain(null)
    }
  }

  const chainView = useMemo(() => {
    if (!chain) return null
    const playerOpts = (rows, onPick, cls) => rows.map((r) => ({
      key: r.player.id,
      label: `#${r.player.number} ${r.player.name}`,
      cls,
      onClick: () => onPick(r.player.id),
    }))

    switch (chain.kind) {
      case 'assist': {
        const rows = onCourt.filter((r) => r.player.id !== chain.shooterId)
        return {
          title: 'Asistencija?',
          note: 'nestaje za 5 s',
          options: [
            ...playerOpts(rows, (id) => { chained({ type: EV.ASSIST, playerId: id }); setChain(null) }),
            { key: 'no', label: 'Bez asistencije', cls: 'ghost', onClick: () => setChain(null) },
          ],
        }
      }
      case 'rebound': {
        const ourOff = chain.byUs   // naš skok nakon našeg promašaja = napadački
        return {
          title: 'Skok?',
          note: ourOff ? 'naš = napadački' : 'naš = obrambeni',
          options: [
            ...playerOpts(onCourt, (id) => {
              chained({ type: EV.REBOUND, playerId: id, payload: { off: ourOff } })
              setChain(null)
            }, 'good'),
            {
              key: 'opp',
              label: 'Protivnik',
              onClick: () => {
                chained({ type: EV.REBOUND, team: TEAM.OPP, playerId: null, payload: { off: !ourOff } })
                setChain(null)
              },
            },
            {
              key: 'out',
              label: 'Van',
              cls: 'ghost',
              onClick: () => { chained({ type: EV.DEADBALL, payload: { reason: 'out' } }); setChain(null) },
            },
          ],
        }
      }
      case 'stolen':
        return {
          title: 'Ukradena protivnika?',
          note: 'nestaje za 5 s',
          options: [
            {
              key: 'yes',
              label: 'DA',
              cls: 'good',
              onClick: () => { chained({ type: EV.STEAL, team: TEAM.OPP, playerId: null }); setChain(null) },
            },
            { key: 'no', label: 'NE', cls: 'ghost', onClick: () => setChain(null) },
          ],
        }
      case 'foulcount': {
        const oppBonus = (stats.teamFouls[clock.period]?.us || 0) >= 5
        return {
          title: 'Prekršaj na šutu — koliko bacanja protivniku?',
          note: oppBonus ? 'BONUS — svaki prekršaj nosi 2 bacanja' : undefined,
          options: [
            { key: '0', label: 'Bez bacanja', cls: 'ghost', onClick: () => setChain(null) },
            ...[1, 2, 3].map((n) => ({
              key: String(n),
              label: `${n} ${n === 1 ? 'bacanje' : 'bacanja'}`,
              cls: 'primary',
              onClick: () => setChain({ kind: 'ft', group: chain.group, side: 'opp', shooterId: null, total: n, idx: 0 }),
            })),
          ],
        }
      }
      case 'ftwho': {
        const usBonus = (stats.teamFouls[clock.period]?.opp || 0) >= 5
        return {
          title: 'Slobodna bacanja — tko izvodi?',
          note: usBonus ? 'BONUS — svaki prekršaj nosi 2 bacanja' : undefined,
          options: [
            ...playerOpts(onCourt, (id) => {
              chained({ type: EV.FOUL_DRAWN, playerId: id })
              setChain({ kind: 'ftcount', group: chain.group, shooterId: id })
            }),
            { key: 'no', label: 'Bez bacanja', cls: 'ghost', onClick: () => setChain(null) },
          ],
        }
      }
      case 'ftcount': {
        const p = byId[chain.shooterId]
        return {
          title: `#${p?.number} ${p?.name} — koliko bacanja?`,
          options: [1, 2, 3].map((n) => ({
            key: String(n),
            label: `${n} ${n === 1 ? 'bacanje' : 'bacanja'}`,
            cls: 'primary',
            onClick: () => setChain({ kind: 'ft', group: chain.group, side: 'us', shooterId: chain.shooterId, total: n, idx: 0 }),
          })),
        }
      }
      case 'ft': {
        const p = chain.shooterId ? byId[chain.shooterId] : null
        const who = p ? `#${p.number} ${p.name}` : (game.awayName || 'Protivnik')
        return {
          title: `${who} — ${chain.idx + 1}. od ${chain.total}`,
          options: [
            { key: 'in', label: '✓ POGODAK', cls: 'good lg', onClick: () => recordFreeThrow(true) },
            { key: 'out', label: '✗ PROMAŠAJ', cls: 'bad lg', onClick: () => recordFreeThrow(false) },
            { key: 'stop', label: 'Prekini', cls: 'ghost', onClick: () => setChain(null) },
          ],
        }
      }
      default: return null
    }
  }, [chain, onCourt, byId, game.awayName, stats.teamFouls, clock.period]) // eslint-disable-line

  const playerLabel = (id) => {
    const p = byId[id]
    return p ? `#${p.number} ${p.name}` : ''
  }

  /** Gumbi igrača na parketu za trake koje čekaju odabir igrača. */
  const whoOptions = (onPick) => onCourt.map((r) => ({
    key: r.player.id,
    label: `#${r.player.number} ${r.player.name}`,
    onClick: () => onPick(r.player.id),
  }))

  const courtShots = useMemo(() => positionedShots(game), [game.events]) // eslint-disable-line
  const editEvent = editId ? game.events.find((e) => e.id === editId) : null

  const pad = (
    <ActionPad
      game={game}
      selectedId={selectedId}
      selectedName={selLabel}
      act={act}
      compact
      onOpenSub={() => { setSubOutId(null); setSubOpen(true) }}
    />
  )

  const courtBlock = (
    <div className="court-wrap">
      {!pendingShot && (
        <div className={`hint ${selectedId ? 'ok' : ''}`}>
          {selectedId ? `${selLabel} — tapni poziciju` : 'Tapni poziciju šuta, pa igrača'}
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

  const barOpen = !!pendingShot || !!pendingAction || !!chainView

  // Traka na dnu je fiksna — izmjeri je i rezerviraj točno toliko prostora,
  // da ni teren ni gumbi ne završe ispod nje.
  const [barH, setBarH] = useState(0)
  useLayoutEffect(() => {
    const el = document.querySelector('.prompt-bar')
    setBarH(el ? el.offsetHeight : 0)
  }, [pendingShot, chain, isMobile, tab])
  const barPad = barOpen && barH ? { paddingBottom: barH + 10 } : undefined

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
        <div className="m-wrap" style={barPad}>
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

          <div className={!subOpen && mode === 'teren' ? 'm-pane-court' : 'm-pane-scroll'}>
            {subOpen
              ? <SubPanel stats={stats} act={act} initialOutId={subOutId} onClose={() => setSubOpen(false)} />
              : (mode === 'teren' ? courtBlock : pad)}
          </div>
        </div>
      ) : (
        <div className="main main3" style={barPad}>
          <div className="side panel" style={{ padding: 8 }}>
            <RosterPanel stats={stats} game={game} selectedId={selectedId} onSelect={selectPlayer} />
          </div>
          <div className="panel court-panel" style={{ padding: 8 }}>
            {courtBlock}
          </div>
          <div className="work">
            {subOpen
              ? <SubPanel stats={stats} act={act} initialOutId={subOutId} onClose={() => setSubOpen(false)} />
              : <div className="panel" style={{ padding: 10 }}>{pad}</div>}
          </div>
        </div>
      ))}

      {tab === 'log' && (
        <div className="scroll-page">
          {editEvent && (
            <EventEditor
              game={game}
              event={editEvent}
              onSave={(patch) => {
                updateEvent(editEvent.id, patch)
                setEditId(null)
                confirmFeedback(null, 'Izmijenjeno')
              }}
              onDelete={() => {
                deleteEvent(editEvent.id)
                setEditId(null)
                confirmFeedback(null, 'Obrisano')
              }}
              onClose={() => setEditId(null)}
            />
          )}
          <PlayByPlay game={game} selectedId={editId} onSelectEvent={(ev) => setEditId((c) => (c === ev.id ? null : ev.id))} />
        </div>
      )}

      {tab === 'stat' && (
        <div className="scroll-page">
          <div className="seg" style={{ marginBottom: 10, maxWidth: 420 }}>
            <button className={statTab === 'box' ? 'on' : ''} onClick={() => setStatTab('box')}>Box score</button>
            <button className={statTab === 'shot' ? 'on' : ''} onClick={() => setStatTab('shot')}>Shot chart</button>
            <button className={statTab === 'adv' ? 'on' : ''} onClick={() => setStatTab('adv')}>Napredno</button>
          </div>
          {statTab === 'box' && <BoxScore game={game} stats={stats} />}
          {statTab === 'shot' && <ShotChart game={game} />}
          {statTab === 'adv' && <AdvancedStats game={game} stats={stats} />}
        </div>
      )}

      {/* trake na dnu: šut ima prednost, pa akcija koja čeka igrača, pa lančani upit */}
      {pendingShot ? (
        pendingShot.playerId ? (
          <div className="prompt-bar">
            <div className="shot-bar">
              <span className="who">
                {playerLabel(pendingShot.playerId)} · {shotValue(pendingShot.x, pendingShot.y)}P
              </span>
              <button className="btn good lg b-ok" onClick={() => resolveShot(true)}>✓ POGODAK</button>
              <button className="btn bad lg b-no" onClick={() => resolveShot(false)}>✗ PROMAŠAJ</button>
              <button className="btn ghost sm b-cancel" onClick={() => setPendingShot(null)}>Odustani</button>
            </div>
          </div>
        ) : (
          <ChainBar
            title={`Šut ${shotValue(pendingShot.x, pendingShot.y)}P — tko je šutirao?`}
            note="ili tapni igrača u popisu"
            options={whoOptions((id) => setPendingShot({ ...pendingShot, playerId: id }))}
            onClose={() => setPendingShot(null)}
          />
        )
      ) : pendingAction ? (
        <ChainBar
          title={`${pendingAction[0].label} — tko?`}
          note="ili tapni igrača u popisu"
          options={whoOptions((id) => act(pendingAction.map((sp) => (sp.needsPlayer ? { ...sp, playerId: id } : sp))))}
          onClose={() => setPendingAction(null)}
        />
      ) : chainView && (
        <ChainBar
          title={chainView.title}
          note={chainView.note}
          options={chainView.options}
          onClose={() => setChain(null)}
        />
      )}

      {flash && <div className={`flash ${flash.kind || ''}`} key={flash.at} />}
      {toast && (
        <div
          className="toast"
          key={toast.at}
          style={isMobile && barOpen && barH ? { bottom: barH + 14 } : undefined}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
