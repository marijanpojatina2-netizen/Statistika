import React from 'react'

/** Kompaktni gumb igrača za mobilni raspored — broj, poeni, prekršaji. */
export default function PlayerChip({ row, selected, bench, trackTime, onClick }) {
  const pf = row.pf
  const cls = [
    'pchip',
    bench ? 'bench' : '',
    selected ? 'sel' : '',
    pf >= 5 ? 'foul5' : pf === 4 ? 'foul4' : '',
  ].filter(Boolean).join(' ')

  return (
    <button className={cls} onClick={onClick}>
      <span className="n">{row.player.number}</span>
      <span className="nm-s">{row.player.name}</span>
      {bench ? (
        <span className="f">{row.pts}p · {pf} PF</span>
      ) : (
        <>
          <span className="p">{row.pts} p</span>
          <span className="f">{pf} PF · {trackTime ? `${row.min}′` : `${row.periods}Č`}</span>
        </>
      )}
    </button>
  )
}
