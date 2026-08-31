import React, { useMemo, useState } from 'react'
import { scoreFlow, runsOf, leadInfo } from '../model/report.js'
import { fmtClock } from '../model/derive.js'

// Boje provjerene validatorom (CVD + kontrast na tamnoj podlozi)
const C_US = '#4a84ee'
const C_OPP = '#e05c5c'

const W = 860
const H = 250
const PAD = { l: 38, r: 12, t: 16, b: 26 }

/**
 * Tijek utakmice: razlika u rezultatu kroz vrijeme (step-linija oko nule),
 * granice četvrtina, najveća vodstva i serije. Sve iz event loga.
 */
export default function GameFlow({ game, usName, oppName }) {
  const flow = useMemo(() => scoreFlow(game), [game])
  const runs = useMemo(() => runsOf(game, 6), [game])
  const lead = useMemo(() => leadInfo(game), [game])
  const [hover, setHover] = useState(null)

  if (flow.length < 3) {
    return <div className="muted" style={{ fontSize: 13 }}>Premalo koševa za prikaz tijeka.</div>
  }

  const P = (game.quarterLength || 10) * 60
  const maxQ = Math.max(game.quarterCount || 4, ...flow.map((p) => p.period))
  const T = maxQ * P
  const maxAbs = Math.max(4, ...flow.map((p) => Math.abs(p.diff)))
  const yMax = Math.ceil(maxAbs / 2) * 2

  const x = (t) => PAD.l + (t / T) * (W - PAD.l - PAD.r)
  const y = (d) => PAD.t + ((yMax - d) / (2 * yMax)) * (H - PAD.t - PAD.b)
  const mid = y(0)

  // step-putanja (rezultat se mijenja skokovito)
  const pts = [...flow, { ...flow.at(-1), t: T }]
  let line = `M ${x(0)} ${mid}`
  for (let i = 1; i < pts.length; i++) line += ` L ${x(pts[i].t)} ${y(pts[i - 1].diff)} L ${x(pts[i].t)} ${y(pts[i].diff)}`
  const area = `${line} L ${x(T)} ${mid} Z`

  const yTicks = []
  const step = yMax > 12 ? Math.ceil(yMax / 12) * 4 : 4
  for (let v = step; v <= yMax; v += step) yTicks.push(v)

  const onMove = (e) => {
    const svg = e.currentTarget
    const r = svg.getBoundingClientRect()
    const t = ((e.clientX - r.left) / r.width * W - PAD.l) / (W - PAD.l - PAD.r) * T
    let best = flow[0]
    for (const p of flow) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
    setHover(best)
  }

  const tipLabel = (p) => {
    const when = game.trackTime && p.clock != null ? `${p.period}Č ${fmtClock(p.clock)}` : `${p.period}. četvrtina`
    const d = p.diff > 0 ? `+${p.diff}` : String(p.diff)
    return `${when} · ${p.us}:${p.opp} (${d})`
  }

  const runLabel = (r) => {
    const q = r.from.period === r.to.period ? `${r.from.period}Č` : `${r.from.period}–${r.to.period}Č`
    return `${r.points}:0 (${q})`
  }
  const topRuns = (side) => runs.filter((r) => r.side === side).slice(0, 2)

  return (
    <div className="flow-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="flow-svg"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="flowClip"><path d={area} /></clipPath>
        </defs>

        {/* diskretna mreža + y oznake */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="flow-grid" />
            <line x1={PAD.l} x2={W - PAD.r} y1={y(-v)} y2={y(-v)} className="flow-grid" />
            <text x={PAD.l - 6} y={y(v) + 3} className="flow-ylab">+{v}</text>
            <text x={PAD.l - 6} y={y(-v) + 3} className="flow-ylab">-{v}</text>
          </g>
        ))}

        {/* granice četvrtina */}
        {Array.from({ length: maxQ }, (_, i) => (
          <g key={i}>
            {i > 0 && <line x1={x(i * P)} x2={x(i * P)} y1={PAD.t} y2={H - PAD.b} className="flow-qline" />}
            <text x={x((i + 0.5) * P)} y={H - 8} className="flow-qlab">{i + 1}Č</text>
          </g>
        ))}

        {/* ispuna: plavo iznad nule (vodimo), crveno ispod */}
        <g clipPath="url(#flowClip)">
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={mid - PAD.t} fill={C_US} opacity=".22" />
          <rect x={PAD.l} y={mid} width={W - PAD.l - PAD.r} height={H - PAD.b - mid} fill={C_OPP} opacity=".22" />
        </g>

        {/* nulta linija + step-krivulja u dvije boje (gornja/donja polovica) */}
        <line x1={PAD.l} x2={W - PAD.r} y1={mid} y2={mid} className="flow-zero" />
        <g clipPath="url(#topHalf)" />
        <clipPath id="flowTop"><rect x="0" y="0" width={W} height={mid} /></clipPath>
        <clipPath id="flowBot"><rect x="0" y={mid} width={W} height={H - mid} /></clipPath>
        <path d={line} fill="none" stroke={C_US} strokeWidth="2" clipPath="url(#flowTop)" />
        <path d={line} fill="none" stroke={C_OPP} strokeWidth="2" clipPath="url(#flowBot)" />

        {/* najveća vodstva — selektivne oznake */}
        {lead.us && <text x={x(flow.find((p) => p.diff === lead.us.points)?.t || 0)} y={y(lead.us.points) - 6} className="flow-peak us">+{lead.us.points}</text>}
        {lead.opp && <text x={x(flow.find((p) => p.diff === -lead.opp.points)?.t || 0)} y={y(-lead.opp.points) + 14} className="flow-peak opp">-{lead.opp.points}</text>}

        {/* hover: nišan + točka */}
        {hover && (
          <g>
            <line x1={x(hover.t)} x2={x(hover.t)} y1={PAD.t} y2={H - PAD.b} className="flow-cross" />
            <circle cx={x(hover.t)} cy={y(hover.diff)} r="4.5" fill={hover.diff >= 0 ? C_US : C_OPP} stroke="var(--bg)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {hover && <div className="flow-tip">{tipLabel(hover)}</div>}

      <div className="flow-meta">
        <span className="flow-key"><span className="dot" style={{ background: C_US }} />{usName}</span>
        {lead.us && <span className="muted">najveće vodstvo +{lead.us.points}{game.trackTime && lead.us.clock != null ? ` (${lead.us.period}Č ${fmtClock(lead.us.clock)})` : ` (${lead.us.period}Č)`}</span>}
        {topRuns('us').map((r, i) => <span className="run-chip us" key={i}>serija {runLabel(r)}</span>)}
        <span className="grow" />
        <span className="flow-key"><span className="dot" style={{ background: C_OPP }} />{oppName}</span>
        {lead.opp && <span className="muted">najveće +{lead.opp.points}{` (${lead.opp.period}Č)`}</span>}
        {topRuns('opp').map((r, i) => <span className="run-chip opp" key={i}>serija {runLabel(r)}</span>)}
      </div>
    </div>
  )
}
