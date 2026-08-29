import React from 'react'

/**
 * Gumb igrača za popis (tablet).
 * `dense` — uža varijanta za klupu u dva stupca: poeni se sele u meta redak.
 */
export default function PlayerButton({ row, selected, bench, dense, onClick, showMinutes, trackTime }) {
  const pf = row.pf
  const cls = [
    'pbtn',
    bench ? 'bench' : '',
    dense ? 'dense' : '',
    selected ? 'sel' : '',
    pf >= 5 ? 'foul5' : pf === 4 ? 'foul4' : '',
  ].filter(Boolean).join(' ')

  const time = trackTime ? `${row.min}′` : `${row.periods}Č`

  return (
    <button className={cls} onClick={onClick}>
      <span className="num">{row.player.number}</span>
      <span style={{ minWidth: 0 }}>
        <span className="nm">{row.player.name}</span>
        <span className="meta">
          {dense ? `${row.pts}p · ${pf}PF` : (
            <>
              {pf} PF
              {showMinutes && ` · ${time}`}
              {row.plusMinus !== 0 && ` · ${row.plusMinus > 0 ? '+' : ''}${row.plusMinus}`}
            </>
          )}
        </span>
      </span>
      {!dense && <span className="pts">{row.pts}</span>}
    </button>
  )
}
