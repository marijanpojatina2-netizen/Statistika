import React, { useState } from 'react'
import { GameProvider, useGame } from './state/GameContext.jsx'
import SetupScreen from './screens/SetupScreen.jsx'
import GameScreen from './screens/GameScreen.jsx'

function Shell() {
  const { game, setGame, resetGame, setTrackTime } = useGame()
  const [menu, setMenu] = useState(false)

  if (!game) return <SetupScreen onStart={(g) => setGame(g)} />

  if (menu) {
    return (
      <div className="scroll-page">
        <div className="setup">
          <h1 style={{ margin: 0, color: 'var(--blue-hi)' }}>Izbornik</h1>

          <div className="panel" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800 }}>{game.homeName} – {game.awayName}</div>
            <div className="muted" style={{ fontSize: 14 }}>
              {game.date}{game.competition && ` · ${game.competition}`} · {game.roster.length} igrača
            </div>
          </div>

          <div className="panel" style={{ padding: 12 }}>
            <div className="section-title">Vodi vrijeme</div>
            <div className="switch" style={{ marginTop: 6 }}>
              <button className={game.trackTime ? 'on' : ''} onClick={() => setTrackTime(true)}>DA — tajmer</button>
              <button className={!game.trackTime ? 'on' : ''} onClick={() => setTrackTime(false)}>NE — po četvrtinama</button>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Bez vremena se minutaža vodi kao broj odigranih četvrtina po igraču.
            </div>
          </div>

          <button className="btn primary lg wide" onClick={() => setMenu(false)}>← Natrag na utakmicu</button>
          <button
            className="btn bad lg wide"
            onClick={() => {
              if (confirm('Obrisati trenutnu utakmicu i započeti novu? Podaci se gube.')) resetGame()
            }}
          >
            Nova utakmica (briše trenutnu)
          </button>
        </div>
      </div>
    )
  }

  return <GameScreen onExit={() => setMenu(true)} />
}

export default function App() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  )
}
