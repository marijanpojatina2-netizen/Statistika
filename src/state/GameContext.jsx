import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EV, TEAM, makeEvent, undoLast, newId } from '../model/events.js'
import { derive } from '../model/derive.js'
import { liveClock } from '../model/game.js'
import { loadCurrent, saveCurrent, clearCurrent } from '../model/storage.js'

const Ctx = createContext(null)
export const useGame = () => useContext(Ctx)

export function GameProvider({ children }) {
  const [game, setGameRaw] = useState(() => loadCurrent())
  const [tick, setTick] = useState(0)

  // Automatsko spremanje nakon SVAKE promjene.
  const setGame = useCallback((updater) => {
    setGameRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (next) saveCurrent(next); else clearCurrent()
      return next
    })
  }, [])

  // Otkucaj svake sekunde dok sat radi (samo za prikaz).
  useEffect(() => {
    if (!game?.trackTime || !game?.clock?.running) return
    const t = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [game?.trackTime, game?.clock?.running])

  const clock = useMemo(() => (game ? liveClock(game) : { period: 1, secs: null }), [game, tick])

  // Auto-stop na 0.
  useEffect(() => {
    if (game?.trackTime && game.clock.running && clock.secs <= 0) {
      setGame((g) => ({ ...g, clock: { ...g.clock, secs: 0, running: false, startedAt: null } }))
    }
  }, [clock.secs, game?.clock?.running]) // eslint-disable-line

  const stats = useMemo(
    () => (game ? derive(game, { period: clock.period, clock: game.trackTime ? clock.secs : null }) : null),
    [game, clock.period, game?.trackTime ? Math.floor((clock.secs ?? 0) / 5) : 0], // eslint-disable-line
  )

  // --- unos evenata --------------------------------------------------------

  /** Broj evenata u trenutnoj cetvrtini — redni broj u nacinu bez vremena. */
  const build = useCallback((spec, group) => {
    const g = spec.game
    return makeEvent({
      type: spec.type,
      team: spec.team || TEAM.US,
      playerId: spec.playerId ?? null,
      payload: spec.payload || {},
      period: g.clock.period,
      clock: g.trackTime ? Math.round(liveClock(g).secs) : null,
      group,
    })
  }, [])

  /** Doda jedan ili vise evenata kao JEDNU grupu (undo ih brise zajedno). */
  const push = useCallback((specs) => {
    const list = Array.isArray(specs) ? specs : [specs]
    if (list.length === 0) return null
    const group = newId()
    setGame((g) => {
      if (!g) return g
      const built = list.map((s) => build({ ...s, game: g }, group))
      return { ...g, events: [...g.events, ...built] }
    })
    return group
  }, [build, setGame])

  /** Doda evente u VEC POSTOJECU grupu (lancani upit: asistencija, skok...). */
  const pushInto = useCallback((group, specs) => {
    const list = Array.isArray(specs) ? specs : [specs]
    setGame((g) => {
      if (!g) return g
      const built = list.map((s) => build({ ...s, game: g }, group))
      return { ...g, events: [...g.events, ...built] }
    })
  }, [build, setGame])

  const undo = useCallback(() => {
    if (!game || game.events.length === 0) return 0
    const { events, removed } = undoLast(game.events)
    // Ne dopusti brisanje pocetnog PERIOD_START/LINEUP para.
    if (events.length === 0) return 0
    setGame((g) => ({ ...g, events }))
    return removed.length
  }, [game, setGame])

  const updateEvent = useCallback((id, patch) => {
    setGame((g) => ({ ...g, events: g.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  }, [setGame])

  const deleteEvent = useCallback((id) => {
    setGame((g) => ({ ...g, events: g.events.filter((e) => e.id !== id) }))
  }, [setGame])

  // --- sat i cetvrtine -----------------------------------------------------

  const toggleClock = useCallback(() => {
    setGame((g) => {
      if (!g.trackTime) return g
      const c = g.clock
      if (c.running) {
        const secs = Math.max(0, c.secs - (Date.now() - c.startedAt) / 1000)
        return { ...g, clock: { ...c, secs, running: false, startedAt: null } }
      }
      if (c.secs <= 0) return g
      return { ...g, clock: { ...c, running: true, startedAt: Date.now() } }
    })
  }, [setGame])

  const setClock = useCallback((period, secs) => {
    setGame((g) => ({ ...g, clock: { period, secs, running: false, startedAt: null } }))
  }, [setGame])

  const nextPeriod = useCallback(() => {
    setGame((g) => {
      const cur = g.clock.period
      const next = cur + 1
      const endClock = g.trackTime ? 0 : null
      const startClock = g.trackTime ? g.quarterLength * 60 : null
      const gid1 = newId(); const gid2 = newId()
      const evEnd = makeEvent({ type: EV.PERIOD_END, period: cur, clock: endClock, payload: { period: cur }, group: gid1 })
      const evStart = makeEvent({ type: EV.PERIOD_START, period: next, clock: startClock, payload: { period: next }, group: gid2 })
      return {
        ...g,
        events: [...g.events, evEnd, evStart],
        clock: { period: next, secs: g.quarterLength * 60, running: false, startedAt: null },
      }
    })
  }, [setGame])

  const setTrackTime = useCallback((value) => {
    setGame((g) => ({ ...g, trackTime: value, clock: { ...g.clock, running: false, startedAt: null } }))
  }, [setGame])

  const value = {
    game, setGame, clock, stats,
    push, pushInto, undo, updateEvent, deleteEvent,
    toggleClock, setClock, nextPeriod, setTrackTime,
    endGame: () => setGame((g) => ({ ...g, status: 'finished' })),
    resetGame: () => setGame(null),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
