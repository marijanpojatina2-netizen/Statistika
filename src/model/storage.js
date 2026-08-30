const KEY = {
  CURRENT: 'ks.current',
  ARCHIVE: 'ks.archive',
  TEMPLATES: 'ks.templates',
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true }
  catch (e) { console.error('Spremanje nije uspjelo', e); return false }
}

export const loadCurrent = () => read(KEY.CURRENT, null)
export const saveCurrent = (game) => write(KEY.CURRENT, game)
export const clearCurrent = () => localStorage.removeItem(KEY.CURRENT)

export const loadArchive = () => read(KEY.ARCHIVE, [])
export const saveArchive = (list) => write(KEY.ARCHIVE, list)

export const loadTemplates = () => read(KEY.TEMPLATES, [])
export const saveTemplates = (list) => write(KEY.TEMPLATES, list)

// --- outbox: promjene koje čekaju slanje u oblak (offline u dvorani) -------
const OUTBOX = 'ks.outbox'
export const loadOutbox = () => read(OUTBOX, [])
export const saveOutbox = (list) => write(OUTBOX, list)
