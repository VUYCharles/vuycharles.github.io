// Runtime-agnostic core of the i18n module: state, constants and readers (t, dateLocale,
// instrFor, exerciseNameFor, getLang). Plain Node-loadable — the browser-only pieces
// (import.meta.glob lazy
// loads, the React subscription hook) live in i18n.js and re-export from here.

// DEMO build (VITE_DEMO=1) ships only English and French. The other 13 packs make up ~85 %
// of the bundle (see mostly instructions/exercise names), so trimming them here — plus the
// matching filter in i18n.js's import.meta.glob — takes the demo from ~12 MB to ~2 MB.
// Kept behind a safe `import.meta.env` guard: Node has no import.meta.env, so the value is
// undefined there and this collapses to the full list — check-node-loadable.mjs stays green.
const DEMO = !!(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DEMO === '1')

const FULL_LANGS = {
  en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français', it: 'Italiano',
  pt: 'Português (Portugal)', 'pt-BR': 'Português (Brasil)', pl: 'Polski',
  tr: 'Türkçe', ru: 'Русский', zh: '中文',
  ko: '한국어', hi: 'हिन्दी', th: 'ไทย', hu: 'Magyar'
}
const FULL_INSTR_LANGS = ['en', 'es', 'fr', 'it', 'tr', 'ru', 'zh', 'hi', 'pl', 'ko', 'pt-BR', 'hu']
const FULL_EXERCISE_NAME_LANGS = ['pt-BR', 'hu']
const FULL_DATE_LOCALES = {
  en: 'en-GB', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', pt: 'pt-PT', 'pt-BR': 'pt-BR',
  pl: 'pl-PL', tr: 'tr-TR', ru: 'ru-RU', zh: 'zh-CN', ko: 'ko-KR', hi: 'hi-IN', th: 'th-TH', hu: 'hu-HU'
}

// Which language codes make the cut in the current build. To add another language to the demo
// (say Spanish), extend this list AND the glob patterns in i18n.js so the packs get bundled.
const DEMO_LANGS = ['en', 'fr']

const pickKeys = (obj, keys) => keys.reduce((o, k) => (k in obj ? (o[k] = obj[k], o) : o), {})
const pickList = (list, keys) => list.filter(k => keys.includes(k))

export const LANGS = DEMO ? pickKeys(FULL_LANGS, DEMO_LANGS) : FULL_LANGS
export const INSTR_LANGS = DEMO ? pickList(FULL_INSTR_LANGS, DEMO_LANGS) : FULL_INSTR_LANGS
export const EXERCISE_NAME_LANGS = DEMO ? pickList(FULL_EXERCISE_NAME_LANGS, DEMO_LANGS) : FULL_EXERCISE_NAME_LANGS
export const DATE_LOCALES = DEMO ? pickKeys(FULL_DATE_LOCALES, DEMO_LANGS) : FULL_DATE_LOCALES

// Best guess at the user's preferred language, based on navigator.language(s). Falls back to
// English when the browser is offline of that info (Node, old runtimes) or when no supported
// language matches. Kept in core, not in i18n.js, because the store's default state calls
// this too — before any React component mounts and before the browser-only bits load.
//
// A regional variant like fr-CH matches fr; but pt-BR is treated as its own language (we ship
// a dedicated pack). Order of navigator.languages is respected: first supported wins.
export function detectBrowserLang() {
  const nav = (typeof navigator !== 'undefined' && navigator) || null
  const list = nav && Array.isArray(nav.languages) && nav.languages.length ? nav.languages
    : nav && nav.language ? [nav.language] : []
  for (const raw of list) {
    if (!raw || typeof raw !== 'string') continue
    if (LANGS[raw]) return raw                           // exact match, incl. 'pt-BR'
    const base = raw.split('-')[0].toLowerCase()
    if (LANGS[base]) return base                         // 'fr-CH' -> 'fr'
  }
  return 'en'
}

let lang = 'en'                 // set only by _setLangState, called from i18n.js setLang
let dict = {}                   // current locale pack (empty = English fallback)
let instr = null                // { exId: [steps] } for the current language, null = English
let exerciseNames = null        // { exId: translated name }, null = original catalogue name
let version = 0                 // bumped on every setLang; drives the React subscription selector

export const getLang = () => lang
export const dateLocale = () => DATE_LOCALES[lang] || 'en-GB'
export const getVersion = () => version

// Translate a source string; {0},{1}… are replaced with args (also on the English fallback).
export function t(s, ...args) {
  let v = dict[s] || s
  for (let i = 0; i < args.length; i++) v = v.replaceAll('{' + i + '}', args[i])
  return v
}

// Instructions for an exercise in the current language (English steps as fallback).
export const instrFor = ex => (instr && instr[ex.id]) || ex.st || []

// Built-in catalogue names are bilingual when a complete translated name pack is active.
// User-created exercises have no entry in the pack and keep their exact chosen name.
export const exerciseNameFor = ex => {
  const translated = exerciseNames && ex && exerciseNames[ex.id]
  if (!translated) return ex?.n || ''
  // Some names (Burpee, Pilates, brand/model terms) are the established term in the target
  // language too. Repeating an identical loanword in parentheses adds noise rather than
  // context. Compared in the active language's own casing rules, not hardcoded to one —
  // this only ever differs from ordinary casing for languages with locale-specific rules
  // (e.g. Turkish dotless i), which does not include any language shipped here today.
  return translated.toLocaleLowerCase(lang) === ex.n.toLocaleLowerCase('en')
    ? translated
    : `${translated} (${ex.n})`
}

// Search both the localized and canonical English title without changing persisted data.
export const exerciseNameSearchText = ex => {
  const translated = exerciseNames && ex && exerciseNames[ex.id]
  return translated ? `${translated} ${ex.n}` : (ex?.n || '')
}

// Called by i18n.js's setLang once the locale pack has been loaded — kept here rather than
// exported as setLang because loading packs requires import.meta.glob, which is Vite-only.
// `dict`, `instr` and `exerciseNames` may be null to reset to their English fallbacks.
export function _setLangState(newLang, newDict, newInstr, newExerciseNames) {
  lang = LANGS[newLang] ? newLang : 'en'
  dict = lang === 'en' ? {} : (newDict || {})
  instr = lang === 'en' || !INSTR_LANGS.includes(lang) ? null : (newInstr || null)
  exerciseNames = lang === 'en' || !EXERCISE_NAME_LANGS.includes(lang) ? null : (newExerciseNames || null)
  version++
  return version
}
