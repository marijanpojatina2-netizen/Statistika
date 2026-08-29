import { useEffect, useRef } from 'react'

/** Drzi ekran upaljenim tijekom utakmice (gdje je podrzano). */
export default function useWakeLock(active) {
  const ref = useRef(null)
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let cancelled = false
    const request = async () => {
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) { s.release(); return }
        ref.current = s
      } catch { /* korisnik/preglednik odbio — nije kriticno */ }
    }
    request()
    const onVis = () => { if (document.visibilityState === 'visible') request() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      try { ref.current?.release() } catch { /* ignore */ }
      ref.current = null
    }
  }, [active])
}
