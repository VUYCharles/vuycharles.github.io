// Browser-only shell of the i18n module. The runtime-agnostic state and readers live
// in i18n-core.js (plain Node-loadable); this file adds the two pieces that genuinely need
// the browser: `setLang` (which lazy-loads locale packs via import.meta.glob) and the React
// subscription hook `useLang`.

import { useSyncExternalStore } from 'react'
import {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES,
  getLang, dateLocale, t, instrFor, exerciseNameFor, exerciseNameSearchText, getVersion, _setLangState,
  detectBrowserLang
} from './i18n-core.js'

export {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES,
  getLang, dateLocale, t, instrFor, exerciseNameFor, exerciseNameSearchText,
  detectBrowserLang
}

// Vite code-splits locale, instruction and exercise-name packs via import.meta.glob. They are
// lazy, so the production bundle ships English only until another language is selected.
//
// Demo build (VITE_DEMO=1) restricts the glob to the languages actually exposed by LANGS in
// i18n-core.js — the pack list must stay in sync with DEMO_LANGS there. The bundler resolves
// the glob at build time, so unlisted packs are physically excluded from `dist/` rather than
// just hidden in the UI: this is where the demo's ~10 MB → ~800 KB translation trim happens.
// English never has a pack file (empty dictionary is the fallback), so the demo glob only
// names the non-English demo languages.
const DEMO_BUILD = import.meta.env.VITE_DEMO === '1'
const localePacks = DEMO_BUILD
  ? import.meta.glob('../locales/fr.js')
  : import.meta.glob('../locales/*.js')
const instrPacks = DEMO_BUILD
  ? import.meta.glob('../instr/fr.js')
  : import.meta.glob('../instr/*.js')
const exerciseNamePacks = DEMO_BUILD
  ? {}  // no demo language has an exercise-name pack (only pt-BR and hu do)
  : import.meta.glob('../exercise-names/*.js')

// React subscription bookkeeping — kept here, not in core, so core has zero React coupling.
const subs = new Set()
const notify = () => { subs.forEach(f => f()) }

export async function setLang(l) {
  if (!LANGS[l]) l = 'en'
  if (l === getLang() && getVersion() > 0) return
  let dict = {}, instr = null, exerciseNames = null
  try { dict = l === 'en' ? {} : (await localePacks['../locales/' + l + '.js']()).default } catch (e) { dict = {} }
  try { instr = l === 'en' || !INSTR_LANGS.includes(l) ? null : (await instrPacks['../instr/' + l + '.js']()).default } catch (e) { instr = null }
  try {
    exerciseNames = l === 'en' || !EXERCISE_NAME_LANGS.includes(l)
      ? null
      : (await exerciseNamePacks['../exercise-names/' + l + '.js']()).default
  } catch (e) { exerciseNames = null }
  _setLangState(l, dict, instr, exerciseNames)
  notify()
}

// Re-renders the subscribing component (and its children) whenever the language changes.
export function useLang() {
  return useSyncExternalStore(fn => { subs.add(fn); return () => subs.delete(fn) }, getVersion)
}
