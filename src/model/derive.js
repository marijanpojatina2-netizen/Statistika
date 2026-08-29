// ---------------------------------------------------------------------------
// Sve izvedene brojke racunaju se ovdje, iskljucivo iz event loga.
// ---------------------------------------------------------------------------
import { EV, TEAM } from './events.js'
import { shotZone } from './court.js'

export function emptyLine() {
  return {
    secs: 0, periods: new Set(),
    pts: 0,
    fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
    oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    pf: 0, fd: 0, plusMinus: 0,
  }
}

const pointsOf = (ev) => (ev.type === EV.SHOT && ev.made ? ev.value : 0)

/**
 * Glavni reduktor. Vraca kompletno izvedeno stanje utakmice.
 * @param game {object}
 * @param now  {{period:number, clock:number|null}} trenutno stanje sata (za zivu minutazu)
 */
export function derive(game, now) {
  const periodSecs = (game.quarterLength || 10) * 60
  const lines = {}
  for (const p of game.roster) lines[p.id] = emptyLine()

  const team = { ...emptyLine(), timeouts: 0 }
  const opp = { ...emptyLine(), timeouts: 0 }

  let score = { us: 0, opp: 0 }
  const byPeriod = {}          // { [period]: {us, opp} }
  const teamFouls = {}         // { [period]: {us, opp} }
  const bump = (obj, period) => {
    if (!obj[period]) obj[period] = { us: 0, opp: 0 }
    return obj[period]
  }

  let onCourt = new Set()
  let period = 1
  let lastClock = periodSecs
  const tracking = !!game.trackTime

  // vodstva / serije
  let largestLead = { us: 0, opp: 0 }
  let run = { team: null, points: 0 }

  // poeni iz reketa — mjerljivo samo za šuteve unesene preko dijagrama
  const paint = { pts: 0, positionedMade: 0, positionedAtt: 0 }

  const flush = (clock) => {
    if (!tracking || clock == null) return
    const dt = Math.max(0, lastClock - clock)
    if (dt > 0) for (const id of onCourt) if (lines[id]) lines[id].secs += dt
    lastClock = Math.min(lastClock, clock)
  }

  const markPeriod = () => {
    for (const id of onCourt) if (lines[id]) lines[id].periods.add(period)
  }

  for (const ev of game.events) {
    if (ev.period && ev.period !== period && ev.type !== EV.PERIOD_START) {
      // sigurnosna mreza ako event dolazi iz nove cetvrtine bez PERIOD_START
      flush(0)
      period = ev.period
      lastClock = periodSecs
      markPeriod()
    }
    if (ev.clock != null) flush(ev.clock)

    switch (ev.type) {
      case EV.LINEUP:
        onCourt = new Set(ev.playerIds)
        markPeriod()
        break
      case EV.PERIOD_START:
        flush(0)
        period = ev.period
        lastClock = periodSecs
        markPeriod()
        break
      case EV.PERIOD_END:
        flush(0)
        break
      case EV.SUB: {
        onCourt.delete(ev.outId)
        onCourt.add(ev.inId)
        markPeriod()
        break
      }
      case EV.TIMEOUT:
        (ev.team === TEAM.OPP ? opp : team).timeouts += 1
        break
      default: break
    }

    // --- statistika ---------------------------------------------------------
    // `lines[playerId]` za imenovane akcije; `team`/`opp` samo za momcadske
    // evente bez igraca. Zbrajanje u totale radi sumRows().
    const isUs = ev.team !== TEAM.OPP
    const bag = ev.playerId && lines[ev.playerId] ? lines[ev.playerId] : (isUs ? team : opp)

    switch (ev.type) {
      case EV.SHOT: {
        const madeKey = ev.value === 1 ? 'ftm' : ev.value === 3 ? 'fg3m' : 'fg2m'
        const attKey = ev.value === 1 ? 'fta' : ev.value === 3 ? 'fg3a' : 'fg2a'
        bag[attKey] += 1
        if (isUs && ev.value !== 1 && ev.x != null) {
          paint.positionedAtt += 1
          if (ev.made) {
            paint.positionedMade += 1
            if (shotZone(ev.x, ev.y) === 'paint') paint.pts += ev.value
          }
        }
        if (ev.made) {
          bag[madeKey] += 1
          bag.pts += ev.value
          const pts = ev.value
          const side = isUs ? 'us' : 'opp'
          score[side] += pts
          bump(byPeriod, period)[side] += pts
          for (const id of onCourt) if (lines[id]) lines[id].plusMinus += isUs ? pts : -pts
          run = run.team === side ? { team: side, points: run.points + pts } : { team: side, points: pts }
          const diff = score.us - score.opp
          if (diff > largestLead.us) largestLead.us = diff
          if (-diff > largestLead.opp) largestLead.opp = -diff
        }
        break
      }
      case EV.REBOUND: bag[ev.off ? 'oreb' : 'dreb'] += 1; break
      case EV.ASSIST: bag.ast += 1; break
      case EV.STEAL: bag.stl += 1; break
      case EV.BLOCK: bag.blk += 1; break
      case EV.TURNOVER: bag.tov += 1; break
      case EV.FOUL:
        bag.pf += 1
        bump(teamFouls, period)[isUs ? 'us' : 'opp'] += 1
        break
      case EV.FOUL_DRAWN: bag.fd += 1; break
      default: break
    }
  }

  // ziva minutaza do trenutnog sata
  if (tracking && now && now.period === period && now.clock != null) flush(now.clock)
  markPeriod()

  const finish = (l) => {
    const fgm = l.fg2m + l.fg3m
    const fga = l.fg2a + l.fg3a
    return {
      ...l,
      periods: l.periods instanceof Set ? l.periods.size : l.periods,
      min: Math.round(l.secs / 60),
      secs: l.secs,
      reb: l.oreb + l.dreb,
      fgm, fga,
      fgPct: pct(fgm, fga),
      fg2Pct: pct(l.fg2m, l.fg2a),
      fg3Pct: pct(l.fg3m, l.fg3a),
      ftPct: pct(l.ftm, l.fta),
      efgPct: fga ? ((fgm + 0.5 * l.fg3m) / fga) * 100 : null,
      eff: (l.pts + l.oreb + l.dreb + l.ast + l.stl + l.blk + l.fd)
         - ((fga - fgm) + (l.fta - l.ftm) + l.tov + l.pf),
    }
  }

  const playerRows = game.roster.map((p) => ({ player: p, ...finish(lines[p.id]), onCourt: onCourt.has(p.id) }))
  const teamTotals = sumRows(playerRows, team)
  const oppTotals = finish(opp)

  return {
    score,
    byPeriod,
    teamFouls,
    period,
    onCourt: [...onCourt],
    players: playerRows,
    team: finish(team),
    opp: oppTotals,
    teamTotals,
    advanced: {
      us: advanced(teamTotals, oppTotals),
      opp: advanced(oppTotals, teamTotals),
      paint,
      share: {
        paint: teamTotals.pts ? (paint.pts / teamTotals.pts) * 100 : null,
        three: teamTotals.pts ? ((teamTotals.fg3m * 3) / teamTotals.pts) * 100 : null,
        ft: teamTotals.pts ? (teamTotals.ftm / teamTotals.pts) * 100 : null,
      },
    },
    largestLead,
    run,
    timeouts: { us: team.timeouts, opp: opp.timeouts },
  }
}

