// ---------------------------------------------------------------------------
// Izvještaji nakon utakmice — sve se računa iz event loga, ništa se ne sprema.
// ---------------------------------------------------------------------------
import { EV, TEAM } from './events.js'

const periodSecs = (game) => (game.quarterLength || 10) * 60

/**
 * Pozicija eventa na vremenskoj osi utakmice (sekunde od početka).
 * Bez tajmera se eventi ravnomjerno rasporede unutar svoje četvrtine.
 */
function makeTimeline(game, events) {
  const P = periodSecs(game)
  const perPeriod = {}
  for (const ev of events) perPeriod[ev.period] = (perPeriod[ev.period] || 0) + 1
  const seen = {}
  return events.map((ev) => {
    const idx = (seen[ev.period] = (seen[ev.period] || 0) + 1)
    const t = game.trackTime && ev.clock != null
      ? (ev.period - 1) * P + (P - ev.clock)
      : (ev.period - 1) * P + (idx / (perPeriod[ev.period] + 1)) * P
    return { ev, t }
  })
}

const isScore = (ev) => ev.type === EV.SHOT && ev.made

/**
 * Tijek rezultata: točka nakon svakog koša.
 * [{t, period, clock, us, opp, diff, side, pts, playerId}]
 */
export function scoreFlow(game) {
  const scoring = game.events.filter(isScore)
  const tl = makeTimeline(game, scoring)
  let us = 0; let opp = 0
  const points = [{ t: 0, period: 1, clock: null, us: 0, opp: 0, diff: 0, side: null, pts: 0, playerId: null }]
  for (const { ev, t } of tl) {
    const side = ev.team === TEAM.OPP ? 'opp' : 'us'
    if (side === 'us') us += ev.value; else opp += ev.value
    points.push({ t, period: ev.period, clock: ev.clock, us, opp, diff: us - opp, side, pts: ev.value, playerId: ev.playerId })
  }
  return points
}

/** Sve serije (uzastopni poeni jedne ekipe), najveće prve. */
export function runsOf(game, minPoints = 6) {
  const flow = scoreFlow(game).slice(1)
  const runs = []
  let cur = null
  for (const p of flow) {
    if (cur && cur.side === p.side) {
      cur.points += p.pts
      cur.to = { period: p.period, clock: p.clock }
      cur.score = { us: p.us, opp: p.opp }
    } else {
      if (cur) runs.push(cur)
      cur = { side: p.side, points: p.pts, from: { period: p.period, clock: p.clock }, to: { period: p.period, clock: p.clock }, score: { us: p.us, opp: p.opp } }
    }
  }
  if (cur) runs.push(cur)
  return runs.filter((r) => r.points >= minPoints).sort((a, b) => b.points - a.points)
}

/** Najveće vodstvo obje ekipe i KADA je postignuto. */
export function leadInfo(game) {
  const out = { us: null, opp: null }
  for (const p of scoreFlow(game)) {
    if (p.diff > 0 && (!out.us || p.diff > out.us.points)) out.us = { points: p.diff, period: p.period, clock: p.clock, score: { us: p.us, opp: p.opp } }
    if (p.diff < 0 && (!out.opp || -p.diff > out.opp.points)) out.opp = { points: -p.diff, period: p.period, clock: p.clock, score: { us: p.us, opp: p.opp } }
  }
  return out
}

/** Tko hrani koga: parovi asistent → strijelac (iz zajedničke undo-grupe). */
export function assistPairs(game) {
  const shotByGroup = {}
  for (const ev of game.events) {
    if (isScore(ev) && ev.team !== TEAM.OPP && ev.value > 1 && ev.playerId) shotByGroup[ev.group] = ev.playerId
  }
  const count = {}
  for (const ev of game.events) {
    if (ev.type !== EV.ASSIST || !ev.playerId) continue
    const to = shotByGroup[ev.group]
    if (!to || to === ev.playerId) continue
    const key = `${ev.playerId}|${to}`
    count[key] = (count[key] || 0) + 1
  }
  return Object.entries(count)
    .map(([key, n]) => { const [fromId, toId] = key.split('|'); return { fromId, toId, count: n } })
    .sort((a, b) => b.count - a.count)
}

/**
 * Replay postave: zove callback(state) prije svakog eventa.
 * state = { onCourt, period, clockAt(ev) }
 */
function replay(game, onEvent) {
  const P = periodSecs(game)
  let onCourt = []
  let period = 1
  let lastClock = P
  for (const ev of game.events) {
    if (ev.period && ev.period !== period && ev.type !== EV.PERIOD_START) {
      period = ev.period; lastClock = P
    }
    if (ev.type === EV.PERIOD_START) { period = ev.period; lastClock = P }
    const clock = ev.clock != null ? ev.clock : null
    onEvent(ev, { onCourt, period, lastClock, clock })
    if (clock != null) lastClock = Math.min(lastClock, clock)
    if (ev.type === EV.PERIOD_START) lastClock = P
    if (ev.type === EV.LINEUP) onCourt = [...(ev.playerIds || [])]
    if (ev.type === EV.SUB) {
      const i = onCourt.indexOf(ev.outId)
      if (i >= 0) onCourt[i] = ev.inId
      else if (!onCourt.includes(ev.inId)) onCourt.push(ev.inId)
    }
  }
}

