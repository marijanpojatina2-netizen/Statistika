import React, { useMemo, useState } from 'react'
import Court from './Court.jsx'
import { EV, TEAM } from '../model/events.js'
import { ZONES, shotZone } from '../model/court.js'
import { fmtPct } from '../model/derive.js'

/** Šutevi s pozicijom na terenu (klasični unos gumbima nema poziciju). */
export function positionedShots(game, { playerId = 'all', period = 'all' } = {}) {
  return game.events.filter((e) => (
    e.type === EV.SHOT
    && e.team !== TEAM.OPP
    && e.x != null && e.y != null
    && e.value !== 1
    && (playerId === 'all' || e.playerId === playerId)
    && (period === 'all' || e.period === Number(period))
  ))
}

export default function ShotChart({ game }) {
  const [playerId, setPlayerId] = useState('all')
  const [period, setPeriod] = useState('all')

  const periods = useMemo(
    () => [...new Set(game.events.map((e) => e.period))].sort((a, b) => a - b),
    [game.events],
  )

  const shots = useMemo(() => positionedShots(game, { playerId, period }), [game, playerId, period])

  const zoneRows = useMemo(() => {
    const acc = Object.fromEntries(ZONES.map((z) => [z.key, { m: 0, a: 0 }]))
    for (const s of shots) {
      const z = acc[shotZone(s.x, s.y)]
      z.a += 1
      if (s.made) z.m += 1
    }
    return ZONES.map((z) => ({ ...z, ...acc[z.key] }))
  }, [shots])

  const made = shots.filter((s) => s.made).length
  const noPos = game.events.filter(
    (e) => e.type === EV.SHOT && e.team !== TEAM.OPP && e.value !== 1 && e.x == null,
  ).length

  return (
    <div className="shot-layout">
      <div className="panel" style={{ padding: 10 }}>
        <div className="court-legend" style={{ marginBottom: 6 }}>
          <span><span className="dot" />pogodak</span>
          <span><span className="x">✕</span>promašaj</span>
          <span className="grow" />
          <span>{made}/{shots.length} {fmtPct(shots.length ? (made / shots.length) * 100 : null, 0)}</span>
        </div>
        <Court shots={shots} interactive={false} style={{ maxWidth: 520, margin: '0 auto' }} />
        {noPos > 0 && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {noPos} {noPos === 1 ? 'šut unesen' : 'šuteva uneseno'} klasičnim gumbima, bez pozicije — ne prikazuje se na dijagramu.
          </div>
        )}
      </div>

      <div className="col">
        <div className="panel" style={{ padding: 10 }}>
          <div className="field">
            <label>Igrač</label>
            <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
              <option value="all">Cijela ekipa</option>
              {game.roster.map((p) => (
                <option key={p.id} value={p.id}>#{p.number} {p.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Četvrtina</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="all">Sve</option>
              {periods.map((q) => <option key={q} value={q}>{q}. četvrtina</option>)}
            </select>
          </div>
        </div>

        <div className="panel table-wrap">
          <table className="stats">
            <thead>
              <tr><th className="l">Zona</th><th>Pog-Šut</th><th>%</th></tr>
            </thead>
            <tbody>
              {zoneRows.map((z) => (
                <tr key={z.key}>
                  <td className="l">{z.label}</td>
                  <td>{z.m}-{z.a}</td>
                  <td>{fmtPct(z.a ? (z.m / z.a) * 100 : null, 0)}</td>
                </tr>
              ))}
              <tr className="total">
                <td className="l">UKUPNO IZ IGRE</td>
                <td>{made}-{shots.length}</td>
                <td>{fmtPct(shots.length ? (made / shots.length) * 100 : null, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
