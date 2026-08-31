// ---------------------------------------------------------------------------
// Izvještaj utakmice kao slika (PNG 1080x1350) — za WhatsApp/objave.
// Tekst se crta canvasom (koristi učitane Barlow fontove), teren se
// rasterizira iz istog SVG-a koji koristi i aplikacija.
// ---------------------------------------------------------------------------
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Court from '../components/Court.jsx'
import { positionedShots } from '../components/ShotChart.jsx'
import { runsOf, leadInfo } from './report.js'
import { gameFileBase } from './exportCsv.js'

const W = 1080
const H = 1350

const COL = {
  bg: '#0a111f', panel: '#101a2c', line: 'rgba(146,170,212,.16)',
  text: '#e8edf6', text2: '#c6d1e4', muted: '#8fa2c0', muted2: '#71829f',
  blue: '#4a84ee', blueHi: '#5b93f5', red: '#e05c5c', green: '#2fbf71', gold: '#d9a441',
}
const FC = '"Barlow Condensed", sans-serif'
const FU = '"Barlow", sans-serif'

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = src
})

const ellipsize = (ctx, text, max) => {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 2 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

const hrDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? (iso || '') : d.toLocaleDateString('hr-HR')
}

/** Nacrta izvještaj i vrati PNG blob. */
export async function reportPng(game, stats) {
  try {
    await Promise.all([
      document.fonts.load(`700 96px ${FC}`), document.fonts.load(`700 40px ${FC}`),
      document.fonts.load(`600 26px ${FU}`), document.fonts.load(`500 22px ${FU}`),
    ])
  } catch { /* fallback fontovi */ }

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // podloga
  ctx.fillStyle = COL.bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, -100, 80, W / 2, -100, 900)
  glow.addColorStop(0, 'rgba(47,111,224,.20)')
  glow.addColorStop(1, 'rgba(47,111,224,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, 700)
  const accent = ctx.createLinearGradient(0, 0, W, 0)
  accent.addColorStop(0, 'rgba(47,111,224,0)')
  accent.addColorStop(0.5, COL.blueHi)
  accent.addColorStop(1, 'rgba(47,111,224,0)')
  ctx.fillStyle = accent
  ctx.fillRect(120, 0, W - 240, 4)

  const usName = game.weAreHome ? game.homeName : game.awayName
  const oppName = game.weAreHome ? game.awayName : game.homeName

  // zaglavlje
  const crest = await loadImage(`${import.meta.env.BASE_URL}crest.jpg`)
  if (crest) {
    const cw = 170; const ch = 96; const cx = 60; const cy = 44
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(cx, cy, cw, ch, 14)
    ctx.clip()
    ctx.drawImage(crest, cx, cy, cw, ch)
    ctx.restore()
    ctx.strokeStyle = COL.line
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 14); ctx.stroke()
  }
  ctx.textAlign = 'right'
  ctx.fillStyle = COL.muted
  ctx.font = `600 24px ${FU}`
  ctx.fillText(`${game.competition ? `${game.competition} · ` : ''}${hrDate(game.date)}`, W - 60, 76)
  if (game.coach) { ctx.font = `500 21px ${FU}`; ctx.fillStyle = COL.muted2; ctx.fillText(`zapisao: ${game.coach}`, W - 60, 108) }

  // veliki rezultat
  ctx.textAlign = 'center'
  ctx.fillStyle = COL.text
  ctx.font = `700 120px ${FC}`
  ctx.fillText(`${stats.score.us} : ${stats.score.opp}`, W / 2, 268)
  ctx.font = `700 42px ${FC}`
  const nmW = 430
  ctx.textAlign = 'right'
  ctx.fillText(ellipsize(ctx, (usName || '').toUpperCase(), nmW), W / 2 - 120, 330)
  ctx.textAlign = 'left'
  ctx.fillStyle = COL.text2
  ctx.fillText(ellipsize(ctx, (oppName || '').toUpperCase(), nmW), W / 2 + 120, 330)
  ctx.textAlign = 'center'
  ctx.fillStyle = COL.muted2
  ctx.font = `600 24px ${FC}`
  ctx.fillText('—', W / 2, 328)

  // četvrtine
  const periods = Object.keys(stats.byPeriod).map(Number)
  const maxQ = Math.max(game.quarterCount || 4, ...periods, 1)
  const qs = Array.from({ length: maxQ }, (_, i) => i + 1)
  const tw = Math.min(720, 140 + qs.length * 90)
  const tx = (W - tw) / 2
  let ty = 380
  ctx.font = `600 22px ${FU}`
  const colW = (tw - 140) / (qs.length + 1)
  const cellX = (i) => tx + 140 + colW * i + colW / 2
  ctx.fillStyle = COL.muted2
  ctx.textAlign = 'center'
  qs.forEach((q, i) => ctx.fillText(`${q}Č`, cellX(i), ty))
  ctx.fillText('UK', cellX(qs.length), ty)
  const qRow = (name, key, total, bold) => {
    ty += 42
    ctx.textAlign = 'left'
    ctx.fillStyle = bold ? COL.text : COL.text2
    ctx.font = `700 26px ${FC}`
    ctx.fillText(ellipsize(ctx, name, 130), tx, ty)
    ctx.textAlign = 'center'
    ctx.font = `${bold ? 700 : 600} 26px ${FU}`
    qs.forEach((q, i) => ctx.fillText(String(stats.byPeriod[q]?.[key] || 0), cellX(i), ty))
    ctx.font = `700 26px ${FU}`
    ctx.fillText(String(total), cellX(qs.length), ty)
  }
  qRow(usName, 'us', stats.score.us, true)
  qRow(oppName, 'opp', stats.score.opp, false)

  // panel lijevo: najbolji pojedinci
  const py = 540
  const panel = (x, y, w, h, title) => {
    ctx.fillStyle = COL.panel
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill()
    ctx.strokeStyle = COL.line; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.stroke()
    ctx.textAlign = 'left'
    ctx.fillStyle = COL.muted
    ctx.font = `700 24px ${FC}`
    ctx.fillText(title.toUpperCase(), x + 26, y + 44)
  }

  panel(60, py, 480, 470, 'Najbolji pojedinci')
  const played = stats.players.filter((r) => r.secs > 0 || r.periods > 0 || r.pts > 0 || r.eff !== 0)
  const top = [...played].sort((a, b) => b.eff - a.eff).slice(0, 5)
  top.forEach((r, i) => {
    const y = py + 100 + i * 72
    ctx.fillStyle = COL.blueHi
    ctx.font = `700 30px ${FC}`
    ctx.textAlign = 'left'
    ctx.fillText(`#${r.player.number}`, 86, y)
    ctx.fillStyle = COL.text
    ctx.font = `700 29px ${FC}`
    ctx.fillText(ellipsize(ctx, r.player.name, 250), 150, y)
    ctx.fillStyle = COL.muted
    ctx.font = `500 21px ${FU}`
    ctx.fillText(`${r.pts} poena · ${r.reb} sk · ${r.ast} as`, 150, y + 28)
    ctx.textAlign = 'right'
    ctx.fillStyle = COL.green
    ctx.font = `700 30px ${FC}`
    ctx.fillText(String(r.eff), 512, y + 6)
    ctx.fillStyle = COL.muted2
    ctx.font = `500 15px ${FU}`
    ctx.fillText('EFF', 512, y + 26)
  })

  // panel desno: teren sa šutevima (ili zone bez pozicija)
  panel(560, py, 460, 470, 'Naši šutevi')
  const shots = positionedShots(game)
  if (shots.length > 0) {
    const svgStr = renderToStaticMarkup(
      React.createElement(Court, { shots, interactive: false }),
    ).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="750" height="700"')
    const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }))
    const img = await loadImage(url)
    URL.revokeObjectURL(url)
    if (img) ctx.drawImage(img, 590, py + 66, 400, 373)
    const made = shots.filter((s) => s.made).length
    ctx.textAlign = 'right'
    ctx.fillStyle = COL.muted
    ctx.font = `600 22px ${FU}`
    ctx.fillText(`${made}/${shots.length} (${Math.round((made / shots.length) * 100)}%)`, 996, py + 44)
  } else {
    ctx.textAlign = 'left'
    ctx.fillStyle = COL.muted
    ctx.font = `500 22px ${FU}`
    const t = stats.teamTotals
    const lines = [
      `2P: ${t.fg2m}-${t.fg2a}`, `3P: ${t.fg3m}-${t.fg3a}`, `Slobodna: ${t.ftm}-${t.fta}`,
      `Skokovi: ${t.reb}`, `Asistencije: ${t.ast}`,
    ]
    lines.forEach((l, i) => ctx.fillText(l, 600, py + 110 + i * 48))
  }

  // dno: serije i vodstvo
  const by = py + 500
  panel(60, by, 960, 190, 'Tijek')
  const lead = leadInfo(game)
  const runs = runsOf(game, 6)
  ctx.textAlign = 'left'
  ctx.font = `600 25px ${FU}`
  let ly = by + 92
  const runLabel = (r) => `${r.points}:0 (${r.from.period === r.to.period ? `${r.from.period}Č` : `${r.from.period}–${r.to.period}Č`})`
  const usBits = []
  if (lead.us) usBits.push(`najveće vodstvo +${lead.us.points}`)
  runs.filter((r) => r.side === 'us').slice(0, 2).forEach((r) => usBits.push(`serija ${runLabel(r)}`))
  const oppBits = []
  if (lead.opp) oppBits.push(`najveće vodstvo +${lead.opp.points}`)
  runs.filter((r) => r.side === 'opp').slice(0, 2).forEach((r) => oppBits.push(`serija ${runLabel(r)}`))
  ctx.fillStyle = COL.blueHi
  ctx.font = `700 26px ${FC}`
  ctx.fillText(ellipsize(ctx, usName || '', 220), 86, ly)
  ctx.fillStyle = COL.text2
  ctx.font = `500 24px ${FU}`
  ctx.fillText(usBits.length ? usBits.join(' · ') : '—', 320, ly)
  ly += 56
  ctx.fillStyle = COL.red
  ctx.font = `700 26px ${FC}`
  ctx.fillText(ellipsize(ctx, oppName || '', 220), 86, ly)
  ctx.fillStyle = COL.text2
  ctx.font = `500 24px ${FU}`
  ctx.fillText(oppBits.length ? oppBits.join(' · ') : '—', 320, ly)

  // podnožje
  ctx.textAlign = 'center'
  ctx.fillStyle = COL.muted2
  ctx.font = `600 21px ${FU}`
  ctx.fillText('kkdinamo.hr/stats', W / 2, H - 36)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/** Podijeli sliku (sustavni share ako postoji), inače preuzmi datoteku. */
export async function shareReportImage(game, stats) {
  const blob = await reportPng(game, stats)
  if (!blob) throw new Error('render')
  const file = new File([blob], `${gameFileBase(game)}-izvjestaj.png`, { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared' } catch { /* odustao — preuzmi */ }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return 'downloaded'
}
