import React from 'react'

/**
 * Kartica igrača u petorci ili na klupi.
 * Nosi `data-pid` / `data-zone` jer drag & drop zamjena traži cilj ispod prsta.
 */
export default function PlayerCard({ row, bench, selected, drag, trackTime, onTap, onPointerDown, onTouchStart }) {
  const out5 = row.pf >= 5
  const isDragged = drag && drag.id === row.player.id
  const isTarget = drag && drag.fromBench !== bench
  const isOver = drag && drag.overId === row.player.id

  const cls = [
    'pcard',
    bench ? 'bench' : '',
    isOver ? 'over' : '',
    out5 ? 'out5' : row.pf === 4 ? 'warn4' : '',
    selected && !isOver ? 'sel' : '',
    isTarget && !isOver ? 'target' : '',
    isDragged ? 'dragging' : '',
  ].filter(Boolean).join(' ')

  const time = trackTime ? `${row.min}′` : `${row.periods} Č`
  const sub = out5 ? `${row.pf} PF — ISKLJUČEN` : `${row.pf} PF · ${time}`

  return (
    <button
      className={cls}
      data-pid={row.player.id}
      data-zone={bench ? 'bench' : 'on'}
      onClick={onTap}
      onPointerDown={onPointerDown}
      onTouchStart={onTouchStart}
    >
      <span className="pn">{row.player.number}</span>
      <span className="pmain">
        <span className="pname">{row.player.name}</span>
        <span className="psub">{sub}</span>
      </span>
      <span className="ppts">{row.pts}</span>
    </button>
  )
}
