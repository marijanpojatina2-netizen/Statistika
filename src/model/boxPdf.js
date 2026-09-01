// ---------------------------------------------------------------------------
// Box score kao PDF (A4 vodoravno) — jedan klik za dijeljenje/ispis.
// Tablica se crta canvasom (Barlow fontovi, naša slova č/ć/đ), pa se slika
// zapakira u minimalan PDF bez vanjskih paketa — radi i offline.
// ---------------------------------------------------------------------------
import { gameFileBase } from './exportCsv.js'

const PT_W = 842   // A4 landscape (pt)
const PT_H = 595
const SCALE = 2
const W = PT_W * SCALE
const H = PT_H * SCALE

const COL = {
  bg: '#0a111f', panel: '#101a2c', line: 'rgba(146,170,212,.18)', zebra: 'rgba(146,170,212,.045)',
  text: '#e8edf6', text2: '#c6d1e4', muted: '#8fa2c0', muted2: '#71829f',
  blue: '#5b93f5', red: '#e88a8a', green: '#7fe0ae',
}
const FC = '"Barlow Condensed", sans-serif'
const FU = '"Barlow", sans-serif'

const pctS = (v) => (v == null ? '–' : `${Math.round(v)}%`)
const hrDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? (iso || '') : d.toLocaleDateString('hr-HR')
}

function drawBox(ctx, game, stats) {
  const usName = game.weAreHome ? game.homeName : game.awayName
  const oppName = game.weAreHome ? game.awayName : game.homeName

  ctx.fillStyle = COL.bg
  ctx.fillRect(0, 0, W, H)

  // zaglavlje
  ctx.textAlign = 'left'
  ctx.fillStyle = COL.text
  ctx.font = `700 52px ${FC}`
  ctx.fillText(`${usName}  ${stats.score.us} : ${stats.score.opp}  ${oppName}`, 60, 86)
  ctx.fillStyle = COL.muted
  ctx.font = `600 26px ${FU}`
  const periods = Object.keys(stats.byPeriod).map(Number)
  const maxQ = Math.max(game.quarterCount || 4, ...periods, 1)
  const qParts = Array.from({ length: maxQ }, (_, i) => {
    const q = stats.byPeriod[i + 1] || { us: 0, opp: 0 }
    return `${q.us}:${q.opp}`
  }).join(', ')
  ctx.fillText(`${game.competition ? `${game.competition} · ` : ''}${hrDate(game.date)} · po četvrtinama: ${qParts}${game.coach ? ` · zapisao: ${game.coach}` : ''}`, 60, 128)

  // stupci
  const cols = [
    ['Č', (r) => (game.trackTime ? r.min : r.periods), 56],
    ['PTS', (r) => r.pts, 62, 'big'],
    ['2P', (r) => `${r.fg2m}-${r.fg2a}`, 78],
    ['3P', (r) => `${r.fg3m}-${r.fg3a}`, 78],
    ['SB', (r) => `${r.ftm}-${r.fta}`, 78],
    ['FG%', (r) => pctS(r.fgPct), 74],
    ['3P%', (r) => pctS(r.fg3Pct), 74],
    ['SB%', (r) => pctS(r.ftPct), 74],
    ['OR', (r) => r.oreb, 54],
    ['DR', (r) => r.dreb, 54],
    ['SK', (r) => r.reb, 56],
    ['AST', (r) => r.ast, 60],
    ['STL', (r) => r.stl, 58],
    ['BLK', (r) => r.blk, 58],
    ['TO', (r) => r.tov, 54],
    ['PF', (r) => r.pf, 54, 'pf'],
    ['IZB', (r) => r.fd, 56],
    ['+/-', (r) => (r.plusMinus > 0 ? `+${r.plusMinus}` : r.plusMinus), 66, 'pm'],
    ['EFF', (r) => r.eff, 64, 'big'],
  ]
  const nameW = W - 120 - cols.reduce((s, c) => s + c[2], 0)
  const x0 = 60
  const top = 176
  const rows = stats.players
  const rowH = Math.min(52, Math.floor((H - top - 120) / (rows.length + 2)))

  // header retka
  ctx.font = `700 24px ${FC}`
  ctx.fillStyle = COL.muted2
  ctx.textAlign = 'left'
  ctx.fillText('IGRAČ', x0, top)
  let cx = x0 + nameW
  ctx.textAlign = 'center'
  for (const [h, , w] of cols) { ctx.fillText(h, cx + w / 2, top); cx += w }
  ctx.strokeStyle = COL.line
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x0, top + 14); ctx.lineTo(W - 60, top + 14); ctx.stroke()

  const cellColor = (kind, r) => {
    if (kind === 'pf' && r.pf >= 4) return COL.red
    if (kind === 'pm') return r.plusMinus > 0 ? COL.green : r.plusMinus < 0 ? COL.red : COL.muted2
    return COL.text2
  }

  let y = top + 14
  const drawRow = (r, label, isTotal) => {
    y += rowH
    if (!isTotal && ((y / rowH) | 0) % 2 === 0) {
      ctx.fillStyle = COL.zebra
      ctx.fillRect(x0 - 8, y - rowH + 10, W - 104, rowH)
    }
    ctx.textAlign = 'left'
    ctx.font = `${isTotal ? 700 : 600} 27px ${FC}`
    ctx.fillStyle = isTotal ? COL.text : COL.text2
    if (r.player) {
      ctx.fillStyle = COL.blue
      ctx.fillText(`#${r.player.number}`, x0, y)
      ctx.fillStyle = COL.text
      ctx.fillText(r.player.name, x0 + 64, y)
    } else {
      ctx.fillText(label, x0, y)
    }
    let x = x0 + nameW
    ctx.textAlign = 'center'
    for (const [h, fn, w, kind] of cols) {
      const skip = isTotal && (h === 'Č' || h === '+/-')
      ctx.font = `${kind === 'big' || isTotal ? 700 : 500} 25px ${FU}`
      ctx.fillStyle = isTotal ? COL.text : cellColor(kind, r)
      if (!skip) ctx.fillText(String(fn(r)), x + w / 2, y)
      x += w
    }
  }
  for (const r of rows) drawRow(r)
  ctx.beginPath(); ctx.moveTo(x0, y + 12); ctx.lineTo(W - 60, y + 12); ctx.stroke()
  drawRow(stats.teamTotals, 'UKUPNO', true)

  ctx.textAlign = 'center'
  ctx.fillStyle = COL.muted2
  ctx.font = `600 22px ${FU}`
  ctx.fillText('kkdinamo.hr/stats', W / 2, H - 28)
}

