// ---------------------------------------------------------------------------
// Izvoz SVG dijagrama u PNG. Stilovi dolaze iz stylesheeta, pa ih treba
// prepisati u sam element prije serijalizacije — inače je slika prazna.
// ---------------------------------------------------------------------------
const COPY = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-dasharray',
  'font-size', 'font-weight', 'font-family', 'text-anchor', 'opacity']

function inlineStyles(source, clone) {
  const src = source.querySelectorAll('*')
  const dst = clone.querySelectorAll('*')
  for (let i = 0; i < src.length; i += 1) {
    const cs = getComputedStyle(src[i])
    let css = ''
    for (const prop of COPY) {
      const v = cs.getPropertyValue(prop)
      if (v) css += `${prop}:${v};`
    }
    dst[i].setAttribute('style', css)
    dst[i].removeAttribute('class')
  }
}

/**
 * @param svg      izvorni <svg> element
 * @param filename naziv datoteke
 * @param opts     { width, background, title }
 */
export async function svgToPng(svg, filename, opts = {}) {
  const width = opts.width || 1200
  const background = opts.background || '#0B1E42'

  const clone = svg.cloneNode(true)
  inlineStyles(svg, clone)

  const vb = (svg.getAttribute('viewBox') || '0 0 15 14').split(/\s+/).map(Number)
  const ratio = vb[3] / vb[2]
  const height = Math.round(width * ratio)
  clone.setAttribute('width', width)
  clone.setAttribute('height', height)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const xml = new XMLSerializer().serializeToString(clone)
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`

  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new Error('Slika dijagrama nije se učitala'))
    img.src = url
  })

  const pad = Math.round(width * 0.03)
  const titleH = opts.title ? Math.round(width * 0.06) : 0
  const canvas = document.createElement('canvas')
  canvas.width = width + pad * 2
  canvas.height = height + pad * 2 + titleH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (opts.title) {
    ctx.fillStyle = '#EAF1FB'
    ctx.font = `600 ${Math.round(width * 0.032)}px system-ui, -apple-system, sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillText(opts.title, pad, pad + titleH / 2)
  }
  ctx.drawImage(img, pad, pad + titleH, width, height)

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Izrada PNG-a nije uspjela')

  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 2000)
}
