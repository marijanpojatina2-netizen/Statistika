import React, { useRef } from 'react'
import { shotValue } from '../model/court.js'

// Dizajn koristi vlastiti SVG koordinatni sustav 750x700 (pola terena, koš dolje).
// Model i dalje radi s normaliziranim 0..1 koordinatama, pa se ovdje samo preslikava.
const W = 750
const H = 700
const toSvg = (x, y) => ({ cx: x * W, cy: H - y * H })

/** Daske parketa — suptilne razlike u tonu javora. */
const PLANKS = [
  [0, 0, 184, '#d3a266'], [185, 0, 115, '#cd9a5e'],
  [0, 14, 96, '#cf9d61'], [97, 14, 203, '#d6a76c'],
  [0, 28, 150, '#ca965a'], [151, 28, 149, '#d2a165'],
  [0, 42, 216, '#d5a569'], [217, 42, 83, '#cc985d'],
  [0, 56, 70, '#d1a064'], [71, 56, 229, '#cf9c60'],
  [0, 70, 130, '#d4a468'], [131, 70, 169, '#c99459'],
]

/**
 * Dijagram polovice terena (FIBA mjere) s parketom.
 * Tap vraća normaliziranu poziciju preko `onPick(x, y)`.
 */
export default function Court({ shots = [], pending = null, onPick, interactive = true, style, svgRef }) {
  const ref = useRef(null)

  const handle = (e) => {
    if (!interactive || !onPick) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const yTop = ((e.clientY - rect.top) / rect.height) * H
    const y = Math.min(1, Math.max(0, (H - yTop) / H))
    onPick(x, y)
  }

  // click, ne pointerdown: modal otvoren usred dodira zatvorio bi duh-klik
  // istog prsta cim se digne
  return (
    <svg
      ref={(el) => { ref.current = el; if (svgRef) svgRef.current = el }}
      className={`court ${interactive ? 'live' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      onClick={interactive ? handle : undefined}
      style={style}
    >
      <defs>
        <pattern id="planks" width="300" height="84" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="300" height="84" fill="#c69257" />
          {PLANKS.map(([x, y, w, fill], i) => (
            <rect key={i} x={x} y={y} width={w} height="13.5" fill={fill} />
          ))}
        </pattern>
        <linearGradient id="courtSheen" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#fff3dd" stopOpacity="0.16" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#4a2408" stopOpacity="0.18" />
        </linearGradient>
        <radialGradient id="courtGlow" cx="0.5" cy="0.85" r="0.75">
          <stop offset="0" stopColor="#ffe9c4" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffe9c4" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* pod */}
      <rect x="0" y="0" width={W} height={H} fill="url(#planks)" rx="6" />
      <path d={`M 0 0 H ${W} V ${H} H 0 Z M 26 26 V 674 H 724 V 26 Z`} fill="#6b3d18" fillOpacity="0.28" fillRule="evenodd" />
      <rect x="252.5" y="410" width="245" height="290" fill="#8a4a20" fillOpacity="0.42" />
      <rect x="0" y="0" width={W} height={H} fill="url(#courtGlow)" rx="6" />
      <rect x="0" y="0" width={W} height={H} fill="url(#courtSheen)" rx="6" />

      {/* linije */}
      <rect x="26" y="26" width="698" height="674" fill="none" stroke="#f7f0e0" strokeWidth="3.5" />
      <path d="M 285 26 A 90 90 0 0 0 465 26" fill="none" stroke="#f7f0e0" strokeWidth="3" />
      <rect x="252.5" y="410" width="245" height="290" fill="none" stroke="#f7f0e0" strokeWidth="3" />
      <circle cx="375" cy="410" r="90" fill="none" stroke="#f7f0e0" strokeWidth="3" />
      <path d="M 45 697 L 45 550.5 A 337.5 337.5 0 0 1 705 550.5 L 705 697" fill="none" stroke="#f7f0e0" strokeWidth="3.5" />
      <path d="M 312.5 621.25 A 62.5 62.5 0 0 1 437.5 621.25" fill="none" stroke="#f2e9d5" strokeWidth="2.5" />
      <line x1="330" y1="640" x2="420" y2="640" stroke="#3a3f4a" strokeWidth="5" />
      <circle cx="375" cy="621.25" r="11.25" fill="none" stroke="#e8762c" strokeWidth="3" />

      {/* šutevi */}
      {shots.filter((s) => s.made).map((s, i) => {
        const { cx, cy } = toSvg(s.x, s.y)
        return <circle key={`m${i}`} cx={cx} cy={cy} r="7.5" fill="rgba(47,191,113,.85)" stroke="#0c1830" strokeWidth="1.5" />
      })}
      {shots.filter((s) => !s.made).map((s, i) => {
        const { cx, cy } = toSvg(s.x, s.y)
        return (
          <g key={`x${i}`} transform={`translate(${cx},${cy})`} strokeLinecap="round">
            <g stroke="#ffffff" strokeWidth="6" opacity="0.9">
              <line x1="-6.5" y1="-6.5" x2="6.5" y2="6.5" />
              <line x1="-6.5" y1="6.5" x2="6.5" y2="-6.5" />
            </g>
            <g stroke="#c92f2f" strokeWidth="3">
              <line x1="-6.5" y1="-6.5" x2="6.5" y2="6.5" />
              <line x1="-6.5" y1="6.5" x2="6.5" y2="-6.5" />
            </g>
          </g>
        )
      })}

      {/* pozicija koja čeka potvrdu */}
      {pending && (() => {
        const { cx, cy } = toSvg(pending.x, pending.y)
        return (
          <g>
            <circle cx={cx} cy={cy} r="13" fill="none" stroke="#5b93f5" strokeWidth="3" style={{ animation: 'pulsedot 1s infinite' }} />
            <text x={cx} y={cy - 24} textAnchor="middle" fill="#5b93f5" style={{ font: "700 20px 'Barlow Condensed', sans-serif" }}>
              {shotValue(pending.x, pending.y)}P
            </text>
          </g>
        )
      })()}
    </svg>
  )
}
