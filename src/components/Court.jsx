import React, { useRef } from 'react'
import {
  COURT_W, COURT_H, BASKET_X, BASKET_Y, R3, CORNER_INSET, CORNER_Y,
  PAINT_HALF, PAINT_LEN, FT_R, RESTRICTED_R, RIM_R, BACKBOARD_Y, BACKBOARD_HALF,
  clampToCourt, shotValue,
} from '../model/court.js'

// SVG ima ishodište gore-lijevo, a mi mjerimo od osnovne crte — pa okrećemo os y.
const sy = (yFromBaseline) => COURT_H - yFromBaseline

const ARC = `M ${CORNER_INSET} ${sy(CORNER_Y)} A ${R3} ${R3} 0 0 1 ${COURT_W - CORNER_INSET} ${sy(CORNER_Y)}`

/**
 * Dijagram polovice terena (FIBA mjere).
 * Tap na teren vraća normaliziranu poziciju preko `onPick(x, y)`.
 */
export default function Court({ shots = [], pending = null, onPick, interactive = true, style }) {
  const ref = useRef(null)

  const handle = (e) => {
    if (!interactive || !onPick || !ref.current) return
    const pt = ref.current.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = ref.current.getScreenCTM()
    if (!ctm) return
    const loc = pt.matrixTransform(ctm.inverse())
    const { x, y } = clampToCourt(loc.x / COURT_W, (COURT_H - loc.y) / COURT_H)
    onPick(x, y)
  }

  return (
    <div className="court-box" style={style}>
    <svg
      ref={ref}
      className={`court ${interactive ? 'live' : ''}`}
      viewBox={`-0.3 -0.3 ${COURT_W + 0.6} ${COURT_H + 0.6}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={handle}
    >
      <rect x="0" y="0" width={COURT_W} height={COURT_H} className="c-floor" />

      {/* reket */}
      <rect
        x={BASKET_X - PAINT_HALF} y={sy(PAINT_LEN)}
        width={PAINT_HALF * 2} height={PAINT_LEN}
        className="c-paint"
      />
      {/* krug slobodnog bacanja */}
      <circle cx={BASKET_X} cy={sy(PAINT_LEN)} r={FT_R} className="c-line" />
      {/* polukrug bez naboja */}
      <path
        d={`M ${BASKET_X - RESTRICTED_R} ${sy(BASKET_Y)} A ${RESTRICTED_R} ${RESTRICTED_R} 0 0 1 ${BASKET_X + RESTRICTED_R} ${sy(BASKET_Y)}`}
        className="c-line"
      />

      {/* linija za tri: ravni dijelovi u kutovima + luk */}
      <line x1={CORNER_INSET} y1={sy(0)} x2={CORNER_INSET} y2={sy(CORNER_Y)} className="c-line" />
      <line x1={COURT_W - CORNER_INSET} y1={sy(0)} x2={COURT_W - CORNER_INSET} y2={sy(CORNER_Y)} className="c-line" />
      <path d={ARC} className="c-line" />

      {/* obruč i ploča */}
      <line
        x1={BASKET_X - BACKBOARD_HALF} y1={sy(BACKBOARD_Y)}
        x2={BASKET_X + BACKBOARD_HALF} y2={sy(BACKBOARD_Y)}
        className="c-board"
      />
      <circle cx={BASKET_X} cy={sy(BASKET_Y)} r={RIM_R} className="c-rim" />

      {/* rub terena */}
      <rect x="0" y="0" width={COURT_W} height={COURT_H} className="c-bounds" />

      {/* šutevi */}
      {shots.map((s, i) => (s.made
        ? <circle key={i} cx={s.x * COURT_W} cy={sy(s.y * COURT_H)} r="0.3" className="s-made" />
        : (
          <g key={i} className="s-miss">
            <line
              x1={s.x * COURT_W - 0.26} y1={sy(s.y * COURT_H) - 0.26}
              x2={s.x * COURT_W + 0.26} y2={sy(s.y * COURT_H) + 0.26}
            />
            <line
              x1={s.x * COURT_W - 0.26} y1={sy(s.y * COURT_H) + 0.26}
              x2={s.x * COURT_W + 0.26} y2={sy(s.y * COURT_H) - 0.26}
            />
          </g>
        )
      ))}

      {/* pozicija koja čeka potvrdu pogodak/promašaj */}
      {pending && (
        <g>
          <circle cx={pending.x * COURT_W} cy={sy(pending.y * COURT_H)} r="0.75" className="s-pending-halo" />
          <circle cx={pending.x * COURT_W} cy={sy(pending.y * COURT_H)} r="0.34" className="s-pending" />
          <text
            x={pending.x * COURT_W}
            y={sy(pending.y * COURT_H) - 1.15}
            className="s-pending-label"
            textAnchor="middle"
          >
            {shotValue(pending.x, pending.y)}P
          </text>
        </g>
      )}
    </svg>
    </div>
  )
}
