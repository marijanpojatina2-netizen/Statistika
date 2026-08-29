import React, { useState } from 'react'
import { fmtPct } from '../model/derive.js'

const COLS = (trackTime) => ([
  { k: 'min', t: trackTime ? 'MIN' : 'Č', f: (r) => (trackTime ? r.min : r.periods) },
  { k: 'pts', t: 'PTS' },
  { k: 'fg2', t: '2P', f: (r) => `${r.fg2m}-${r.fg2a}`, s: (r) => r.fg2m },
  { k: 'fg3', t: '3P', f: (r) => `${r.fg3m}-${r.fg3a}`, s: (r) => r.fg3m },
  { k: 'ft', t: 'SB', f: (r) => `${r.ftm}-${r.fta}`, s: (r) => r.ftm },
  { k: 'fgPct', t: 'FG%', f: (r) => fmtPct(r.fgPct, 0) },
  { k: 'oreb', t: 'OR' },
  { k: 'dreb', t: 'DR' },
  { k: 'reb', t: 'REB' },
  { k: 'ast', t: 'AST' },
  { k: 'stl', t: 'STL' },
  { k: 'blk', t: 'BLK' },
  { k: 'tov', t: 'TO' },
  { k: 'pf', t: 'PF' },
  { k: 'plusMinus', t: '+/-', f: (r) => (r.plusMinus > 0 ? `+${r.plusMinus}` : r.plusMinus) },
  { k: 'eff', t: 'EFF' },
])

export default function BoxScore({ game, stats }) {
  const [sort, setSort] = useState({ k: null, dir: -1 })
  const cols = COLS(game.trackTime)

  const rows = [...stats.players]
  if (sort.k) {
    const col = cols.find((c) => c.k === sort.k)
    const val = (r) => (col?.s ? col.s(r) : (typeof r[sort.k] === 'number' ? r[sort.k] : 0))
    rows.sort((a, b) => (val(a) - val(b)) * sort.dir)
  }

  const t = stats.teamTotals
  const click = (k) => setSort((s) => (s.k === k ? { k, dir: -s.dir } : { k, dir: -1 }))

  const periods = Object.keys(stats.byPeriod).map(Number).sort((a, b) => a - b)

  return (
    <div className="col">
      <div className="panel" style={{ padding: 10 }}>
        <div className="section-title">Rezultat po četvrtinama</div>
        <div className="table-wrap">
          <table className="stats">
            <thead>
              <tr>
                <th className="l">Ekipa</th>
                {periods.map((p) => <th key={p}>{p}Č</th>)}
                <th>UK</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="l"><b>{game.weAreHome ? game.homeName : game.awayName}</b></td>
                {periods.map((p) => <td key={p}>{stats.byPeriod[p].us}</td>)}
                <td><b>{stats.score.us}</b></td>
              </tr>
              <tr>
                <td className="l">{game.weAreHome ? game.awayName : game.homeName}</td>
                {periods.map((p) => <td key={p}>{stats.byPeriod[p].opp}</td>)}
                <td><b>{stats.score.opp}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel table-wrap">
        <table className="stats">
          <thead>
            <tr>
              <th className="l" onClick={() => setSort({ k: null, dir: -1 })}>Igrač</th>
              {cols.map((c) => <th key={c.k} onClick={() => click(c.k)}>{c.t}{sort.k === c.k ? (sort.dir < 0 ? ' ▾' : ' ▴') : ''}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.player.id} className={r.onCourt ? 'on' : ''}>
                <td className="l"><b>#{r.player.number}</b> {r.player.name}</td>
                {cols.map((c) => <td key={c.k}>{c.f ? c.f(r) : r[c.k]}</td>)}
              </tr>
            ))}
            <tr className="total">
              <td className="l">UKUPNO</td>
              {cols.map((c) => <td key={c.k}>{c.f ? c.f(t) : t[c.k] ?? ''}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
