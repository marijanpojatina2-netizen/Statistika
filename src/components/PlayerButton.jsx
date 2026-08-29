import React from 'react'

export default function PlayerButton({ row, selected, bench, onClick, showMinutes, trackTime }) {
  const pf = row.pf
  const cls = [
    'pbtn',
    bench ? 'bench' : '',
    selected ? 'sel' : '',
    pf >= 5 ? 'foul5' : pf === 4 ? 'foul4' : '',
  ].filter(Boolean).join(' ')

  return (
    <button className={cls} onClick={onClick}>
      <span className="num">{row.player.number}</span>
      <span style={{ minWidth: 0 }}>
        <span className="nm" style={{ display: 'block' }}>{row.player.name}</span>
        <span className="meta">
          {pf} PF
          {showMinutes && ' · ' + (trackTime ? `${row.min}′` : `${row.periods} Č`)}
          {row.plusMinus !== 0 && ` · ${row.plusMinus > 0 ? '+' : ''}${row.plusMinus}`}
        </span>
      </span>
      <span className="pts">{row.pts}</span>
    </button>
  )
}
