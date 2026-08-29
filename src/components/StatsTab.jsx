import React from 'react'
import { ZONES, shotZone } from '../model/court.js'
import { positionedShots } from './ShotChart.jsx'
import ShotChart from './ShotChart.jsx'

const pct = (v) => (v == null ? '–' : `${Math.round(v)}%`)
const f2 = (v) => (v == null ? '–' : v.toFixed(2))

/** Statistika: četvrtine, box score, napredni pokazatelji, zone i shot chart. */
export default function StatsTab({ game, stats, usName, oppName }) {
  const t = stats.teamTotals
  const a = stats.advanced.us
  const { paint } = stats.advanced
  const shots = positionedShots(game)

  const periods = Object.keys(stats.byPeriod).map(Number)
  const maxQ = Math.max(game.quarterCount || 4, ...periods, 1)
  const qs = Array.from({ length: maxQ }, (_, i) => i + 1)

  const cols = [
    ['Č', (r) => (game.trackTime ? r.min : r.periods)],
    ['PTS', (r) => r.pts, 'big'],
    ['2P', (r) => `${r.fg2m}-${r.fg2a}`],
    ['3P', (r) => `${r.fg3m}-${r.fg3a}`],
    ['SB', (r) => `${r.ftm}-${r.fta}`],
    ['FG%', (r) => (r.fgPct == null ? '–' : `${Math.round(r.fgPct)}%`)],
    ['OR', (r) => r.oreb],
    ['DR', (r) => r.dreb],
    ['SK', (r) => r.reb],
    ['AST', (r) => r.ast],
    ['STL', (r) => r.stl],
    ['BLK', (r) => r.blk],
    ['TO', (r) => r.tov],
    ['PF', (r) => r.pf, 'pf'],
    ['+/-', (r) => (r.plusMinus > 0 ? `+${r.plusMinus}` : r.plusMinus), 'pm'],
    ['EFF', (r) => r.eff, 'big'],
  ]

  const cellClass = (kind, r) => {
    if (kind === 'big') return 'big'
    if (kind === 'pf') return r.pf >= 4 ? 'hot' : ''
    if (kind === 'pm') return r.plusMinus > 0 ? 'pos' : r.plusMinus < 0 ? 'neg' : 'zero'
    return ''
  }

  const adv = [
    ['Posjedi', a.poss > 0 ? a.poss.toFixed(1) : '–', 'procjena'],
    ['Poeni / posjed', f2(a.ppp), 'PPP'],
    ['TS%', pct(a.tsPct), 'true shooting'],
    ['eFG%', pct(a.efgPct), 'efektivni šut'],
    ['TO ratio', pct(a.toRatio), 'izgubljene / posjed'],
    ['AST / TO', t.tov > 0 ? f2(t.ast / t.tov) : (t.ast > 0 ? String(t.ast) : '–'), 'asistencije / izgubljene'],
    ['Poeni iz reketa', t.pts ? pct((paint.pts / t.pts) * 100) : '–', `${paint.pts} od ${t.pts} (poz. šutevi)`],
    ['Poeni iz trice', t.pts ? pct(((t.fg3m * 3) / t.pts) * 100) : '–', `${t.fg3m * 3} od ${t.pts}`],
    ['Poeni sa SB', t.pts ? pct((t.ftm / t.pts) * 100) : '–', `${t.ftm} od ${t.pts}`],
  ]

  const zoneRows = ZONES.map((z) => {
    const zs = shots.filter((e) => shotZone(e.x, e.y) === z.key)
    const m = zs.filter((e) => e.made).length
    return { ...z, ma: `${m}-${zs.length}`, pct: zs.length ? `${Math.round((m / zs.length) * 100)}%` : '–' }
  })

  return (
    <div className="stat-page">
      <div className="stat-panel">
        <div className="section-title" style={{ marginBottom: 12 }}>Rezultat po četvrtinama</div>
        <table className="stats" style={{ maxWidth: 640 }}>
          <thead>
            <tr>
              <th className="l">Ekipa</th>
              {qs.map((q) => <th key={q}>{q}Č</th>)}
              <th>UK</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="l"><span className="pname" style={{ fontWeight: 600, color: 'var(--text)' }}>{usName}</span></td>
              {qs.map((q) => <td key={q}>{stats.byPeriod[q]?.us || 0}</td>)}
              <td className="big">{stats.score.us}</td>
            </tr>
            <tr>
              <td className="l"><span className="pname">{oppName}</span></td>
              {qs.map((q) => <td key={q}>{stats.byPeriod[q]?.opp || 0}</td>)}
              <td className="big">{stats.score.opp}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="stat-panel scroll-x">
        <div className="section-title" style={{ marginBottom: 12 }}>Box score</div>
        <table className="stats">
          <thead>
            <tr>
              <th className="l">Igrač</th>
              {cols.map(([h]) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {stats.players.map((r) => (
              <tr key={r.player.id} className={r.onCourt ? 'on' : ''}>
                <td className="l">
                  <span className="pnum">#{r.player.number}</span>
                  <span className="pname">{r.player.name}</span>
                </td>
                {cols.map(([h, fn, kind]) => (
                  <td key={h} className={cellClass(kind, r)}>{fn(r)}</td>
                ))}
              </tr>
            ))}
            <tr className="total">
              <td className="l"><span className="pname">UKUPNO</span></td>
              {cols.map(([h, fn, kind]) => (
                <td key={h} className={kind === 'big' ? 'big' : ''}>
                  {h === 'Č' || h === '+/-' ? '' : fn(t)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="stat-panel">
        <div className="section-title" style={{ marginBottom: 12 }}>Napredni pokazatelji</div>
        <div className="cards">
          {adv.map(([label, value, sub]) => (
            <div className="mini" key={label}>
              <div className="mini-label">{label}</div>
              <div className="mini-value">{value}</div>
              <div className="mini-sub">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-panel">
        <div className="section-title" style={{ marginBottom: 12 }}>Šut po zonama</div>
        <div className="cards">
          {zoneRows.map((z) => (
            <div className="mini" key={z.key} style={{ minWidth: 120 }}>
              <div className="mini-label">{z.label}</div>
              <div className="mini-value">{z.ma}<span className="suffix">{z.pct}</span></div>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-panel">
        <div className="section-title" style={{ marginBottom: 12 }}>Shot chart</div>
        <ShotChart game={game} />
      </div>
    </div>
  )
}
