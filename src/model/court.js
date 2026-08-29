// ---------------------------------------------------------------------------
// Geometrija polovice terena po FIBA pravilima (sve u metrima).
// Pozicije šuteva spremaju se normalizirano:
//   x: 0 = lijeva pokrajnja crta, 1 = desna pokrajnja crta
//   y: 0 = osnovna crta (ispod koša), 1 = središnja crta
// ---------------------------------------------------------------------------

export const COURT_W = 15      // širina terena
export const COURT_H = 14      // od osnovne do središnje crte
export const BASKET_X = 7.5
export const BASKET_Y = 1.575  // središte obruča od osnovne crte
export const R3 = 6.75         // linija za tri
export const CORNER_INSET = 0.9  // ravni dio linije za tri od pokrajnje crte
export const PAINT_HALF = 2.45   // pola širine reketa (reket je 4,9 m)
export const PAINT_LEN = 5.8     // dubina reketa od osnovne crte
export const FT_R = 1.8          // krug slobodnog bacanja
export const RESTRICTED_R = 1.25 // polukrug bez naboja
export const RIM_R = 0.225
export const BACKBOARD_Y = 1.2
export const BACKBOARD_HALF = 0.9

/** Visina na kojoj ravni dio linije za tri prelazi u luk. */
export const CORNER_Y = BASKET_Y + Math.sqrt(R3 * R3 - (BASKET_X - CORNER_INSET) ** 2)

export const toMeters = (x, y) => ({ mx: x * COURT_W, my: y * COURT_H })
export const toNorm = (mx, my) => ({ x: mx / COURT_W, y: my / COURT_H })

export function distanceToBasket(x, y) {
  const { mx, my } = toMeters(x, y)
  return Math.hypot(mx - BASKET_X, my - BASKET_Y)
}

/** 2 ili 3 poena — određuje se isključivo iz pozicije na terenu. */
export function shotValue(x, y) {
  const { mx, my } = toMeters(x, y)
  if (my <= CORNER_Y) return (mx <= CORNER_INSET || mx >= COURT_W - CORNER_INSET) ? 3 : 2
  return Math.hypot(mx - BASKET_X, my - BASKET_Y) >= R3 ? 3 : 2
}

export const ZONES = [
  { key: 'paint', label: 'Reket' },
  { key: 'mid', label: 'Poludistanca' },
  { key: 'corner3', label: 'Kut 3' },
  { key: 'top3', label: 'Vrh / krilo 3' },
]

/** Zona za shot chart postotke. */
export function shotZone(x, y) {
  const { mx, my } = toMeters(x, y)
  if (shotValue(x, y) === 3) return my <= CORNER_Y ? 'corner3' : 'top3'
  if (Math.abs(mx - BASKET_X) <= PAINT_HALF && my <= PAINT_LEN) return 'paint'
  return 'mid'
}

/** Ograniči tap unutar terena (prsti znaju promašiti rub). */
export function clampToCourt(x, y) {
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
}
