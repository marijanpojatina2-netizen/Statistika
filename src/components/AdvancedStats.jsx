import React from 'react'
import { fmtPct } from '../model/derive.js'

// Kategorijalne boje udjela poena. Redoslijed je provjeren validatorom
// (OKLCH raspon svjetline, CVD odvojivost, kontrast na tamnoj podlozi) —
// ne mijenjati redoslijed segmenata bez ponovne provjere.
const SHARE = [
  { key: 'paint', label: 'Reket', color: '#4A90E2' },
  { key: 'three', label: 'Trice', color: '#35A86A' },
  { key: 'other', label: 'Ostalo iz igre', color: '#A279E6' },
  { key: 'ft', label: 'Slobodna bacanja', color: '#D2622C' },
]

const Tile = ({ label, value, note }) => (
  <div className="tile">
    <div className="tile-label">{label}</div>
    <div className="tile-value">{value}</div>
    {note && <div className="tile-note">{note}</div>}
  </div>
)

const num = (v, d = 2) => (v == null ? '–' : v.toFixed(d))

export default function AdvancedStats({ game, stats }) {
  const t = stats.teamTotals
  const o = stats.opp
  const a = stats.advanced.us
  const ao = stats.advanced.opp
  const { paint, share } = stats.advanced

  // Poeni po izvoru — zbroj je uvijek ukupan broj poena.
  const threePts = t.fg3m * 3
  const ftPts = t.ftm
  const otherPts = Math.max(0, t.pts - paint.pts - threePts - ftPts)
  const parts = [
    { ...SHARE[0], pts: paint.pts },
    { ...SHARE[1], pts: threePts },
    { ...SHARE[2], pts: otherPts },
    { ...SHARE[3], pts: ftPts },
  ]
  const totalPts = t.pts || 0
  const segs = parts
    .map((p) => ({ ...p, pct: totalPts ? (p.pts / totalPts) * 100 : 0 }))
    .filter((p) => p.pts > 0)

  const positionCoverage = t.fga ? Math.round((paint.positionedAtt / t.fga) * 100) : 0
  const runLabel = stats.run.team
    ? `${stats.run.points}:0 ${stats.run.team === 'us' ? 'za nas' : 'za protivnika'}`
    : 'nema serije'

  const rows = [
    ['eFG% — šut iz igre s težinom trice', fmtPct(a.efgPct), fmtPct(ao.efgPct)],
    ['TS% — pravi postotak šuta', fmtPct(a.tsPct), fmtPct(ao.tsPct)],
    ['Posjedi (procjena)', num(a.poss, 1), num(ao.poss, 1)],
    ['PPP — poeni po posjedu', num(a.ppp, 2), num(ao.ppp, 2)],
    ['TO ratio — izgubljene na 100 posjeda', num(a.toRatio, 1), num(ao.toRatio, 1)],
    ['OR% — osvojeni napadački skokovi', fmtPct(a.orPct), fmtPct(ao.orPct)],
    ['DR% — osvojeni obrambeni skokovi', fmtPct(a.drPct), fmtPct(ao.drPct)],
  ]

  return (
    <div className="col">
      <div className="tiles">
        <Tile label="eFG%" value={fmtPct(a.efgPct, 1)} note={`${t.fgm}-${t.fga} iz igre`} />
        <Tile label="TS%" value={fmtPct(a.tsPct, 1)} note={`${t.pts} poena`} />
        <Tile label="PPP" value={num(a.ppp, 2)} note={`${num(a.poss, 1)} posjeda`} />
        <Tile label="TO ratio" value={num(a.toRatio, 1)} note={`${t.tov} izgubljenih`} />
        <Tile label="OR%" value={fmtPct(a.orPct, 1)} note={`${t.oreb} nap. skokova`} />
        <Tile label="DR%" value={fmtPct(a.drPct, 1)} note={`${t.dreb} obr. skokova`} />
      </div>

      <div className="panel" style={{ padding: 12 }}>
        <div className="section-title">Udio poena po izvoru</div>
        {totalPts === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>Još nema poena.</div>
        ) : (
          <>
            <div className="share-bar" style={{ marginTop: 8 }}>
              {segs.map((s) => (
                <div key={s.key} className="share-seg" style={{ flexGrow: s.pct, background: s.color }}>
                  {s.pct >= 12 && <span>{Math.round(s.pct)}%</span>}
                </div>
              ))}
            </div>
            <table className="stats" style={{ marginTop: 10 }}>
              <thead>
                <tr><th className="l">Izvor</th><th>Poeni</th><th>Udio</th></tr>
              </thead>
              <tbody>
                {parts.map((p) => (
                  <tr key={p.key}>
                    <td className="l">
                      <span className="swatch" style={{ background: p.color }} />
                      {p.label}
                    </td>
                    <td>{p.pts}</td>
                    <td>{totalPts ? `${Math.round((p.pts / totalPts) * 100)}%` : '–'}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td className="l">UKUPNO</td><td>{totalPts}</td><td>100%</td>
                </tr>
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Poeni iz reketa računaju se samo iz šuteva unesenih preko dijagrama terena
              ({positionCoverage}% šuteva iz igre). Ostatak dvica ide u „Ostalo iz igre”.
            </div>
          </>
        )}
      </div>

      <div className="panel" style={{ padding: 12 }}>
        <div className="section-title">Vodstva i serije</div>
        <div className="tiles" style={{ marginTop: 8 }}>
          <Tile label="Naše najveće vodstvo" value={`+${stats.largestLead.us}`} />
          <Tile label="Protivnikovo najveće" value={`+${stats.largestLead.opp}`} />
          <Tile label="Trenutna serija" value={runLabel} />
        </div>
      </div>

      <div className="panel table-wrap">
        <table className="stats">
          <thead>
            <tr>
              <th className="l">Pokazatelj</th>
              <th>{game.weAreHome ? game.homeName : game.awayName}</th>
              <th>{game.weAreHome ? game.awayName : game.homeName}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                <td className="l">{r[0]}</td>
                <td>{r[1]}</td>
                <td>{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!game.trackOpponentShots && (
          <div className="muted" style={{ fontSize: 12, padding: 10 }}>
            Protivnikovi promašaji se ne prate, pa su njegov eFG%, TS%, posjedi i PPP
            nepotpuni. Uključi „Prati šuteve protivnika” pri postavljanju utakmice za
            punu usporedbu. Skokovi i prekršaji su točni jer se unose kroz lančane upite.
          </div>
        )}
      </div>
    </div>
  )
}
