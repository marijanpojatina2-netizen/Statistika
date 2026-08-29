import { EV, makeEvent, newId } from './events.js'

export function newGame(setup) {
  const roster = setup.roster.map((p) => ({ id: p.id || newId(), number: String(p.number), name: p.name.trim() }))
  const game = {
    id: newId(),
    createdAt: Date.now(),
    version: 1,
    homeName: setup.homeName?.trim() || 'Domaći',
    awayName: setup.awayName?.trim() || 'Gosti',
    date: setup.date || new Date().toISOString().slice(0, 10),
    competition: setup.competition?.trim() || '',
    quarterLength: Number(setup.quarterLength) || 10,
    quarterCount: Number(setup.quarterCount) || 4,
    trackTime: !!setup.trackTime,
    trackOpponentShots: !!setup.trackOpponentShots,
    weAreHome: setup.weAreHome !== false,
    roster,
    events: [],
    clock: { period: 1, secs: (Number(setup.quarterLength) || 10) * 60, running: false, startedAt: null },
    status: 'live',
  }
  const starters = setup.starters.slice(0, 5)
  game.events.push(makeEvent({ type: EV.PERIOD_START, period: 1, clock: game.trackTime ? game.quarterLength * 60 : null, payload: { period: 1 } }))
  game.events.push(makeEvent({ type: EV.LINEUP, period: 1, clock: game.trackTime ? game.quarterLength * 60 : null, payload: { playerIds: starters } }))
  return game
}

/** Trenutno stanje sata s obzirom na to da tajmer tece u realnom vremenu. */
export function liveClock(game) {
  const c = game.clock
  if (!game.trackTime) return { period: c.period, secs: null }
  if (!c.running || !c.startedAt) return { period: c.period, secs: c.secs }
  const elapsed = (Date.now() - c.startedAt) / 1000
  return { period: c.period, secs: Math.max(0, c.secs - elapsed) }
}
