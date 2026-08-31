import React, { useMemo, useState } from 'react'
import { ZONES, shotZone } from '../model/court.js'
import { positionedShots } from './ShotChart.jsx'
import ShotChart from './ShotChart.jsx'
import Court from './Court.jsx'
import GameFlow from './GameFlow.jsx'
import { derive, fmtPct, fmtClock } from '../model/derive.js'
import { assistPairs, lineupStats, playerStints, foulTimeline, playerByPeriod } from '../model/report.js'

const pct = (v) => (v == null ? '–' : `${Math.round(v)}%`)
const f2 = (v) => (v == null ? '–' : v.toFixed(2))

/** Kartica jednog igrača: po četvrtinama, dionice, prekršaji, shot chart. */
function PlayerDetail({ game, row }) {
  const pid = row.player.id
  const per = useMemo(() => playerByPeriod(game, pid), [game, pid])
  const stints = useMemo(() => playerStints(game)[pid] || [], [game, pid])
  const fouls = useMemo(() => foulTimeline(game)[pid] || [], [game, pid])
  const shots = useMemo(() => positionedShots(game, { playerId: pid }), [game, pid])
  const qs = Object.keys(per).map(Number).sort((a, b) => a - b)

  const at = (pt) => (pt == null ? '' : game.trackTime && pt.clock != null
    ? `${pt.period}Č ${fmtClock(pt.clock)}`
    : `${pt.period}Č`)

  return (
    <div className="pdetail">
      <div className="pdetail-grid">
        <div>
          {qs.length > 0 && (
            <table className="stats" style={{ marginBottom: 12 }}>
              <thead>
                <tr><th className="l">Č</th><th>PTS</th><th>ŠUT</th><th>SB</th><th>SK</th><th>AST</th><th>TO</th><th>PF</th></tr>
              </thead>
              <tbody>
                {qs.map((q) => (
                  <tr key={q}>
                    <td className="l">{q}Č</td>
                    <td className="big">{per[q].pts}</td>
                    <td>{per[q].fgm}-{per[q].fga}</td>
                    <td>{per[q].ftm}-{per[q].fta}</td>
                    <td>{per[q].reb}</td>
                    <td>{per[q].ast}</td>
                    <td>{per[q].tov}</td>
                    <td>{per[q].pf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {stints.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="section-title" style={{ marginBottom: 6 }}>Dionice igranja</div>
              <div className="chips">
                {stints.map((s, i) => (
                  <span className="chip" key={i}>{at(s.from)} → {s.to ? at(s.to) : 'kraj'}</span>
                ))}
              </div>
            </div>
          )}

          {fouls.length > 0 && (
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>Prekršaji</div>
              <div className="chips">
                {fouls.map((f) => (
                  <span className={`chip ${f.n >= 4 ? 'hotc' : ''}`} key={f.n}>{f.n}. osobna · {game.trackTime && f.clock != null ? `${f.period}Č ${fmtClock(f.clock)}` : `${f.period}Č`}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          {shots.length > 0 ? (
            <Court shots={shots} interactive={false} style={{ maxWidth: 320 }} />
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>Nema šuteva s pozicijom za ovog igrača.</div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Statistika: tijek, četvrtine, box score (i po četvrtinama), usporedba, petorke... */
export default function StatsTab({ game, stats, usName, oppName }) {
  const [win, setWin] = useState(null)          // null = cijela utakmica; [1] = 1Č; [1,2] = 1. poluvrijeme
  const [openPid, setOpenPid] = useState(null)

  const periods = Object.keys(stats.byPeriod).map(Number)
  const maxQ = Math.max(game.quarterCount || 4, ...periods, 1)
  const qs = Array.from({ length: maxQ }, (_, i) => i + 1)
  const h1 = qs.slice(0, Math.ceil(maxQ / 2))
  const h2 = qs.slice(Math.ceil(maxQ / 2))

  const winStats = useMemo(
    () => (win ? derive(game, { period: stats.period, clock: null }, { periods: win }) : stats),
    [win, game, stats],
  )

  const pairsA = useMemo(() => assistPairs(game), [game])
  const lu = useMemo(() => lineupStats(game), [game])
  const byId = useMemo(() => Object.fromEntries(game.roster.map((p) => [p.id, p])), [game.roster])
  const num = (id) => (byId[id] ? `#${byId[id].number}` : '?')
  const nm = (id) => (byId[id] ? `#${byId[id].number} ${byId[id].name}` : '?')

  const t = winStats.teamTotals
  const tf = stats.teamTotals
  const a = stats.advanced.us
  const { paint } = stats.advanced
  const shots = positionedShots(game)

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
    ['IZB', (r) => r.fd],
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
    ['AST / TO', tf.tov > 0 ? f2(tf.ast / tf.tov) : (tf.ast > 0 ? String(tf.ast) : '–'), 'asistencije / izgubljene'],
    ['Poeni iz reketa', tf.pts ? pct((paint.pts / tf.pts) * 100) : '–', `${paint.pts} od ${tf.pts} (poz. šutevi)`],
    ['Poeni iz trice', tf.pts ? pct(((tf.fg3m * 3) / tf.pts) * 100) : '–', `${tf.fg3m * 3} od ${tf.pts}`],
    ['Poeni sa SB', tf.pts ? pct((tf.ftm / tf.pts) * 100) : '–', `${tf.ftm} od ${tf.pts}`],
  ]

  const zoneRows = ZONES.map((z) => {
    const zs = shots.filter((e) => shotZone(e.x, e.y) === z.key)
    const m = zs.filter((e) => e.made).length
    return { ...z, ma: `${m}-${zs.length}`, pct: zs.length ? `${Math.round((m / zs.length) * 100)}%` : '–' }
  })

  const o = stats.opp
  const cmp = [
    ['Poeni', tf.pts, o.pts],
    ['2P', `${tf.fg2m}-${tf.fg2a}`, game.trackOpponentShots ? `${o.fg2m}-${o.fg2a}` : `${o.fg2m} pogodaka`],
    ['3P', `${tf.fg3m}-${tf.fg3a}`, game.trackOpponentShots ? `${o.fg3m}-${o.fg3a}` : `${o.fg3m} pogodaka`],
    ['Slobodna', `${tf.ftm}-${tf.fta}`, `${o.ftm}-${o.fta}`],
    ['Skokovi', tf.reb, o.reb],
    ['— napadački', tf.oreb, o.oreb],
    ['Izgubljene', tf.tov, o.tov],
    ['Prekršaji', tf.pf, o.pf],
    ['Time-outi', stats.timeouts.us, stats.timeouts.opp],
  ]

  const winLabel = (w) => (w == null ? 'UK'
    : w.length === 1 ? `${w[0]}Č`
      : w[0] === 1 ? '1. pol' : '2. pol')
  const sameWin = (x, y) => JSON.stringify(x) === JSON.stringify(y)
  const winOptions = [null, ...qs.map((q) => [q]), ...(maxQ > 2 ? [h1, h2] : [])]

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
            <tr className="subrow">
              <td className="l"><span className="pname muted">Prekršaji {usName}</span></td>
              {qs.map((q) => {
                const n = stats.teamFouls[q]?.us || 0
                return <td key={q} className={n >= 5 ? 'hot' : ''}>{n || ''}</td>
              })}
              <td>{tf.pf}</td>
            </tr>
            <tr className="subrow">
              <td className="l"><span className="pname muted">Prekršaji {oppName}</span></td>
              {qs.map((q) => {
                const n = stats.teamFouls[q]?.opp || 0
                return <td key={q} className={n >= 5 ? 'hot' : ''}>{n || ''}</td>
              })}
              <td>{o.pf}</td>
            </tr>
          </tbody>
        </table>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Crveno = ekipa u bonusu (5+ momčadskih u četvrtini).</div>
      </div>

      <div className="stat-panel">
        <div className="section-title" style={{ marginBottom: 12 }}>Tijek utakmice</div>
        <GameFlow game={game} usName={usName} oppName={oppName} />
      </div>

      <div className="stat-panel scroll-x">
        <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
          <div className="section-title">Box score{win ? ` · ${winLabel(win)}` : ''}</div>
          <div className="qseg">
            {winOptions.map((w) => (
              <button key={winLabel(w)} className={sameWin(win, w) ? 'on' : ''} onClick={() => { setWin(w); setOpenPid(null) }}>
                {winLabel(w)}
              </button>
            ))}
          </div>
        </div>
        <table className="stats">
          <thead>
            <tr>
              <th className="l">Igrač</th>
              {cols.map(([h]) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {winStats.players.map((r) => (
              <React.Fragment key={r.player.id}>
                <tr
                  className={`${r.onCourt ? 'on' : ''} clickable ${openPid === r.player.id ? 'open' : ''}`}
                  onClick={() => setOpenPid(openPid === r.player.id ? null : r.player.id)}
                >
                  <td className="l">
                    <span className="pnum">#{r.player.number}</span>
                    <span className="pname">{r.player.name}</span>
                  </td>
                  {cols.map(([h, fn, kind]) => (
                    <td key={h} className={cellClass(kind, r)}>{fn(r)}</td>
                  ))}
                </tr>
                {openPid === r.player.id && (
                  <tr className="detail-row">
                    <td colSpan={cols.length + 1}>
                      <PlayerDetail game={game} row={r} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
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
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          Tap na igrača otvara detalje (po četvrtinama, dionice, prekršaji, shot chart). IZB = izborene osobne.
        </div>
      </div>

      <div className="stat-panel">
        <div className="section-title" style={{ marginBottom: 12 }}>Usporedba ekipa</div>
        <table className="stats" style={{ maxWidth: 560 }}>
          <thead>
            <tr><th className="l">{usName}</th><th style={{ width: 120 }} /><th className="r">{oppName}</th></tr>
          </thead>
          <tbody>
            {cmp.map(([label, us, opp]) => (
              <tr key={label}>
                <td className="l big">{us}</td>
                <td style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>{label}</td>
                <td className="r big">{opp}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!game.trackOpponentShots && (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
            Protivnički promašaji i skokovi bilježe se djelomično (šutevi protivnika se nisu pratili).
          </div>
        )}
      </div>

      {pairsA.length > 0 && (
        <div className="stat-panel">
          <div className="section-title" style={{ marginBottom: 12 }}>Tko hrani koga · asistencije</div>
          <div className="chips">
            {pairsA.slice(0, 10).map((p) => (
              <span className="chip" key={`${p.fromId}-${p.toId}`}>
                {nm(p.fromId)} → {nm(p.toId)} <b>×{p.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {lu.fives.length >= 2 && (
        <div className="stat-panel scroll-x">
          <div className="section-title" style={{ marginBottom: 12 }}>Petorke</div>
          <table className="stats" style={{ maxWidth: 720 }}>
            <thead>
              <tr><th className="l">Petorka</th>{game.trackTime && <th>MIN</th>}<th>Č</th><th>+/-</th></tr>
            </thead>
            <tbody>
              {lu.fives.filter((f) => f.plusMinus !== 0 || f.secs >= 30 || !game.trackTime).slice(0, 6).map((f) => (
                <tr key={f.key}>
                  <td className="l">{f.ids.map(num).join(' ')}</td>
                  {game.trackTime && <td>{Math.round(f.secs / 60)}</td>}
                  <td>{f.periods}</td>
                  <td className={f.plusMinus > 0 ? 'pos' : f.plusMinus < 0 ? 'neg' : 'zero'}>
                    {f.plusMinus > 0 ? `+${f.plusMinus}` : f.plusMinus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lu.pairs.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <div className="chips">
                {lu.pairs.slice(0, 3).map((p) => (
                  <span className="chip posc" key={p.key}>{p.ids.map(num).join('+')} <b>{p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}</b></span>
                ))}
                {lu.pairs.slice(-3).reverse().filter((p) => p.plusMinus < 0).map((p) => (
                  <span className="chip hotc" key={p.key}>{p.ids.map(num).join('+')} <b>{p.plusMinus}</b></span>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Najbolji i najslabiji parovi po +/- dok su zajedno na parketu.</div>
            </div>
          )}
        </div>
      )}

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
