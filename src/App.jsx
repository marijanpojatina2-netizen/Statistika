import React, { useState } from 'react'
import { GameProvider, useGame } from './state/GameContext.jsx'
import SetupScreen from './screens/SetupScreen.jsx'
import GameScreen from './screens/GameScreen.jsx'

function Shell() {
  const { game, setGame, resetGame } = useGame()
  const [menu, setMenu] = useState(false)

  if (!game) return <SetupScreen onStart={(g) => setGame(g)} />

  if (menu) {
    return (
      <div className="setup">
        <h1 style={{ margin: 0, color: 'var(--blue)' }}>Izbornik</h1>
        <div className="panel" style={{ padding: 12 }}>
          <div className="muted">{game.homeName} – {game.awayName} · {game.date} {game.competition && `· ${game.competition}`}</div>
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