/**
 * Statistika petorki i parova: minute (uz tajmer), +/- i broj koševa dok su
 * na parketu. Petorka se identificira sortiranim popisom id-eva.
 */
export function lineupStats(game) {
  const tracking = !!game.trackTime
  const fives = {}
  const pairs = {}
  const get = (map, key) => map[key] || (map[key] = { key, secs: 0, plusMinus: 0, periods: new Set() })

  let cur = null           // trenutna petorka (sortirani key)
  let curIds = []
  let curPairKeys = []
  const switchTo = (ids, period) => {
    if (ids.length !== 5) { cur = null; curIds = []; curPairKeys = []; return }
    curIds = [...ids]
    cur = [...ids].sort().join('|')
    get(fives, cur).periods.add(period)
    curPairKeys = []
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const pk = [ids[i], ids[j]].sort().join('|')
      curPairKeys.push(pk)
      get(pairs, pk).periods.add(period)
    }
  }
  const addSecs = (dt) => {
    if (!cur || dt <= 0) return
    fives[cur].secs += dt
    for (const pk of curPairKeys) pairs[pk].secs += dt
  }
  const addPts = (pts) => {
    if (!cur) return
    fives[cur].plusMinus += pts
    for (const pk of curPairKeys) pairs[pk].plusMinus += pts
  }

  let lastAbs = 0
  const P = periodSecs(game)
  replay(game, (ev, st) => {
    if (tracking && ev.clock != null) {
      const abs = (st.period - 1) * P + (P - ev.clock)
      addSecs(Math.max(0, abs - lastAbs))
      lastAbs = Math.max(lastAbs, abs)
    }
    if (ev.type === EV.PERIOD_END && tracking) {
      const abs = st.period * P
      addSecs(Math.max(0, abs - lastAbs)); lastAbs = Math.max(lastAbs, abs)
    }
    if (isScore(ev)) addPts(ev.team === TEAM.OPP ? -ev.value : ev.value)
    if (ev.type === EV.LINEUP) switchTo(ev.playerIds || [], ev.period || st.period)
    if (ev.type === EV.SUB) {
      const ids = [...st.onCourt]
      const i = ids.indexOf(ev.outId)
      if (i >= 0) ids[i] = ev.inId; else ids.push(ev.inId)
      switchTo(ids, ev.period || st.period)
    }
  })

  const toRows = (map) => Object.values(map)
    .map((r) => ({ ...r, ids: r.key.split('|'), periods: r.periods.size }))
    .sort((a, b) => b.plusMinus - a.plusMinus || b.secs - a.secs)
  return { fives: toRows(fives), pairs: toRows(pairs) }
}

/** Dionice igranja po igraču: [{from:{period,clock}, to:{period,clock}|null}] */
export function playerStints(game) {
  const stints = {}
  const open = {}
  const mark = (id, period, clock) => {
    if (!stints[id]) stints[id] = []
    stints[id].push({ from: { period, clock }, to: null })
    open[id] = stints[id][stints[id].length - 1]
  }
  const close = (id, period, clock) => {
    if (open[id]) { open[id].to = { period, clock }; delete open[id] }
  }
  replay(game, (ev, st) => {
    if (ev.type === EV.LINEUP) {
      const next = new Set(ev.playerIds || [])
      for (const id of Object.keys(open)) if (!next.has(id)) close(id, ev.period || st.period, ev.clock)
      for (const id of next) if (!open[id]) mark(id, ev.period || st.period, ev.clock)
    }
    if (ev.type === EV.SUB) {
      close(ev.outId, ev.period || st.period, ev.clock)
      if (!open[ev.inId]) mark(ev.inId, ev.period || st.period, ev.clock)
    }
  })
  return stints
}

/** Kronologija osobnih prekršaja naših igrača: {playerId: [{n, period, clock}]} */
export function foulTimeline(game) {
  const out = {}
  for (const ev of game.events) {
    if (ev.type !== EV.FOUL || ev.team === TEAM.OPP || !ev.playerId) continue
    if (!out[ev.playerId]) out[ev.playerId] = []
    out[ev.playerId].push({ n: out[ev.playerId].length + 1, period: ev.period, clock: ev.clock })
  }
  return out
}

/** Statistika jednog igrača po četvrtinama (poeni, šut, skokovi...). */
export function playerByPeriod(game, playerId) {
  const per = {}
  const bag = (p) => per[p] || (per[p] = { pts: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, reb: 0, ast: 0, tov: 0, pf: 0 })
  for (const ev of game.events) {
    if (ev.playerId !== playerId) continue
    const b = bag(ev.period || 1)
    switch (ev.type) {
      case EV.SHOT:
        if (ev.value === 1) { b.fta += 1; if (ev.made) { b.ftm += 1; b.pts += 1 } }
        else { b.fga += 1; if (ev.made) { b.fgm += 1; b.pts += ev.value } }
        break
      case EV.REBOUND: b.reb += 1; break
      case EV.ASSIST: b.ast += 1; break
      case EV.TURNOVER: b.tov += 1; break
      case EV.FOUL: b.pf += 1; break
      default: break
    }
  }
  return per
}
