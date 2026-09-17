// ---------------------------------------------------------------------------
// FIBA LiveStats (Genius Sports) → naš event log.
// Službeni zapisnički stol vodi utakmicu; mi njihov play-by-play pretvaramo
// u svoje evente (uživo ili naknadno). Trener dodaje samo pozicije šuteva
// koje njihov unos nema — sve ostalo stiže samo.
// ---------------------------------------------------------------------------
import { EV, TEAM, makeEvent } from './events.js'
import { COURT_W, COURT_H } from './court.js'

/** Iz zalijepljenog linka ili broja izvuče ID utakmice. */
export function parseFibaId(input) {
  const m = String(input || '').match(/(\d{4,12})/g)
  return m ? m[m.length - 1] : null
}

/** Koja je momčad "naša" — po imenu kluba (zadano: dinamo). */
export function pickOurTno(data, clubHint = 'dinamo') {
  const hint = clubHint.toLowerCase()
  for (const tno of ['1', '2']) {
    const n = `${data.tm?.[tno]?.name || ''} ${data.tm?.[tno]?.shortName || ''}`.toLowerCase()
    if (n.includes(hint)) return Number(tno)
  }
  return 1
}

const gtSecs = (gt) => {
  const m = String(gt || '').match(/(\d+):(\d+)/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * Njihove koordinate (x 0-100 po DUŽINI cijelog terena, y 0-100 po širini)
 * → naše normalizirane (x po širini, y od osnovne crte, pola terena).
 */
export function fibaShotToNorm(sx, sy) {
  let x = sx
  let y = sy
  if (x > 50) { x = 100 - x; y = 100 - y } // zrcali u lijevu polovicu
  return {
    x: y / 100,                              // širina
    y: (x / 50) * (14 / COURT_H),            // 50 jedinica = 14 m od osnovne
  }
}

const sortKey = (a) => {
  const secs = gtSecs(a.gt)
  // period → vrijeme (silazni sat) → actionNumber. "Početak četvrtine" ide
  // PRIJE svega u istoj sekundi (feed zna zamjene na pauzi numerirati ranije).
  const first = a.actionType === 'period' && a.subType === 'start' ? 0 : 1000
  return a.period * 1e9 + (3600 - (secs ?? 0)) * 1e4 + first + Math.min(a.actionNumber || 0, 8999)
}

/**
 * Pretvori FIBA data.json u naš objekt utakmice.
 * @param opts { fibaId, ourTno, clubHint, pos: {actionNumber: {x,y}}, prev }
 */
export function convertFiba(data, opts = {}) {
  const ourTno = opts.ourTno || pickOurTno(data, opts.clubHint)
  const oppTno = ourTno === 1 ? 2 : 1
  const tmUs = data.tm[String(ourTno)]
  const tmOpp = data.tm[String(oppTno)]
  const periodLen = data.periodLengthREGULAR || data.periodLength || 10

  // roster iz njihovog popisa; id stabilan preko pno
  const pid = (pno) => `f${pno}`
  const roster = Object.entries(tmUs.pl || {}).map(([pno, p]) => ({
    id: pid(pno),
    number: String(p.shirtNumber || ''),
    name: `${p.firstName || ''} ${p.familyName || ''}`.trim() || p.name || `#${p.shirtNumber}`,
  }))
  const starters = Object.entries(tmUs.pl || {})
    .filter(([, p]) => p.starter === 1)
    .map(([pno]) => pid(pno))

  // koordinate šuteva po actionNumber (naš teren) + trenerove dopune
  const shotPos = {}
  for (const s of [...(tmUs.shot || []), ...(tmOpp.shot || [])]) {
    if (s.actionNumber != null && s.x != null) shotPos[s.actionNumber] = fibaShotToNorm(s.x, s.y)
  }
  Object.assign(shotPos, opts.pos || {})

  const actions = [...(data.pbp || [])]
    .filter((a) => a.periodType === 'REGULAR' || a.periodType === 'OVERTIME' || !a.periodType)
    .sort((a, b) => sortKey(a) - sortKey(b))

  const events = []
  const ev = (type, a, over = {}) => events.push(makeEvent({
    type,
    team: a.tno === oppTno ? TEAM.OPP : TEAM.US,
    playerId: a.tno === ourTno && a.pno ? pid(a.pno) : null,
    period: a.period,
    clock: gtSecs(a.gt),
    group: `fa${a.actionNumber}`,
    ...over,
  }))

  events.push(makeEvent({
    type: EV.LINEUP, period: 1, clock: periodLen * 60, payload: { playerIds: starters.slice(0, 5) },
  }))

  // Zamjene stižu kao zasebni "out"/"in" (i po više odjednom, redoslijed
  // nije zajamčen) — uparuju se simetričnim redovima; identitet para nije
  // bitan, bitno je da skup na parketu bude točan.
  const outQ = []
  const inQ = []

  for (const a of actions) {
    const isUs = a.tno === ourTno
    switch (a.actionType) {
      case 'period':
        if (a.subType === 'start') {
          if (a.period > 1) ev(EV.PERIOD_START, a, { team: TEAM.US, playerId: null, payload: { period: a.period } })
        } else if (a.subType === 'end') {
          ev(EV.PERIOD_END, a, { team: TEAM.US, playerId: null, payload: { period: a.period } })
        }
        break
      case '2pt':
      case '3pt': {
        const value = a.actionType === '3pt' ? 3 : 2
        const p = shotPos[a.actionNumber] || {}
        ev(EV.SHOT, a, { payload: { made: a.success === 1, value, x: p.x ?? null, y: p.y ?? null } })
        break
      }
      case 'freethrow':
        ev(EV.SHOT, a, { payload: { made: a.success === 1, value: 1, x: null, y: null } })
        break
      case 'rebound':
        ev(EV.REBOUND, a, { payload: { off: a.subType === 'offensive' } })
        break
      case 'assist': if (isUs) ev(EV.ASSIST, a); break
      case 'steal': ev(EV.STEAL, a); break
      case 'block': if (isUs) ev(EV.BLOCK, a); break
      case 'turnover': ev(EV.TURNOVER, a); break
      case 'foul':
        ev(EV.FOUL, a, { payload: { kind: a.subType || 'personal' } })
        break
      case 'foulon': if (isUs) ev(EV.FOUL_DRAWN, a); break
      case 'timeout': ev(EV.TIMEOUT, a, { playerId: null }); break
      case 'substitution': {
        if (!isUs) break
        if (a.subType === 'out') {
          if (inQ.length) {
            const inn = inQ.shift()
            ev(EV.SUB, inn.a, { playerId: null, payload: { outId: pid(a.pno), inId: inn.id } })
          } else {
            outQ.push({ id: pid(a.pno), a })
          }
        } else if (a.subType === 'in') {
          if (outQ.length) {
            const out = outQ.shift()
            ev(EV.SUB, a, { playerId: null, payload: { outId: out.id, inId: pid(a.pno) } })
          } else {
            inQ.push({ id: pid(a.pno), a })
          }
        }
        break
      }
      default: break
    }
  }

  const posQueue = events
    .filter((e) => e.type === EV.SHOT && e.team === TEAM.US && e.value > 1 && e.x == null)
    .map((e) => ({ actionNumber: Number(String(e.group).slice(2)), playerId: e.playerId, value: e.value, made: e.made, period: e.period, clock: e.clock }))

  const finished = data.clock === '00:00' && data.period >= (data.periodsMax || 4) && !data.inOT

  return {
    id: `fiba-${opts.fibaId}`,
    fibaId: opts.fibaId,
    fibaTeam: ourTno,
    fibaPos: opts.pos || {},
    fibaFinished: finished,
    posQueue,
    homeName: data.tm['1'].name,
    awayName: data.tm['2'].name,
    weAreHome: ourTno === 1,
    date: opts.date || new Date().toISOString().slice(0, 10),
    competition: opts.competition || 'Službena utakmica (FIBA)',
    quarterLength: periodLen,
    quarterCount: data.periodsMax || 4,
    trackTime: true,
    trackOpponentShots: true,
    roster,
    starters: starters.slice(0, 5),
    events,
    clock: {
      period: data.period || 1,
      secs: gtSecs(data.clock) ?? periodLen * 60,
      running: false,
      startedAt: null,
    },
    createdAt: opts.createdAt || Date.now(),
    status: finished ? 'finished' : 'live',
    source: 'fiba',
  }
}
