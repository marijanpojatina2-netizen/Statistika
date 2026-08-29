import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../state/GameContext.jsx'
import { EV, TEAM } from '../model/events.js'
import { shotValue } from '../model/court.js'
import { fmtClock } from '../model/derive.js'
import useWakeLock from '../hooks/useWakeLock.js'
import useIsMobile from '../hooks/useIsMobile.js'
import useFullscreen from '../hooks/useFullscreen.js'
import Crest from '../components/Crest.jsx'
import Court from '../components/Court.jsx'
import PlayerCard from '../components/PlayerCard.jsx'
import PlayerChip from '../components/PlayerChip.jsx'
import PromptModal from '../components/PromptModal.jsx'
import FreeThrowBar from '../components/FreeThrowBar.jsx'
import ActionPad from '../components/ActionPad.jsx'
import LineupPanel from '../components/LineupPanel.jsx'
import EventEditor from '../components/EventEditor.jsx'
import PlayByPlay from '../components/PlayByPlay.jsx'
import StatsTab from '../components/StatsTab.jsx'
import ClockEditor from '../components/ClockEditor.jsx'
import { positionedShots } from '../components/ShotChart.jsx'

const SELECT_TIMEOUT = 8000
const FOUL_LIMIT = 5
const BONUS = 5
const DRAG_THRESHOLD = 12

