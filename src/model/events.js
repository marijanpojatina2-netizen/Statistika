// ---------------------------------------------------------------------------
// Event log — jedini izvor istine.
// Sve izvedene brojke (box score, shot chart, napredna statistika) racunaju se
// iz ovog loga. Nista se ne pohranjuje zasebno.
// ---------------------------------------------------------------------------

export const EV = {
  LINEUP: 'lineup',           // { playerIds: [] }  pocetna petorka / ispravak
  SUB: 'sub',                 // { inId, outId }
  SHOT: 'shot',               // { made, value: 1|2|3, x, y }   x,y u 0..1 (null = klasican unos)
  REBOUND: 'rebound',         // { off: bool }
  ASSIST: 'assist',
  STEAL: 'steal',
  BLOCK: 'block',
  TURNOVER: 'turnover',
  FOUL: 'foul',               // { kind: 'personal'|'offensive'|'technical'|'unsportsmanlike' }
  FOUL_DRAWN: 'foulDrawn',
  TIMEOUT: 'timeout',
  PERIOD_START: 'periodStart',
  PERIOD_END: 'periodEnd',
  DEADBALL: 'deadball',       // { reason: 'out' }  lopta van, nema skoka
}

export const TEAM = { US: 'us', OPP: 'opp' }

let counter = 0
export function newId() {
  counter += 1
  return `e${Date.now().toString(36)}${counter.toString(36)}`
}

/**
 * Kreira event. `group` povezuje lancane evente (npr. sut + asistencija) tako da
 * ih UNDO ukloni zajedno.
 */
export function makeEvent({ type, team = TEAM.US, playerId = null, payload = {}, period, clock, group = null }) {
  const id = newId()
  return {
    id,
    group: group || id,
    ts: Date.now(),
    type,
    team,
    playerId,
    period,
    clock, // sekunde preostale u cetvrtini; null u nacinu bez vremena
    ...payload,
  }
}

/** Sve evente iz posljednje grupe (za UNDO). */
export function lastGroupIndex(events) {
  if (events.length === 0) return -1
  const g = events[events.length - 1].group
  let i = events.length - 1
  while (i > 0 && events[i - 1].group === g) i -= 1
  return i
}

export function undoLast(events) {
  const i = lastGroupIndex(events)
  if (i < 0) return { events, removed: [] }
  return { events: events.slice(0, i), removed: events.slice(i) }
}

// --- Opisi za play-by-play ---------------------------------------------------

const SHOT_LABEL = { 1: 'SB', 2: '2P', 3: '3P' }

export function describeEvent(ev, playerById, game) {
  const p = ev.playerId ? playerById[ev.playerId] : null
  const who = p ? `#${p.number} ${p.name}` : (ev.team === TEAM.OPP ? (game?.awayName || 'Protivnik') : '')
  switch (ev.type) {
    case EV.SHOT:
      return `${who} — ${SHOT_LABEL[ev.value]} ${ev.made ? 'POGODAK' : 'promašaj'}`
    case EV.REBOUND:
      return `${who} — skok ${ev.off ? 'napadački' : 'obrambeni'}`
    case EV.ASSIST: return `${who} — asistencija`
    case EV.STEAL: return `${who} — ukradena lopta`
    case EV.BLOCK: return `${who} — blokada`
    case EV.TURNOVER: return `${who} — izgubljena lopta`
    case EV.FOUL: {
      const kind = { personal: 'osobna', offensive: 'napadačka', technical: 'tehnička', unsportsmanlike: 'nesportska' }[ev.kind] || 'osobna'
      return `${who} — prekršaj (${kind})`
    }
    case EV.FOUL_DRAWN: return `${who} — izborena osobna`
    case EV.TIMEOUT: return `${who || 'Mi'} — minuta odmora`
    case EV.SUB: {
      const pin = playerById[ev.inId]; const pout = playerById[ev.outId]
      return `Zamjena: ulazi #${pin?.number} ${pin?.name} / izlazi #${pout?.number} ${pout?.name}`
    }
    case EV.LINEUP: return 'Postava'
    case EV.PERIOD_START: return `Početak ${ev.period}. četvrtine`
    case EV.PERIOD_END: return `Kraj ${ev.period}. četvrtine`
    case EV.DEADBALL: return 'Lopta van'
    default: return ev.type
  }
}
