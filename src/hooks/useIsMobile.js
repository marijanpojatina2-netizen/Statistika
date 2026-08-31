import { useEffect, useState } from 'react'

/** Mobitel u landscapeu prikazuje skalirani tablet raspored — tada NIJE "mobile". */
const phoneLandscape = () =>
  Math.min(window.screen.width, window.screen.height) < 620 &&
  window.matchMedia('(orientation: landscape)').matches

/** true kad je ekran uzak (mobitel portrait) — koristi se za kompaktni raspored. */
export default function useIsMobile(breakpoint = 820) {
  const query = `(max-width: ${breakpoint}px)`
  const calc = () => typeof window !== 'undefined'
    && window.matchMedia(query).matches
    && !phoneLandscape()
  const [isMobile, setIsMobile] = useState(calc)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const or = window.matchMedia('(orientation: landscape)')
    const onChange = () => setIsMobile(calc())
    onChange()
    mq.addEventListener('change', onChange)
    or.addEventListener('change', onChange)
    return () => { mq.removeEventListener('change', onChange); or.removeEventListener('change', onChange) }
  }, [query]) // eslint-disable-line
  return isMobile
}
