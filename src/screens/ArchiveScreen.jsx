import React, { useMemo, useState } from 'react'
import { seasonStats } from '../model/season.js'
import { fmtPct } from '../model/derive.js'
import { boxScoreCsv, playByPlayCsv, seasonCsv, shareText, downloadCsv, gameFileBase } from '../model/exportCsv.js'
import StatsTab from '../components/StatsTab.jsx'

const hrDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('hr-HR')
}

export default function ArchiveScreen({ archive, onDelete, onClose, onShare, sharePanel }) {
  const [tab, setTab] = useState('utakmice')
  const [openId, setOpenId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  const season = useMemo(() => seasonStats(archive), [archive])
  const byNewest = useMemo(() => [...season.summaries].reverse(), [season])
  const open = byNewest.find((s) => s.game.id === openId) || null
  const trackTime = archive.some((g) => g.trackTime)

  return (
    <div className="scroll-page">
      <div className="setup" style={{ maxWidth: 1100 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, color: 'var(--blue-hi)' }}>Arhiva i sezona</h1>
          <button className="btn" onClick={onClose}>← Natrag</button>
        </div>

        {sharePanel}

        <div className="seg" style={{ maxWidth: 360 }}>
          <button className={tab === 'utakmice' ? 'on' : ''} onClick={() => setTab('utakmice')}>
            Utakmice ({season.games})
          </button>
          <button className={tab === 'sezona' ? 'on' : ''} onClick={() => setTab('sezona')}>Sezona</button>
        </div>

        {tab === 'utakmice' && (
          <div className="col">
            {season.games === 0 && <div className="panel" style={{ padding: 14 }} >Arhiva je prazna. Utakmica se sprema kad je završiš iz izbornika.</div>}
            {byNewest.map((s) => {
              const g = s.game
              const isOpen = openId === g.id
              return (
                <div className="panel" key={g.id} style={{ padding: 12 }}>
                  <div className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800 }}>
                        <span className={`pill ${s.result === 'L' ? 'hot' : ''}`}>{s.result}</span>
                        {' '}{s.usName} {s.stats.score.us} : {s.stats.score.opp} {s.oppName}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {hrDate(g.date)}{g.competition ? ` · ${g.competition}` : ''} · {g.events.length} unosa
                      </div>
                    </div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <button className="btn sm" onClick={() => setOpenId(isOpen ? null : g.id)}>
                        {isOpen ? 'Sakrij' : 'Otvori'}
                      </button>
                      <button className="btn sm" onClick={() => onShare(shareText(g, s.stats))}>Podijeli</button>
                      <button className="btn sm ghost" onClick={() => downloadCsv(boxScoreCsv(g, s.stats), `${gameFileBase(g)}-box.csv`)}>CSV box</button>
                      <button className="btn sm ghost" onClick={() => downloadCsv(playByPlayCsv(g), `${gameFileBase(g)}-play-by-play.csv`)}>CSV log</button>
                      {confirmId === g.id ? (
                        <>
                          <button className="btn sm bad" onClick={() => { onDelete(g.id); setConfirmId(null); setOpenId(null) }}>Da, obriši</button>
                          <button className="btn sm ghost" onClick={() => setConfirmId(null)}>Ne</button>
                        </>
                      ) : (
                        <button className="btn sm ghost" onClick={() => setConfirmId(g.id)}>Obriši</button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 10 }}>
                      <StatsTab game={g} stats={s.stats} usName={s.usName} oppName={s.oppName} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'sezona' && (
          <div className="col">
            <div className="cards">
              <div className="mini"><div className="mini-label">Omjer</div><div className="mini-value">{season.record.w}-{season.record.l}{season.record.d ? `-${season.record.d}` : ''}</div><div className="mini-sub">{season.games} utakmica</div></div>
              <div className="mini"><div className="mini-label">Dano po utakmici</div><div className="mini-value">{season.games ? (season.record.pf / season.games).toFixed(1) : '–'}</div><div className="mini-sub">ukupno {season.record.pf}</div></div>
              <div className="mini"><div className="mini-label">Primljeno po utakmici</div><div className="mini-value">{season.games ? (season.record.pa / season.games).toFixed(1) : '–'}</div><div className="mini-sub">ukupno {season.record.pa}</div></div>
              <div className="mini"><div className="mini-label">Razlika</div><div className="mini-value">{season.games ? ((season.record.pf - season.record.pa) / season.games > 0 ? '+' : '') + ((season.record.pf - season.record.pa) / season.games).toFixed(1) : '–'}</div><div className="mini-sub">po utakmici</div></div>
            </div>

            {season.rows.length === 0 ? (
              <div className="panel" style={{ padding: 14 }}>Još nema arhiviranih utakmica.</div>
            ) : (
              <>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn sm ghost" onClick={() => downloadCsv(seasonCsv(season.rows, trackTime), 'sezona.csv')}>
                    CSV sezone
                  </button>
                </div>
                <div className="stat-panel scroll-x">
                  <table className="stats">
                    <thead>
                      <tr>
                        <th className="l">Igrač</th><th>UT</th><th>{trackTime ? 'MIN' : 'Č'}</th>
                        <th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th>
                        <th>FG%</th><th>3P%</th><th>SB%</th><th>EFF</th>
                        <th>PTS zadnjih {season.lastN}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {season.rows.map((r) => (
                        <tr key={r.key}>
                          <td className="l"><b>#{r.number}</b> {r.name}</td>
                          <td>{r.games}</td>
                          <td>{(trackTime ? r.avg.min : r.avg.periods).toFixed(1)}</td>
                          <td><b>{r.avg.pts.toFixed(1)}</b></td>
                          <td>{r.avg.reb.toFixed(1)}</td>
                          <td>{r.avg.ast.toFixed(1)}</td>
                          <td>{r.avg.stl.toFixed(1)}</td>
                          <td>{r.avg.blk.toFixed(1)}</td>
                          <td>{r.avg.tov.toFixed(1)}</td>
                          <td>{r.avg.pf.toFixed(1)}</td>
                          <td>{fmtPct(r.fgPct, 0)}</td>
                          <td>{fmtPct(r.fg3Pct, 0)}</td>
                          <td>{fmtPct(r.ftPct, 0)}</td>
                          <td>{r.avg.eff.toFixed(1)}</td>
                          <td>
                            {r.recent.pts == null ? '–' : r.recent.pts.toFixed(1)}
                            {r.trend != null && Math.abs(r.trend) >= 0.05 && (
                              <span className={r.trend > 0 ? 'pos' : 'neg'}>
                                {' '}{r.trend > 0 ? '▲' : '▼'}{Math.abs(r.trend).toFixed(1)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Prosjeci po utakmici. Zadnji stupac je prosjek poena u zadnjih {season.lastN} utakmica
                  i strelica pokazuje odstupanje od sezonskog prosjeka. Igrač se kroz sezonu prepoznaje
                  po broju dresa i imenu.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
