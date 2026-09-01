// ---------------------------------------------------------------------------
// Izvoz podataka. CSV koristi točku-zarez i BOM jer hrvatski Excel tako
// otvara datoteku bez ručnog uvoza.
// ---------------------------------------------------------------------------
import { EV, TEAM, describeEvent } from './events.js'
import { fmtClock } from './derive.js'
import { shotZone, ZONES } from './court.js'

const SEP = ';'
const BOM = '﻿'

const cell = (v) => {
  if (v == null) return ''
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows) => BOM + rows.map((r) => r.map(cell).join(SEP)).join('\r\n')

const pctCell = (v) => (v == null ? '' : v.toFixed(1).replace('.', ','))
const numCell = (v, d = 2) => (v == null ? '' : v.toFixed(d).replace('.', ','))

export function slug(s) {
  return (s || 'utakmica')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').toLowerCase()
}

export const gameFileBase = (game) =>
  `${slug(game.homeName)}-${slug(game.awayName)}-${game.date}`

export function boxScoreCsv(game, stats) {
  const head = [
    'Broj', 'Igrač', game.trackTime ? 'MIN' : 'Četvrtine', 'PTS',
    '2P pog', '2P šut', '3P pog', '3P šut', 'SB pog', 'SB šut', 'FG%', '3P%', 'SB%',
    'OR', 'DR', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', 'IZB', '+/-', 'EFF',
  ]
  const line = (r, label, number) => ([
    number, label, game.trackTime ? r.min : r.periods, r.pts,
    r.fg2m, r.fg2a, r.fg3m, r.fg3a, r.ftm, r.fta, pctCell(r.fgPct), pctCell(r.fg3Pct), pctCell(r.ftPct),
    r.oreb, r.dreb, r.reb, r.ast, r.stl, r.blk, r.tov, r.pf, r.fd, r.plusMinus, r.eff,
  ])
  const rows = [
    [`${game.homeName} - ${game.awayName}`, game.date, game.competition || ''],
    [`Rezultat`, stats.score.us, stats.score.opp],
    [],
    head,
    ...stats.players.map((r) => line(r, r.player.name, r.player.number)),
    line(stats.teamTotals, 'UKUPNO', ''),
  ]
  return toCsv(rows)
}

export function playByPlayCsv(game) {
  const byId = Object.fromEntries(game.roster.map((p) => [p.id, p]))
  const counters = {}
  const rows = [[
    'Redni', 'Četvrtina', 'Vrijeme', 'Ekipa', 'Broj', 'Igrač', 'Opis',
    'Poeni', 'Zona', 'X', 'Y',
  ]]
  for (const ev of game.events) {
    counters[ev.period] = (counters[ev.period] || 0) + 1
    const p = ev.playerId ? byId[ev.playerId] : null
    rows.push([
      counters[ev.period],
      ev.period,
      game.trackTime && ev.clock != null ? fmtClock(ev.clock) : '',
      ev.team === TEAM.OPP ? game.awayName : game.homeName,
      p?.number || '',
      p?.name || '',
      describeEvent(ev, byId, game),
      ev.type === EV.SHOT && ev.made ? ev.value : '',
      ev.type === EV.SHOT && ev.x != null
        ? (ZONES.find((z) => z.key === shotZone(ev.x, ev.y))?.label || '')
        : '',
      ev.x != null ? numCell(ev.x, 4) : '',
      ev.y != null ? numCell(ev.y, 4) : '',
    ])
  }
  return toCsv(rows)
}

export function seasonCsv(rows, trackTime) {
  const head = [
    'Broj', 'Igrač', 'Utakmice', trackTime ? 'MIN/ut' : 'Č/ut', 'PTS/ut',
    'REB/ut', 'AST/ut', 'STL/ut', 'BLK/ut', 'TO/ut', 'PF/ut',
    'FG%', '3P%', 'SB%', 'EFF/ut',
  ]
  return toCsv([head, ...rows.map((r) => ([
    r.number, r.name, r.games, numCell(trackTime ? r.avg.min : r.avg.periods, 1),
    numCell(r.avg.pts, 1), numCell(r.avg.reb, 1), numCell(r.avg.ast, 1),
    numCell(r.avg.stl, 1), numCell(r.avg.blk, 1), numCell(r.avg.tov, 1),
    numCell(r.avg.pf, 1), pctCell(r.fgPct), pctCell(r.fg3Pct), pctCell(r.ftPct),
    numCell(r.avg.eff, 1),
  ]))])
}

// --- tekstualni sažetak za WhatsApp ----------------------------------------

const hrDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('hr-HR')
}
const pct = (m, a) => (a ? `${Math.round((m / a) * 100)}%` : '–')

export function shareText(game, stats) {
  const usName = game.weAreHome ? game.homeName : game.awayName
  const oppName = game.weAreHome ? game.awayName : game.homeName
  const periods = Object.keys(stats.byPeriod).map(Number).sort((a, b) => a - b)
  const quarters = periods
    .map((p) => `${stats.byPeriod[p].us}:${stats.byPeriod[p].opp}`)
    .join(', ')

  const top = [...stats.players]
    .filter((r) => r.pts || r.reb || r.ast || r.eff)
    .sort((a, b) => b.eff - a.eff || b.pts - a.pts)
    .slice(0, 3)
    .map((r, i) => {
      const bits = [`${r.pts} poena`]
      if (r.reb) bits.push(`${r.reb} sk.`)
      if (r.ast) bits.push(`${r.ast} as.`)
      if (r.stl) bits.push(`${r.stl} ukr.`)
      return `${i + 1}. #${r.player.number} ${r.player.name} — ${bits.join(', ')}`
    })

  const t = stats.teamTotals
  const lines = [
    `🏀 ${usName} ${stats.score.us} : ${stats.score.opp} ${oppName}`,
    `${game.competition ? `${game.competition} · ` : ''}${hrDate(game.date)}`,
  ]
  if (quarters) lines.push(`Po četvrtinama: ${quarters}`)
  if (top.length) lines.push('', 'Najbolji:', ...top)
  lines.push(
    '',
    `Ekipa: 2P ${pct(t.fg2m, t.fg2a)} (${t.fg2m}-${t.fg2a}) · 3P ${pct(t.fg3m, t.fg3a)} (${t.fg3m}-${t.fg3a}) · SB ${pct(t.ftm, t.fta)} (${t.ftm}-${t.fta})`,
    `Skokovi ${t.reb} (${t.oreb} nap.) · Asistencije ${t.ast} · Izgubljene ${t.tov}`,
  )
  if (stats.largestLead.us || stats.largestLead.opp) {
    lines.push(`Najveće vodstvo: +${stats.largestLead.us} / -${stats.largestLead.opp}`)
  }
  return lines.join('\n')
}

// --- preuzimanje datoteka ---------------------------------------------------

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const downloadCsv = (text, filename) =>
  downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), filename)