export default function GameScreen({ onExit }) {
  const {
    game, clock, stats, push, pushInto, undo, updateEvent, deleteEvent, removeFromGroup,
    setLineup, addPlayer, toggleClock, setClock, nextPeriod,
  } = useGame()

  const [tab, setTab] = useState('unos')
  const [selectedId, setSelectedId] = useState(null)
  const [pendingShot, setPendingShot] = useState(null)   // { x, y, playerId }
  const [pendingAction, setPendingAction] = useState(null)
  const [chain, setChain] = useState(null)
  const [drag, setDrag] = useState(null)
  const [dragLock, setDragLock] = useState(false)
  const [lineupOpen, setLineupOpen] = useState(false)
  const [benchOpen, setBenchOpen] = useState(false)
  const [clockEdit, setClockEdit] = useState(false)
  const [confirmNext, setConfirmNext] = useState(false)
  const [editId, setEditId] = useState(null)
  const [mode, setMode] = useState('teren')
  const [toast, setToast] = useState(null)
  const [flash, setFlash] = useState(null)

  const selTimer = useRef(null)
  const chainTimer = useRef(null)
  const toastTimer = useRef(null)
  const suppressTap = useRef(0)
  const handleDragRef = useRef(false)
  const scrollColRef = useRef(null)
  const autoRef = useRef({ raf: 0, vy: 0, x: 0, y: 0, fromBench: false })
  const isMobile = useIsMobile()
  const fullscreen = useFullscreen()

  useWakeLock(!!game && game.status === 'live')

  const byId = useMemo(() => Object.fromEntries(game.roster.map((p) => [p.id, p])), [game.roster])
  const onCourt = stats.players.filter((r) => r.onCourt)
  const bench = stats.players.filter((r) => !r.onCourt)
  const usName = game.weAreHome ? game.homeName : game.awayName
  const oppName = game.weAreHome ? game.awayName : game.homeName
  const label = (id) => { const p = byId[id]; return p ? `#${p.number} ${p.name}` : '' }

  // --- povratna informacija -------------------------------------------------
  const say = useCallback((text, kind = null) => {
    clearTimeout(toastTimer.current)
    setToast(text)
    setFlash({ kind, at: Date.now() })
    if (navigator.vibrate) { try { navigator.vibrate(22) } catch { /* ignore */ } }
    toastTimer.current = setTimeout(() => setToast(null), 1600)
    setTimeout(() => setFlash(null), 300)
  }, [])

  const openChain = useCallback((next, ms = 0) => {
    clearTimeout(chainTimer.current)
    setChain(next)
    if (next && ms > 0) chainTimer.current = setTimeout(() => setChain(null), ms)
  }, [])

  /** Sve osim tekućih slobodnih bacanja — ona namjerno preživljavaju druge unose. */
  const clearChainUnlessFt = useCallback(() => {
    setChain((c) => (c && c.kind === 'ft' ? c : null))
  }, [])

  useEffect(() => {
    clearTimeout(selTimer.current)
    if (selectedId && !pendingShot && !pendingAction) {
      selTimer.current = setTimeout(() => setSelectedId(null), SELECT_TIMEOUT)
    }
    return () => clearTimeout(selTimer.current)
  }, [selectedId, pendingShot, pendingAction])

  // --- zapisivanje ----------------------------------------------------------
  const record = useCallback((specs, opts = {}) => {
    const list = Array.isArray(specs) ? specs : [specs]
    const group = opts.group ? (pushInto(opts.group, list), opts.group) : push(list)
    setSelectedId(null)
    setPendingShot(null)
    setPendingAction(null)
    say(opts.toast || 'Zapisano', opts.kind)
    return group
  }, [push, pushInto, say])

  const teamFouls = (side) => stats.teamFouls[clock.period]?.[side] || 0

  const startFT = useCallback((ft) => openChain({ kind: 'ft', idx: 0, ...ft }, 0), [openChain])

  /** Zatvara lanac, ali prvo odradi obaveznu zamjenu ako ju je netko odgodio. */
  const endChain = useCallback((c) => {
    if (c && c.foulOut) openChain({ kind: 'subIn', outId: c.foulOut }, 0)
    else openChain(null)
  }, [openChain])

  const afterOurShot = useCallback((group, made, value, shooterId) => {
    if (value === 1) return
    if (made && shooterId) openChain({ kind: 'assist', group, shooterId, value }, 9000)
    else if (!made) openChain({ kind: 'rebound', group, byUs: true, shooterId, value }, 10000)
    else openChain(null)
  }, [openChain])

  /** Dovrši akciju kad je poznat igrač. */
  const completeAction = useCallback((spec, pid) => {
    if (spec.kind === 'shot') {
      const group = record(
        [{ type: EV.SHOT, playerId: pid, payload: { made: spec.made, value: spec.value, x: null, y: null } }],
        { toast: spec.label, kind: spec.made ? 'good' : 'bad' },
      )
      afterOurShot(group, spec.made, spec.value, pid)
      return
    }
    if (spec.kind === 'foul') {
      const row = stats.players.find((r) => r.player.id === pid)
      const willFoulOut = row && row.pf + 1 >= FOUL_LIMIT
      const inBonus = teamFouls('us') + 1 >= BONUS
      const group = record([{ type: EV.FOUL, playerId: pid, payload: { kind: 'personal' } }], { toast: 'Prekršaj' })
      if (willFoulOut) say('5. prekršaj — obavezna zamjena')
      // U bonusu bacanja slijede i kad je to igračeva peta osobna; zamjena se
      // otvori tek kad bacanja završe (`foulOut` putuje kroz lanac).
      if (inBonus) startFT({ group, shooterId: null, side: 'opp', total: 2, foulOut: willFoulOut ? pid : null })
      else if (willFoulOut) openChain({ kind: 'subIn', outId: pid }, 0)
      return
    }
    if (spec.kind === 'foulDrawn') {
      const inBonus = teamFouls('opp') + 1 >= BONUS
      const group = record(
        [{ type: EV.FOUL, team: TEAM.OPP, playerId: null, payload: { kind: 'personal' } },
          { type: EV.FOUL_DRAWN, playerId: pid }],
        { toast: 'Izborena osobna' },
      )
      if (inBonus) startFT({ group, shooterId: pid, side: 'us', total: 2 })
      return
    }
    if (spec.kind === 'steal') {
      record([{ type: EV.STEAL, playerId: pid }, { type: EV.TURNOVER, team: TEAM.OPP, playerId: null }], { toast: 'Ukradena lopta' })
      return
    }
    record([{ type: spec.type, playerId: pid, payload: spec.payload || {} }], { toast: spec.label })
  }, [record, afterOurShot, stats.players, startFT, openChain, say]) // eslint-disable-line

  /** Klik na akcijski gumb — dovrši odmah ako je igrač odabran, inače čekaj igrača. */
  const act = useCallback((spec) => {
    if (spec.kind === 'team') {
      record(spec.specs, { toast: spec.toast })
      return
    }
    if (spec.kind === 'oppFoul') {
      const inBonus = teamFouls('opp') + 1 >= BONUS
      const group = record([{ type: EV.FOUL, team: TEAM.OPP, playerId: null, payload: { kind: 'personal' } }], { toast: 'Prekršaj protivnika' })
      openChain({ kind: 'oppFoulWho', group, bonus: inBonus }, 8000)
      return
    }
    if (selectedId) { completeAction(spec, selectedId); return }
    clearChainUnlessFt()
    setPendingShot(null)
    setPendingAction(spec)
  }, [selectedId, completeAction, record, clearChainUnlessFt, openChain]) // eslint-disable-line

  // --- slobodna bacanja -----------------------------------------------------
  const recordFT = (made) => {
    const c = chain
    if (!c || c.kind !== 'ft') return
    record(
      [{ type: EV.SHOT, team: c.side === 'opp' ? TEAM.OPP : TEAM.US, playerId: c.side === 'opp' ? null : c.shooterId, payload: { made, value: 1, x: null, y: null } }],
      { group: c.group, toast: `SB ${c.idx + 1}/${c.total} ${made ? '✓' : '✗'}`, kind: made ? 'good' : 'bad' },
    )
    if (c.idx + 1 < c.total) openChain({ ...c, idx: c.idx + 1 }, 0)
    else if (!made) openChain({ kind: 'rebound', group: c.group, byUs: c.side !== 'opp', shooterId: null, value: 0, foulOut: c.foulOut }, 10000)
    else endChain(c)
  }

  // --- teren ----------------------------------------------------------------
  const pickPosition = useCallback((x, y) => {
    clearChainUnlessFt()
    setPendingAction(null)
    setPendingShot({ x, y, playerId: selectedId })
    if (navigator.vibrate) { try { navigator.vibrate(12) } catch { /* ignore */ } }
  }, [selectedId, clearChainUnlessFt])

  const resolveShot = (made) => {
    const ps = pendingShot
    if (!ps || !ps.playerId) return
    const value = shotValue(ps.x, ps.y)
    const group = record(
      [{ type: EV.SHOT, playerId: ps.playerId, payload: { made, value, x: ps.x, y: ps.y } }],
      { toast: `${value}P ${made ? 'pogodak' : 'promašaj'}`, kind: made ? 'good' : 'bad' },
    )
    afterOurShot(group, made, value, ps.playerId)
  }

  // --- tap na igrača --------------------------------------------------------
  const tapPlayer = (id) => {
    if (Date.now() - suppressTap.current < 400) return
    if (pendingAction) { completeAction(pendingAction, id); return }
    if (pendingShot && !pendingShot.playerId) { setPendingShot({ ...pendingShot, playerId: id }); return }
    if (chain) {
      const c = chain
      if (c.kind === 'assist') {
        if (id !== c.shooterId) record([{ type: EV.ASSIST, playerId: id }], { group: c.group, toast: 'Asistencija' })
        openChain(null); return
      }
      if (c.kind === 'rebound') {
        record([{ type: EV.REBOUND, playerId: id, payload: { off: c.byUs } }], { group: c.group, toast: `Skok ${c.byUs ? 'napadački' : 'obrambeni'}` })
        endChain(c); return
      }
      if (c.kind === 'oppFoulWho') { completeOppFoulWho(id); return }
      if (c.kind === 'subOut') { openChain({ kind: 'subIn', outId: id }, 0); return }
      if (c.kind === 'subIn') {
        record([{ type: EV.SUB, playerId: null, payload: { outId: c.outId, inId: id } }], { toast: 'Zamjena zapisana' })
        openChain(null); return
      }
    }
    setSelectedId((cur) => (cur === id ? null : id))
  }

  const completeOppFoulWho = (id) => {
    const c = chain
    record([{ type: EV.FOUL_DRAWN, playerId: id }], { group: c.group, toast: 'Izborena osobna' })
    if (c.bonus) startFT({ group: c.group, shooterId: id, side: 'us', total: 2 })
    else openChain(null)
  }

  // --- drag & drop zamjena ---------------------------------------------------
  // Tri puta: ručka (touch-action none — preglednik nikad ne preuzme gestu),
  // zadržavanje prsta na kartici, i miš s pragom od 12 px.
  const beginDrag = (id, fromBench, x, y) => {
    setDragLock(true)
    if (navigator.vibrate) { try { navigator.vibrate(15) } catch { /* ignore */ } }
    setDrag({ id, fromBench, x, y, overId: null })
  }

  // Popis se sam skrola kad se igraca dovuce blizu ruba stupca — bez toga se
  // ne moze doci do izmjena koje nisu na ekranu.
  const autoScrollTick = () => {
    const a = autoRef.current
    const el = scrollColRef.current
    if (!el || a.vy === 0) { a.raf = 0; return }
    el.scrollTop += a.vy
    setDrag((d) => (d ? { ...d, overId: targetUnder(a.x, a.y, a.fromBench) } : d))
    a.raf = requestAnimationFrame(autoScrollTick)
  }
  const updateAutoScroll = (x, y, fromBench) => {
    const a = autoRef.current
    a.x = x; a.y = y; a.fromBench = fromBench
    let vy = 0
    const el = scrollColRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      const EDGE = 70
      if (y < r.top + EDGE) vy = -Math.min(16, Math.ceil((r.top + EDGE - y) / 4))
      else if (y > r.bottom - EDGE) vy = Math.min(16, Math.ceil((y - (r.bottom - EDGE)) / 4))
    }
    a.vy = vy
    if (vy !== 0 && !a.raf) a.raf = requestAnimationFrame(autoScrollTick)
  }
  const stopAutoScroll = () => {
    const a = autoRef.current
    a.vy = 0
    if (a.raf) cancelAnimationFrame(a.raf)
    a.raf = 0
  }

  const targetUnder = (x, y, fromBench) => {
    const el = document.elementFromPoint(x, y)
    const card = el && el.closest ? el.closest('[data-pid]') : null
    const wantZone = fromBench ? 'on' : 'bench'
    return card && card.getAttribute('data-zone') === wantZone ? card.getAttribute('data-pid') : null
  }

  const finishDrag = (id, fromBench) => {
    stopAutoScroll()
    setDragLock(false)
    suppressTap.current = Date.now()
    setDrag((d) => {
      if (d && d.overId) {
        const outId = fromBench ? d.overId : id
        const inId = fromBench ? id : d.overId
        record([{ type: EV.SUB, playerId: null, payload: { outId, inId } }], { toast: 'Zamjena zapisana' })
      }
      return null
    })
  }

  const abortDrag = () => {
    stopAutoScroll()
    setDragLock(false)
    suppressTap.current = Date.now()
    setDrag(null)
  }

  // Dugi pritisak inace otvara kontekstni izbornik / oznacavanje teksta, a
  // oboje salje touchcancel koji ubija gestu — blokiraj ih dok gesta traje.
  const guardGesture = () => {
    const prevent = (ev) => ev.preventDefault()
    window.addEventListener('contextmenu', prevent)
    window.addEventListener('selectstart', prevent)
    return () => {
      window.removeEventListener('contextmenu', prevent)
      window.removeEventListener('selectstart', prevent)
    }
  }

  /** Ručka: povlačenje kreće odmah — touch-action none jamči da gesta preživi. */
  const startHandleDrag = (e, id, fromBench) => {
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    handleDragRef.current = true
    const pointerId = e.pointerId
    const el = e.currentTarget
    try { el.setPointerCapture(pointerId) } catch { /* nije nužno */ }
    const unguard = guardGesture()
    const block = (ev) => { if (ev.cancelable) ev.preventDefault() }
    window.addEventListener('touchmove', block, { passive: false })
    beginDrag(id, fromBench, e.clientX, e.clientY)

    const cleanup = () => {
      handleDragRef.current = false
      unguard()
      window.removeEventListener('touchmove', block, { passive: false })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    const move = (ev) => {
      if (ev.pointerId !== pointerId) return
      setDrag({ id, fromBench, x: ev.clientX, y: ev.clientY, overId: targetUnder(ev.clientX, ev.clientY, fromBench) })
      updateAutoScroll(ev.clientX, ev.clientY, fromBench)
    }
    const up = (ev) => {
      if (ev.pointerId !== pointerId) return
      cleanup()
      finishDrag(id, fromBench)
    }
    const cancel = (ev) => {
      if (ev.pointerId !== pointerId) return
      cleanup()
      abortDrag()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  /** Prst na tijelu kartice: povlačenje kreće nakon zadržavanja, kraći pomak je skrolanje. */
  const startTouchDrag = (e, id, fromBench) => {
    if (handleDragRef.current) return
    if (e.touches.length !== 1) return
    const t0 = e.touches[0]
    const idf = t0.identifier
    const sx = t0.clientX
    const sy = t0.clientY
    let active = false
    const unguard = guardGesture()

    const pick = (ev) => [...ev.changedTouches, ...ev.touches].find((t) => t.identifier === idf)
    const cleanup = () => {
      clearTimeout(hold)
      unguard()
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', cancel)
    }
    const move = (ev) => {
      const t = pick(ev)
      if (!t) return
      if (!active) {
        if (Math.hypot(t.clientX - sx, t.clientY - sy) > 10) cleanup()
        return
      }
      if (ev.cancelable) ev.preventDefault()
      setDrag({ id, fromBench, x: t.clientX, y: t.clientY, overId: targetUnder(t.clientX, t.clientY, fromBench) })
      updateAutoScroll(t.clientX, t.clientY, fromBench)
    }
    const end = () => {
      cleanup()
      if (active) finishDrag(id, fromBench)
    }
    const cancel = () => {
      cleanup()
      if (active) abortDrag()
    }
    const hold = setTimeout(() => { active = true; beginDrag(id, fromBench, sx, sy) }, 260)

    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', cancel)
  }

  /** Miš: povlačenje kreće nakon 12 px, bez zadržavanja. */
  const startMouseDrag = (e, id, fromBench) => {
    if (e.pointerType && e.pointerType !== 'mouse') return
    if (e.button != null && e.button !== 0) return
    const sx = e.clientX
    const sy = e.clientY
    let active = false
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    const move = (ev) => {
      if (!active) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) <= DRAG_THRESHOLD) return
        active = true
        beginDrag(id, fromBench, ev.clientX, ev.clientY)
      }
      setDrag({ id, fromBench, x: ev.clientX, y: ev.clientY, overId: targetUnder(ev.clientX, ev.clientY, fromBench) })
      updateAutoScroll(ev.clientX, ev.clientY, fromBench)
    }
    const up = () => {
      cleanup()
      if (active) finishDrag(id, fromBench)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const doUndo = () => {
    const n = undo()
    say(n ? `Poništeno (${n})` : 'Nema što poništiti')
    setSelectedId(null)
    setPendingShot(null)
    setPendingAction(null)
    openChain(null)
  }

  // --- sadržaj upita ---------------------------------------------------------
  const opt = (key, text, onClick, cls) => ({ key, label: text, onClick, cls })
  const courtOpts = (fn, exclude) => onCourt
    .filter((r) => r.player.id !== exclude)
    .map((r) => opt(r.player.id, `#${r.player.number} ${r.player.name}`, () => fn(r.player.id)))
  const benchOpts = (fn) => bench.map((r) => opt(r.player.id, `#${r.player.number} ${r.player.name}`, () => fn(r.player.id)))

  let prompt = null
  if (pendingShot) {
    const v = shotValue(pendingShot.x, pendingShot.y)
    prompt = pendingShot.playerId
      ? {
        title: `${label(pendingShot.playerId)} · šut za ${v}`,
        options: [
          opt('in', '✓ POGODAK', () => resolveShot(true), 'good'),
          opt('out', '✗ PROMAŠAJ', () => resolveShot(false), 'bad'),
          opt('x', 'Odustani', () => setPendingShot(null), 'ghost'),
        ],
        onClose: () => setPendingShot(null),
      }
      : {
        title: `Šut za ${v} — tko je šutirao?`,
        note: 'ili tapni igrača u popisu',
        options: [
          ...courtOpts((id) => setPendingShot({ ...pendingShot, playerId: id })),
          opt('x', 'Odustani', () => setPendingShot(null), 'ghost'),
        ],
        onClose: () => setPendingShot(null),
      }
  } else if (pendingAction) {
    prompt = {
      title: `${pendingAction.label} — tko?`,
      note: 'ili tapni igrača u popisu',
      options: [
        ...courtOpts((id) => completeAction(pendingAction, id)),
        ...(bench.length ? benchOpts((id) => completeAction(pendingAction, id)) : []),
        opt('x', 'Odustani', () => setPendingAction(null), 'ghost'),
      ],
      onClose: () => setPendingAction(null),
    }
  } else if (chain && chain.kind !== 'ft') {
    const c = chain
    if (c.kind === 'assist') {
      prompt = {
        title: 'Asistencija?',
        note: 'ili faul na šutu (and-1)',
        options: [
          ...courtOpts((id) => { record([{ type: EV.ASSIST, playerId: id }], { group: c.group, toast: 'Asistencija' }); openChain(null) }, c.shooterId),
          opt('and1', '+ FAUL (and-1)', () => {
            record([{ type: EV.FOUL, team: TEAM.OPP, playerId: null, payload: { kind: 'personal' } },
              { type: EV.FOUL_DRAWN, playerId: c.shooterId }], { group: c.group, toast: 'Koš + faul' })
            startFT({ group: c.group, shooterId: c.shooterId, side: 'us', total: 1 })
          }, 'warn'),
          opt('no', 'Bez asistencije', () => openChain(null), 'ghost'),
        ],
        onClose: () => openChain(null),
      }
    } else if (c.kind === 'rebound') {
      const shooterFoul = c.value > 1 && c.shooterId ? [opt('sf', 'ŠUTERSKI FAUL', () => {
        // FIBA: faul na šutu znači da pokušaj ne postoji — briše se iz iste grupe.
        removeFromGroup(c.group, EV.SHOT)
        record([{ type: EV.FOUL, team: TEAM.OPP, playerId: null, payload: { kind: 'personal' } },
          { type: EV.FOUL_DRAWN, playerId: c.shooterId }], { group: c.group, toast: 'Šuterski faul — pokušaj se briše' })
        startFT({ group: c.group, shooterId: c.shooterId, side: 'us', total: c.value })
      }, 'warn')] : []
      prompt = {
        title: 'Skok?',
        note: c.byUs ? 'naš = napadački' : 'naš = obrambeni',
        options: [
          ...courtOpts((id) => { record([{ type: EV.REBOUND, playerId: id, payload: { off: c.byUs } }], { group: c.group, toast: 'Skok' }); endChain(c) }),
          opt('opp', 'Protivnik', () => {
            record([{ type: EV.REBOUND, team: TEAM.OPP, playerId: null, payload: { off: !c.byUs } }], { group: c.group, toast: 'Skok protivnika' })
            endChain(c)
          }),
          ...shooterFoul,
          opt('out', 'Van', () => endChain(c), 'ghost'),
        ],
        onClose: () => endChain(c),
      }
    } else if (c.kind === 'oppFoulWho') {
      prompt = {
        title: 'Tko je izborio prekršaj?',
        note: c.bonus ? 'bonus — slijede 2 slobodna bacanja' : 'ili preskoči ako nije bitno',
        options: [
          ...courtOpts((id) => completeOppFoulWho(id)),
          opt('no', 'Preskoči', () => openChain(null), 'ghost'),
        ],
        onClose: () => openChain(null),
      }
    } else if (c.kind === 'subOut') {
      prompt = {
        title: 'Zamjena — tko izlazi?',
        options: [...courtOpts((id) => openChain({ kind: 'subIn', outId: id }, 0)), opt('x', 'Odustani', () => openChain(null), 'ghost')],
        onClose: () => openChain(null),
      }
    } else if (c.kind === 'subIn') {
      prompt = {
        title: `Izlazi ${label(c.outId)} — tko ulazi?`,
        options: [
          ...benchOpts((id) => { record([{ type: EV.SUB, playerId: null, payload: { outId: c.outId, inId: id } }], { toast: 'Zamjena zapisana' }); openChain(null) }),
          opt('x', 'Odustani', () => openChain(null), 'ghost'),
        ],
        onClose: () => openChain(null),
      }
    }
  }

  const ft = chain && chain.kind === 'ft' ? chain : null
  const ftTitle = ft
    ? `Slobodna bacanja · ${ft.side === 'opp' ? (oppName || 'PROTIVNIK').toUpperCase() : label(ft.shooterId)} — ${ft.idx + 1}/${ft.total}`
    : ''

  // --- teren i uputa ---------------------------------------------------------
  const courtShots = useMemo(() => positionedShots(game), [game.events]) // eslint-disable-line
  let hint = 'Tapni poziciju šuta, pa igrača'
  let hintOk = false
  if (pendingShot) { hint = pendingShot.playerId ? 'Potvrdi ishod' : 'Tko je šutirao? — tapni igrača'; hintOk = true }
  else if (pendingAction) { hint = `${pendingAction.label} — tapni igrača`; hintOk = true }
  else if (selectedId) { hint = `${label(selectedId)} — tapni poziciju šuta ili akciju`; hintOk = true }

  const courtBlock = (
    <>
      <div className={`hint ${hintOk ? 'ok' : ''}`} style={{ marginBottom: 10 }}>{hint}</div>
      <div className="court-box">
        <Court shots={courtShots} pending={pendingShot} onPick={pickPosition} />
      </div>
      <div className="court-legend">
        <span><span className="dot" />pogodak</span>
        <span><span className="x">✕</span>promašaj</span>
        <span className="grow" />
        {!isMobile && <span>2P / 3P se određuje iz pozicije</span>}
      </div>
    </>
  )

  const pad = (
    <ActionPad
      game={game}
      act={act}
      oppName={oppName}
      showSub
      onOpenSub={() => openChain({ kind: 'subOut' }, 0)}
      onOpenLineup={() => setLineupOpen(true)}
    />
  )

  /** Igrač ispod dane točke, i kad je iznad njega modal overlay. */
  const pidAt = (x, y) => {
    for (const el of document.elementsFromPoint(x, y)) {
      const card = el.closest ? el.closest('[data-pid]') : null
      if (card) return card.getAttribute('data-pid')
    }
    return null
  }

  const editEvent = editId ? game.events.find((e) => e.id === editId) : null
  const usFouls = teamFouls('us')
  const oppFouls = teamFouls('opp')

  return (
    <div className="app">
      {/* --- semafor --- */}
      <div className="hdr">
        <div className="hdr-side">
          <Crest name={usName} small />
          <div style={{ minWidth: 0 }}>
            <div className="hdr-name">{usName}</div>
            <div className="hdr-score">{stats.score.us}</div>
          </div>
          <div className="pills">
            <span className={`pill ${usFouls >= BONUS ? 'hot' : ''}`}>PF {usFouls}</span>
            {!isMobile && <span className="pill">TO {stats.timeouts.us}</span>}
          </div>
        </div>

        <div className="hdr-mid">
          <div className="hdr-period">{isMobile ? `${clock.period}. Č` : `${clock.period}. četvrtina`}</div>
          {game.trackTime && (
            <button
              className="btn accent"
              style={{ minHeight: 34, fontFamily: 'var(--f-cond)', fontSize: 20, fontWeight: 700, minWidth: 104 }}
              onClick={toggleClock}
              onContextMenu={(e) => { e.preventDefault(); setClockEdit(true) }}
            >
              {fmtClock(clock.secs)}
            </button>
          )}
          <div className="row" style={{ gap: 6 }}>
            {confirmNext ? (
              <>
                <button className="btn good" style={{ minHeight: 36 }} onClick={() => { nextPeriod(); setConfirmNext(false); say('Nova četvrtina') }}>Potvrdi</button>
                <button className="btn ghost" style={{ minHeight: 36 }} onClick={() => setConfirmNext(false)}>Odustani</button>
              </>
            ) : (
              <button className="btn accent" style={{ minHeight: 36 }} onClick={() => setConfirmNext(true)}>
                {isMobile ? `${clock.period + 1}. Č →` : 'Sljedeća četvrtina →'}
              </button>
            )}
            {game.trackTime && !confirmNext && (
              <button className="btn ghost" style={{ minHeight: 36 }} onClick={() => setClockEdit(true)}>Sat</button>
            )}
          </div>
        </div>

        <div className="hdr-side right">
          <div className="pills" style={{ alignItems: 'flex-end' }}>
            <span className={`pill ${oppFouls >= BONUS ? 'hot' : ''}`}>PF {oppFouls}</span>
            {!isMobile && <span className="pill">TO {stats.timeouts.opp}</span>}
          </div>
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <div className="hdr-name">{oppName}</div>
            <div className="hdr-score">{stats.score.opp}</div>
          </div>
          <div className="opp-badge">{(oppName || '?').trim()[0]?.toUpperCase() || '?'}</div>
        </div>
      </div>

      {/* --- tabovi --- */}
      <div className="tabs">
        <button className={`tab ${tab === 'unos' ? 'on' : ''}`} onClick={() => setTab('unos')}>Unos</button>
        <button className={`tab ${tab === 'log' ? 'on' : ''}`} onClick={() => setTab('log')}>
          {isMobile ? 'Log' : `Log · ${game.events.length}`}
        </button>
        <button className={`tab ${tab === 'stat' ? 'on' : ''}`} onClick={() => setTab('stat')}>
          {isMobile ? 'Stat' : 'Statistika'}
        </button>
        <div className="grow" />
        <button className="btn danger" style={{ minHeight: 38, letterSpacing: '.06em', fontWeight: 700, fontFamily: 'var(--f-ui)', fontSize: 13 }} onClick={doUndo}>↶ UNDO</button>
        {fullscreen.supported && (
          <button
            className="btn ghost"
            style={{ minHeight: 38, width: 44, padding: 0, fontSize: 16 }}
            onClick={fullscreen.toggle}
            aria-label={fullscreen.active ? 'Izađi iz punog ekrana' : 'Preko cijelog ekrana'}
            title={fullscreen.active ? 'Izađi iz punog ekrana' : 'Preko cijelog ekrana'}
          >
            {fullscreen.active ? '⛶' : '⛶'}
          </button>
        )}
        <button className="btn ghost" style={{ minHeight: 38, width: 44, padding: 0 }} onClick={onExit} aria-label="Izbornik">☰</button>
      </div>

      {clockEdit && (
        <ClockEditor game={game} clock={clock} onClose={() => setClockEdit(false)} onSave={(p, s) => { setClock(p, s); setClockEdit(false) }} />
      )}

      {/* --- unos --- */}
      {tab === 'unos' && (isMobile ? (
        <div className="m-wrap" style={ft ? { paddingBottom: 96 } : undefined}>
          {onCourt.length === 0 && (
            <button className="btn danger wide" onClick={() => setLineupOpen(true)}>
              Nema igrača na parketu — postavi petorku
            </button>
          )}
          <div className="m-strip">
            {onCourt.map((r) => (
              <PlayerChip
                key={r.player.id} row={r} trackTime={game.trackTime}
                selected={selectedId === r.player.id} onClick={() => tapPlayer(r.player.id)}
              />
            ))}
          </div>
          <button className="btn ghost wide" style={{ minHeight: 36 }} onClick={() => setBenchOpen((v) => !v)}>
            Klupa ({bench.length}) {benchOpen ? '▲' : '▼'}
          </button>
          {benchOpen && (
            <div className="m-bench">
              {bench.map((r) => (
                <PlayerChip
                  key={r.player.id} row={r} bench trackTime={game.trackTime}
                  selected={selectedId === r.player.id} onClick={() => tapPlayer(r.player.id)}
                />
              ))}
            </div>
          )}
          {!lineupOpen && (
            <div className="seg">
              <button className={mode === 'teren' ? 'on' : ''} onClick={() => setMode('teren')}>Teren</button>
              <button className={mode === 'gumbi' ? 'on' : ''} onClick={() => setMode('gumbi')}>Gumbi</button>
            </div>
          )}
          <div className={!lineupOpen && mode === 'teren' ? 'm-pane-court' : 'm-pane-scroll'}>
            {lineupOpen ? (
              <LineupPanel
                game={game} stats={stats} onAddPlayer={addPlayer}
                onSave={(ids) => { setLineup(ids); say('Postava spremljena') }}
                onClose={() => setLineupOpen(false)}
              />
            ) : mode === 'teren' ? (
              <div className="live-col court" style={{ flex: 1 }}>{courtBlock}</div>
            ) : pad}
          </div>
        </div>
      ) : (
        <div className="live-grid" style={ft ? { paddingBottom: 96 } : undefined}>
          <div className={`live-col scroll ${dragLock ? 'locked' : ''}`} ref={scrollColRef}>
            <div className="section-title" style={{ padding: '2px 4px 6px' }}>Na parketu</div>
            {onCourt.map((r) => (
              <PlayerCard
                key={r.player.id} row={r} trackTime={game.trackTime} drag={drag}
                selected={selectedId === r.player.id}
                onTap={() => tapPlayer(r.player.id)}
                onPointerDown={(e) => startMouseDrag(e, r.player.id, false)}
                onTouchStart={(e) => startTouchDrag(e, r.player.id, false)}
                onHandleDown={(e) => startHandleDrag(e, r.player.id, false)}
              />
            ))}
            {onCourt.length === 0 && (
              <div className="hint err">
                Nema igrača na parketu.
                <button className="btn wide" style={{ marginTop: 8 }} onClick={() => setLineupOpen(true)}>Postavi petorku</button>
              </div>
            )}
            <div style={{ padding: '10px 4px 6px' }}>
              <div className="section-title">Klupa</div>
              <div className="bench-note">Zamjena: povuci igrača za ⠿ ručku na drugoga (ili drži prst pa povuci)</div>
            </div>
            {bench.map((r) => (
              <PlayerCard
                key={r.player.id} row={r} bench trackTime={game.trackTime} drag={drag}
                selected={selectedId === r.player.id}
                onTap={() => tapPlayer(r.player.id)}
                onPointerDown={(e) => startMouseDrag(e, r.player.id, true)}
                onTouchStart={(e) => startTouchDrag(e, r.player.id, true)}
                onHandleDown={(e) => startHandleDrag(e, r.player.id, true)}
              />
            ))}
          </div>

          <div className="live-col court">{courtBlock}</div>

          <div className="live-col" style={{ overflowY: 'auto' }}>
            {lineupOpen ? (
              <LineupPanel
                game={game} stats={stats} onAddPlayer={addPlayer}
                onSave={(ids) => { setLineup(ids); say('Postava spremljena') }}
                onClose={() => setLineupOpen(false)}
              />
            ) : pad}
          </div>
        </div>
      ))}

      {/* --- log --- */}
      {tab === 'log' && (
        <div className="scroll-page" style={ft ? { paddingBottom: 96 } : undefined}>
          {editEvent && (
            <EventEditor
              game={game} event={editEvent}
              onSave={(patch) => { updateEvent(editEvent.id, patch); setEditId(null); say('Izmijenjeno') }}
              onDelete={() => { deleteEvent(editEvent.id); setEditId(null); say('Obrisano') }}
              onClose={() => setEditId(null)}
            />
          )}
          <div className="panel" style={{ padding: 8 }}>
            <PlayByPlay
              game={game}
              selectedId={editId}
              onSelectEvent={(ev) => setEditId((c) => (c === ev.id ? null : ev.id))}
              onDelete={(ev) => { deleteEvent(ev.id); if (editId === ev.id) setEditId(null); say('Obrisano') }}
            />
          </div>
        </div>
      )}

      {/* --- statistika --- */}
      {tab === 'stat' && (
        <div className="scroll-page" style={ft ? { paddingBottom: 96 } : undefined}>
          <StatsTab game={game} stats={stats} usName={usName} oppName={oppName} />
        </div>
      )}

      {prompt && (
        <PromptModal
          title={prompt.title}
          note={prompt.note}
          options={prompt.options}
          onClose={prompt.onClose}
          onOverlay={
            // upiti koji biraju igraca: tap na igraca u popisu prolazi KROZ overlay
            (pendingShot && !pendingShot.playerId) || pendingAction || (chain && chain.kind !== 'ft')
              ? (x, y) => {
                const pid = pidAt(x, y)
                if (pid) tapPlayer(pid)
                else prompt.onClose()
              }
              : undefined
          }
        />
      )}

      {ft && (
        <FreeThrowBar
          title={ftTitle}
          onMade={() => recordFT(true)}
          onMiss={() => recordFT(false)}
          onStop={() => endChain(ft)}
        />
      )}

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>{label(drag.id)}</div>
      )}

      {flash && <div className={`flash ${flash.kind || ''}`} key={flash.at} />}
      {toast && <div className="toast" style={{ bottom: ft ? 96 : 20 }}>{toast}</div>}
    </div>
  )
}
