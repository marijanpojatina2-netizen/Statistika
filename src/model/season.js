// ---------------------------------------------------------------------------
// Sezonska statistika — agregat preko arhiviranih utakmica.
// Sve se i ovdje računa iz event logova, pa ispravak stare utakmice mijenja
// i sezonske prosjeke.
// ---------------------------------------------------------------------------
import { derive } from './derive.js'

const SUM_KEYS = [
  'secs', 'periods', 'pts', 'fg2m', 'fg2a', 'fg3m', 'fg3a', 'ftm', 'fta',
  'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'plusMinus', 'eff',
]

/** Igrači se kroz sezonu prepoznaju po broju dresa i imenu. */
export const playerKey = (p) => `${String(p.number).trim()}|${p.name.trim().toLowerCase()}`

const zero = () => Object.fromEntries(SUM_KEYS.map((k) => [k, 0]))
const pct = (m, a) => (a ? (m / a) * 100 : null)

/** Je li igrač uopće ušao u utakmicu. */
const played = (r) => r.periods > 0 || r.secs > 0

export function gameSummary(game) {
  const stats = derive(game, { period: game.clock?.period || 1, clock: null })
  const usName = game.weAreHome ? game.homeName : game.awayName
  const oppName = game.weAreHome ? game.awayName : game.homeName
  return {
    game,
    stats,
    usName,
    oppName,
    result: stats.score.us > stats.score.opp ? 'W' : (stats.score.us < stats.score.opp ? 'L' : 'D'),
  }
}

/**
 * @param archive lista arhiviranih utakmica (najnovija bilo gdje — sortira se po datumu)
 * @param lastN   koliko zadnjih utakmica ulazi u trend
 */
export function seasonStats(archive, lastN = 5) {
  const summaries = archive
    .map(gameSummary)
    .sort((a, b) => (a.game.date || '').localeCompare(b.game.date || '') || a.game.createdAt - b.game.createdAt)

  const map = new Map()
  for (const s of summaries) {
    for (const r of s.stats.players) {
      if (!played(r)) continue
      const key = playerKey(r.player)
      if (!map.has(key)) {
        map.set(key, {
          key, number: r.player.number, name: r.player.name,
          games: 0, total: zero(), history: [],
        })
      }
      const acc = map.get(key)
      acc.games += 1
      for (const k of SUM_KEYS) acc.total[k] += r[k] || 0
      acc.history.push({
        date: s.game.date,
        opponent: s.oppName,
        result: s.result,
        min: r.min, periods: r.periods, pts: r.pts, reb: r.reb, ast: r.ast, eff: r.eff,
      })
    }
  }

  const rows = [...map.values()].map((acc) => {
    const t = acc.total
    const avg = Object.fromEntries(SUM_KEYS.map((k) => [k, acc.games ? t[k] / acc.games : 0]))
    avg.min = acc.games ? (t.secs / 60) / acc.games : 0

    const recent = acc.history.slice(-lastN)
    const rAvg = (k) => (recent.length ? recent.reduce((s, h) => s + (h[k] || 0), 0) / recent.length : null)

    return {
      ...acc,
      avg,
      fgPct: pct(t.fg2m + t.fg3m, t.fg2a + t.fg3a),
      fg3Pct: pct(t.fg3m, t.fg3a),
      ftPct: pct(t.ftm, t.fta),
      recent: {
        games: recent.length,
        pts: rAvg('pts'), reb: rAvg('reb'), ast: rAvg('ast'), eff: rAvg('eff'),
      },
      trend: recent.length && acc.games > recent.length
        ? rAvg('pts') - (acc.games ? t.pts / acc.games : 0)
        : null,
    }
  }).sort((a, b) => b.avg.pts - a.avg.pts)

  const record = summaries.reduce((r, s) => {
    r[s.result === 'W' ? 'w' : s.result === 'L' ? 'l' : 'd'] += 1
    r.pf += s.stats.score.us
    r.pa += s.stats.score.opp
    return r
  }, { w: 0, l: 0, d: 0, pf: 0, pa: 0 })

  return { summaries, rows, record, games: summaries.length, lastN }
}
