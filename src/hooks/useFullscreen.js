import { useCallback, useEffect, useState } from 'react'

/**
 * Preko cijelog ekrana i u obicnoj kartici preglednika — sakriva adresnu traku
 * i sistemsku navigaciju dok traje utakmica.
 */
export default function useFullscreen() {
  const [active, setActive] = useState(() => !!document.fullscreenElement)
  const supported = typeof document !== 'undefined'
    && !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)

  useEffect(() => {
    const onChange = () => setActive(!!(document.fullscreenElement || document.webkitFullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  const toggle = useCallback(async () => {
    const el = document.documentElement
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.())
      } else {
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())
      }
    } catch { /* preglednik odbio — nije kriticno */ }
  }, [])

  return { supported, active, toggle }
}
