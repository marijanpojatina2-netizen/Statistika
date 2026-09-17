import React from 'react'
import { fmtClock } from '../model/derive.js'

/**
 * Desni stupac u FIBA live načinu: unosi stižu sa službenog zapisnika,
 * trener samo dodaje pozicije šuteva koje zapisnik nije unio.
 */
export default function FibaPanel({ game, sync, label }) {
  const queue = game.posQueue || []
  const ago = sync?.at ? Math.max(0, Math.round((Date.now() - sync.at) / 1000)) : null
  return (
    <div className="fiba-panel">
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span className={`fiba-dot ${sync?.err ? 'err' : ''}`} />
        <div className="section-title" style={{ margin: 0 }}>FIBA LIVE · službeni zapisnik</div>
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        {game.homeName} — {game.awayName}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
        {sync?.err
          ? 'Nema veze — pokušavam ponovno…'
          : `osvježava se samo (svakih 15 s${ago != null ? `, zadnje prije ${ago} s` : ''})`}
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>
        Šutevi bez pozicije · {queue.length}
      </div>
      {queue.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Sve pozicije su upisane. Kad zapisnik unese šut bez pozicije,
          pojavit će se ovdje — tapni teren da je dodaš.
        </div>
      ) : (
        <div className="col" style={{ gap: 6, marginTop: 8 }}>
          {queue.slice(0, 8).map((q, i) => (
            <div className={`fiba-q ${i === 0 ? 'first' : ''}`} key={q.actionNumber}>
              <b>{label(q.playerId)}</b>
              <span>{q.value}P {q.made ? '✓' : '✗'}</span>
              <span className="muted">{q.period}Č {q.clock != null ? fmtClock(q.clock) : ''}</span>
              {i === 0 && <span className="tag">tapni teren →</span>}
            </div>
          ))}
        </div>
      )}

      <div className="muted" style={{ fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
        Koševi, promašaji, skokovi, asistencije, prekršaji, zamjene i minutaža
        stižu automatski. Ručni unos je isključen da ne bude dvostrukih upisa.
        Kad utakmica završi: izbornik ☰ → Završi i spremi u arhivu.
      </div>
    </div>
  )
}
