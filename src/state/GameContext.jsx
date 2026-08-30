import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EV, TEAM, makeEvent, undoLast, newId } from '../model/events.js'
import { derive } from '../model/derive.js'
import { liveClock } from '../model/game.js'
import {
  loadCurrent, saveCurrent, clearCurrent,
  loadArchive, saveArchive, loadTemplates, saveTemplates,
  loadOutbox, saveOutbox,
} from '../model/storage.js'
import {
  cloudListGames, cloudSaveGame, cloudDeleteGame,
  cloudListTemplates, cloudSaveTemplate, cloudDeleteTemplate,
  getCoach, logoutCloud,
} from '../model/cloud.js'

const Ctx = createContext(null)
export const useGame = () => useContext(Ctx)

export function GameProvider({ children }) {
  const [game, setGameRaw] = useState(() => loadCurrent())
  const [archive, setArchiveState] = useState(() => loadArchive())
  const [templates, setTemplatesState] = useState(() => loadTemplates())
  const [tick, setTick] = useState(0)
  // Oblak: 'sync' (u tijeku), 'ok', 'offline', 'no-blob' (nije uključen), 'none' (nema backenda)
  const [cloud, setCloud] = useState({ status: 'sync', at: null })

  // syncNow je stabilan callback, pa najnovije stanje čita preko refova.
  const archiveRef = useRef(archive); archiveRef.current = archive
  const templatesRef = useRef(templates); templatesRef.current = templates
  const syncingRef = useRef(false)

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

    // Pocetna postava je temelj utakmice — UNDO nikad ne smije ici ispod nje,
    // inace parket ostane prazan i unos vise nema kome pripisati akciju.
    const firstLineup = game.events.findIndex((e) => e.type === EV.LINEUP)
    const floor = firstLineup >= 0 ? firstLineup + 1 : 1
    if (events.length < floor) return 0

    setGame((g) => {
      const next = { ...g, events }
      // Ako je ponisten prelazak u novu cetvrtinu, vrati i semafor.
      if (removed.some((e) => e.type === EV.PERIOD_START)) {
        const lastStart = [...events].reverse().find((e) => e.type === EV.PERIOD_START)
        next.clock = {
          period: lastStart?.period || 1,
          secs: g.quarterLength * 60,
          running: false,
          startedAt: null,
        }
      }
      return next
    })
    return removed.length
  }, [game, setGame])

  /** Miče evente zadanog tipa iz jedne grupe (šuterski faul briše pokušaj šuta). */
  const removeFromGroup = useCallback((group, type) => {
    setGame((g) => ({ ...g, events: g.events.filter((e) => !(e.group === group && e.type === type)) }))
  }, [setGame])

  /** Rucno postavljanje petorke usred utakmice (ispravak ili nova postava). */
  const setLineup = useCallback((playerIds) => {
    setGame((g) => {
      const ev = makeEvent({
        type: EV.LINEUP,
        period: g.clock.period,
        clock: g.trackTime ? Math.round(liveClock(g).secs) : null,
        payload: { playerIds: playerIds.slice(0, 5) },
      })
      return { ...g, events: [...g.events, ev] }
    })
  }, [setGame])

  /** Igrac koji je zakasnio ili nije bio na popisu — dodaj ga usred utakmice. */
  const addPlayer = useCallback((number, name) => {
    const player = { id: newId(), number: String(number).trim(), name: name.trim() }
    setGame((g) => ({ ...g, roster: [...g.roster, player] }))
    return player
  }, [setGame])

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

  // --- oblak: zajednička arhiva i predlošci --------------------------------

  /** Zapamti promjenu koju treba poslati u oblak (radi i offline). */
  const enqueue = useCallback((kind, id) => {
    const next = [...loadOutbox().filter((o) => !(o.kind === kind && o.id === id)), { kind, id, ts: Date.now() }]
    saveOutbox(next)
  }, [])

  /**
   * Pošalji sve iz outboxa pa povuci zajedničko stanje iz oblaka.
   * Oblak je izvor istine tek NAKON što je outbox uspješno ispražnjen —
   * u suprotnom se lokalno stanje ne dira (ništa se ne može izgubiti).
   */
  const syncNow = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setCloud((c) => ({ ...c, status: 'sync' }))
    try {
      let outbox = loadOutbox()
      for (const op of [...outbox]) {
        if (op.kind === 'game') {
          const g = archiveRef.current.find((x) => x.id === op.id)
          if (g) await cloudSaveGame(g)
        } else if (op.kind === 'game-del') {
          await cloudDeleteGame(op.id)
        } else if (op.kind === 'tpl') {
          const t = templatesRef.current.find((x) => x.id === op.id)
          if (t) await cloudSaveTemplate(t)
        } else if (op.kind === 'tpl-del') {
          await cloudDeleteTemplate(op.id)
        }
        outbox = outbox.filter((o) => o !== op)
        saveOutbox(outbox)
      }

      const [games, tpls] = await Promise.all([cloudListGames(), cloudListTemplates()])
      games.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
      tpls.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
      saveArchive(games); setArchiveState(games); archiveRef.current = games
      saveTemplates(tpls); setTemplatesState(tpls); templatesRef.current = tpls
      setCloud({ status: 'ok', at: Date.now() })
    } catch (e) {
      const r = e?.reason
      setCloud({ status: r === 'none' ? 'none' : r === 'no-blob' ? 'no-blob' : 'offline', at: null })
    } finally {
      syncingRef.current = false
    }
  }, [])

  // Pri pokretanju i svaki put kad se vrati internet.
  useEffect(() => {
    syncNow()
    const on = () => syncNow()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [syncNow])

  // --- arhiva i predlošci ---------------------------------------------------

  const finishGame = useCallback(() => {
    if (!game) return
    const done = { ...game, status: 'finished', finishedAt: Date.now(), coach: getCoach() || game.coach || '' }
    const next = [done, ...archive.filter((g) => g.id !== done.id)]
    saveArchive(next)
    setArchiveState(next)
    archiveRef.current = next // syncNow se zove odmah — ref mora vidjeti novu utakmicu
    setGame(null)
    enqueue('game', done.id)
    syncNow()
  }, [game, archive, setGame, enqueue, syncNow])

  const deleteArchived = useCallback((id) => {
    const next = archive.filter((g) => g.id !== id)
    saveArchive(next)
    setArchiveState(next)
    archiveRef.current = next
    enqueue('game-del', id)
    syncNow()
  }, [archive, enqueue, syncNow])

  const saveTemplate = useCallback((tpl) => {
    const full = { ...tpl, coach: getCoach() || tpl.coach || '' }
    const next = [full, ...templates.filter((t) => t.id !== full.id)]
    saveTemplates(next)
    setTemplatesState(next)
    templatesRef.current = next
    enqueue('tpl', full.id)
    syncNow()
  }, [templates, enqueue, syncNow])

  const deleteTemplate = useCallback((id) => {
    const next = templates.filter((t) => t.id !== id)
    saveTemplates(next)
    setTemplatesState(next)
    templatesRef.current = next
    enqueue('tpl-del', id)
    syncNow()
  }, [templates, enqueue, syncNow])

  const value = {
    game, setGame, clock, stats,
    archive, templates, finishGame, deleteArchived, saveTemplate, deleteTemplate,
    cloud, syncNow, coach: getCoach(), logout: logoutCloud,
    push, pushInto, undo, updateEvent, deleteEvent, removeFromGroup, setLineup, addPlayer,
    toggleClock, setClock, nextPeriod, setTrackTime,
    endGame: () => setGame((g) => ({ ...g, status: 'finished' })),
    resetGame: () => setGame(null),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
