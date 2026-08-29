import React, { useState } from 'react'
import { GameProvider, useGame } from './state/GameContext.jsx'
import SetupScreen from './screens/SetupScreen.jsx'
import GameScreen from './screens/GameScreen.jsx'
import ArchiveScreen from './screens/ArchiveScreen.jsx'
import useFullscreen from './hooks/useFullscreen.js'
import {
  boxScoreCsv, playByPlayCsv, shareText, downloadCsv, gameFileBase,
} from './model/exportCsv.js'

const hrDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('hr-HR')
}

function Shell() {
  const {
    game, setGame, resetGame, setTrackTime, stats,
    archive, templates, finishGame, deleteArchived, saveTemplate, deleteTemplate,
  } = useGame()
  const [view, setView] = useState('game')      // game | menu | archive
  const [share, setShare] = useState(null)
  const [copied, setCopied] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const fullscreen = useFullscreen()

  /** Sustavni dijalog za dijeljenje ako postoji, inače tekst za ručno kopiranje. */
  const doShare = async (text) => {
    setCopied(false)
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch { /* korisnik odustao ili nije podržano */ }
    }
    setShare(text)
    try { await navigator.clipboard.writeText(text); setCopied(true) } catch { /* bez dopuštenja */ }
  }

  const sharePanel = share && (
    <div className="panel" style={{ padding: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="section-title">Sažetak za WhatsApp {copied && '— kopiran u međuspremnik'}</div>
        <button className="btn sm ghost" onClick={() => setShare(null)}>Zatvori</button>
      </div>
      <textarea
        readOnly
        value={share}
        onFocus={(e) => e.target.select()}
        style={{
          width: '100%', minHeight: 200, marginTop: 8, padding: 10,
          background: 'var(--bg-2)', color: 'var(--text)',
          border: '1px solid var(--line-strong)', borderRadius: 10, fontSize: 14,
        }}
      />
      <button
        className="btn wide"
        style={{ marginTop: 8 }}
        onClick={async () => {
          try { await navigator.clipboard.writeText(share); setCopied(true) } catch { setCopied(false) }
        }}
      >
        Kopiraj tekst
      </button>
    </div>
  )

  const go = (v) => { setShare(null); setView(v) }

  if (view === 'archive') {
    return (
      <div className="app">
        <ArchiveScreen
          archive={archive}
          onDelete={deleteArchived}
          onShare={doShare}
          sharePanel={sharePanel}
          onClose={() => go(game ? 'menu' : 'game')}
        />
      </div>
    )
  }

  if (!game) {
    return (
      <div className="app">
        {/* .app ne skrola — postavljanje mora imati vlastiti spremnik za skrolanje */}
        <div className="scroll-page">
        <SetupScreen
          onStart={(g) => { setGame(g); go('game') }}
          templates={templates}
          onSaveTemplate={saveTemplate}
          onDeleteTemplate={deleteTemplate}
          onOpenArchive={() => go('archive')}
          archiveCount={archive.length}
        />
        </div>
      </div>
    )
  }

  if (view === 'menu') {
    const base = gameFileBase(game)
    return (
      <div className="app">
        <div className="scroll-page">
        <div className="setup">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h1 style={{ margin: 0, color: 'var(--blue-hi)' }}>Izbornik</h1>
            <button className="btn primary" onClick={() => go('game')}>← Utakmica</button>
          </div>

          <div className="panel" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800 }}>
              {game.homeName} {stats.score.us} : {stats.score.opp} {game.awayName}
            </div>
            <div className="muted" style={{ fontSize: 14 }}>
              {hrDate(game.date)}{game.competition && ` · ${game.competition}`} · {game.roster.length} igrača · {game.events.length} unosa
            </div>
          </div>

          <div className="panel" style={{ padding: 12 }}>
            <div className="section-title">Podijeli i izvezi</div>
            <div className="grid2" style={{ marginTop: 8 }}>
              <button className="btn primary" onClick={() => doShare(shareText(game, stats))}>Podijeli sažetak</button>
              <button className="btn" onClick={() => downloadCsv(boxScoreCsv(game, stats), `${base}-box.csv`)}>CSV box score</button>
              <button className="btn" onClick={() => downloadCsv(playByPlayCsv(game), `${base}-play-by-play.csv`)}>CSV play-by-play</button>
              <button className="btn" onClick={() => go('archive')}>Arhiva i sezona ({archive.length})</button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Shot chart se sprema kao PNG iz kartice Statistika → Shot chart.
            </div>
          </div>

          {sharePanel}

          {fullscreen.supported && (
            <div className="panel" style={{ padding: 12 }}>
              <div className="section-title">Prikaz</div>
              <button className="btn wide" style={{ marginTop: 8 }} onClick={fullscreen.toggle}>
                {fullscreen.active ? 'Izađi iz punog ekrana' : 'Preko cijelog ekrana'}
              </button>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Sakriva adresnu traku i sistemsku navigaciju. Ako aplikaciju dodaš na
                početni zaslon, pokreće se preko cijelog ekrana i bez ovoga.
              </div>
            </div>
          )}

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

          {confirmFinish ? (
            <div className="panel" style={{ padding: 12, borderColor: 'var(--green-line)' }}>
              <div style={{ fontWeight: 700 }}>Završiti utakmicu i spremiti je u arhivu?</div>
              <div className="muted" style={{ fontSize: 13, margin: '6px 0 10px' }}>
                Utakmica ostaje sačuvana sa svim unosima i ulazi u sezonske prosjeke.
                Nakon toga se otvara postavljanje nove utakmice.
              </div>
              <div className="row">
                <button className="btn good grow" onClick={() => { finishGame(); setConfirmFinish(false); go('game') }}>
                  Da, završi i spremi
                </button>
                <button className="btn ghost" onClick={() => setConfirmFinish(false)}>Odustani</button>
              </div>
            </div>
          ) : (
            <button className="btn good lg wide" onClick={() => setConfirmFinish(true)}>
              Završi utakmicu i spremi u arhivu
            </button>
          )}

          <button
            className="btn bad wide"
            onClick={() => {
              if (confirm('Odbaciti trenutnu utakmicu BEZ spremanja u arhivu? Svi unosi se gube.')) {
                resetGame()
                go('game')
              }
            }}
          >
            Odbaci utakmicu bez spremanja
          </button>
        </div>
        </div>
      </div>
    )
  }

  return <GameScreen onExit={() => setView('menu')} />
}

export default function App() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  )
}