/**
 * Napredni pokazatelji. Posjedi po standardnoj procjeni:
 *   POSS = ŠUT IZ IGRE - napadački skok + izgubljene + 0,44 x slobodna bacanja
 */
export function advanced(t, other) {
  const scoringPoss = t.fga + 0.44 * t.fta
  const poss = t.fga - t.oreb + t.tov + 0.44 * t.fta
  return {
    poss,
    ppp: poss > 0 ? t.pts / poss : null,
    tsPct: scoringPoss > 0 ? (t.pts / (2 * scoringPoss)) * 100 : null,
    efgPct: t.efgPct,
    toRatio: poss > 0 ? (t.tov / poss) * 100 : null,
    orPct: (t.oreb + other.dreb) > 0 ? (t.oreb / (t.oreb + other.dreb)) * 100 : null,
    drPct: (t.dreb + other.oreb) > 0 ? (t.dreb / (t.dreb + other.oreb)) * 100 : null,
  }
}

function pct(m, a) { return a ? (m / a) * 100 : null }

/** Momcadski total = zbroj igraca + eventi zapisani bez igraca (npr. momcadski skok). */
function sumRows(rows, teamBag) {
  const keys = ['pts', 'fg2m', 'fg2a', 'fg3m', 'fg3a', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fd', 'secs']
  const t = {}
  for (const k of keys) t[k] = rows.reduce((s, r) => s + (r[k] || 0), 0) + (teamBag[k] || 0)
  const fgm = t.fg2m + t.fg3m, fga = t.fg2a + t.fg3a
  return {
    ...t,
    periods: '',
    plusMinus: '',
    min: Math.round(t.secs / 60),
    reb: t.oreb + t.dreb,
    fgm, fga,
    fgPct: pct(fgm, fga), fg2Pct: pct(t.fg2m, t.fg2a), fg3Pct: pct(t.fg3m, t.fg3a), ftPct: pct(t.ftm, t.fta),
    efgPct: fga ? ((fgm + 0.5 * t.fg3m) / fga) * 100 : null,
    eff: (t.pts + t.oreb + t.dreb + t.ast + t.stl + t.blk + t.fd)
       - ((fga - fgm) + (t.fta - t.ftm) + t.tov + t.pf),
  }
}

export function foulsInPeriod(teamFouls, period, side) {
  return teamFouls[period]?.[side] || 0
}

export function fmtClock(secs) {
  if (secs == null) return '--:--'
  const s = Math.max(0, Math.round(secs))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function fmtPct(v, digits = 1) {
  return v == null ? '–' : `${v.toFixed(digits)}%`
}