/** JPEG sliku zapakira u jednostranični PDF (bez vanjskih paketa). */
function pdfFromJpeg(jpeg, pxW, pxH) {
  const te = new TextEncoder()
  const chunks = []
  let offset = 0
  const offsets = []
  const push = (bytes) => { chunks.push(bytes); offset += bytes.length }
  const pushStr = (s) => push(te.encode(s))

  pushStr('%PDF-1.4\n')
  const obj = (n, body) => { offsets[n] = offset; pushStr(`${n} 0 obj\n${body}\nendobj\n`) }
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_W} ${PT_H}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>`)
  offsets[4] = offset
  pushStr(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  push(jpeg)
  pushStr('\nendstream\nendobj\n')
  const content = `q ${PT_W} 0 0 ${PT_H} 0 0 cm /Im0 Do Q`
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  const xrefStart = offset
  let xref = 'xref\n0 6\n0000000000 65535 f \n'
  for (let i = 1; i <= 5; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pushStr(`${xref}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`)
  return new Blob(chunks, { type: 'application/pdf' })
}

export async function boxPdfBlob(game, stats) {
  try {
    await Promise.all([document.fonts.load(`700 52px ${FC}`), document.fonts.load(`500 25px ${FU}`)])
  } catch { /* fallback fontovi */ }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  drawBox(canvas.getContext('2d'), game, stats)
  const jpegBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer())
  return pdfFromJpeg(jpeg, W, H)
}

/** Podijeli PDF box scorea (sustavni share), inače preuzmi. */
export async function shareBoxPdf(game, stats) {
  const blob = await boxPdfBlob(game, stats)
  const file = new File([blob], `${gameFileBase(game)}-box-score.pdf`, { type: 'application/pdf' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared' } catch { /* odustao */ }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return 'downloaded'
}
