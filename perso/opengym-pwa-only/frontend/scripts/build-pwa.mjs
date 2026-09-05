#!/usr/bin/env node
/*
 * Post-build PWA : appelé après `vite build`. Deux jobs :
 *
 *   1. Lister tous les fichiers réellement produits dans `dist/` et les
 *      injecter dans `dist/sw.js` comme liste de precache. Comme ça, le
 *      service worker peut faire `caches.addAll(...)` à l'install et l'app
 *      est vraiment prête pour l'offline dès la première visite en ligne.
 *
 *   2. Générer un identifiant de build (version + hash court des assets) et
 *      l'injecter dans `dist/sw.js`. Le nom du cache change à chaque build,
 *      donc l'ancienne version est jetée automatiquement au prochain
 *      activate. C'est le fix du bug "j'ai mis à jour mais je vois toujours
 *      l'ancien".
 *
 * Pas de dépendance npm : que du Node natif, appelé depuis package.json.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, sep, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(ROOT, 'dist')
const SW = join(DIST, 'sw.js')

// Fichiers à ne PAS mettre dans le precache :
//  - sw.js lui-même : c'est le SW qui installe le cache, l'y inclure crée
//    un piège d'update (l'ancien SW re-servirait le nouveau depuis son cache).
//  - .map : source maps, gros et inutiles offline.
const SKIP = /(^|\/)sw\.js$|\.map$/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version

// URLs relatives à la racine du déploiement, préfixées `./` pour rester
// portables : le même build fonctionne à la racine d'un domaine
// (opengym.example.com) ou sous un sous-chemin (example.com/opengym/).
// C'est cohérent avec `base: './'` dans vite.config.js.
const files = walk(DIST)
  .map(p => relative(DIST, p).split(sep).join(posix.sep))
  .filter(p => !SKIP.test(p))
  .sort()

const urls = files.map(f => './' + f)

// Hash du contenu réel : si un asset change (même à taille égale), le nom
// du cache change et l'utilisateur ne voit pas de rémanence.
const hash = createHash('sha256')
for (const f of files) hash.update(f).update('\0').update(readFileSync(join(DIST, f)))
const buildId = version + '-' + hash.digest('hex').slice(0, 8)

// Injection dans sw.js. On remplace deux marqueurs bien identifiables.
let sw
try { sw = readFileSync(SW, 'utf8') } catch {
  console.error('[build-pwa] Introuvable :', SW)
  console.error('  Lance `vite build` avant `build-pwa.mjs`.')
  process.exit(1)
}

const before = sw
sw = sw.replace(/const BUILD_ID = ['"][^'"]*['"];?/,
  `const BUILD_ID = ${JSON.stringify(buildId)};`)
sw = sw.replace(/const PRECACHE_URLS = \[[^\]]*\];?/,
  `const PRECACHE_URLS = ${JSON.stringify(urls)};`)

if (sw === before) {
  console.error('[build-pwa] Aucun marqueur trouvé dans sw.js.')
  console.error('  Vérifie que public/sw.js contient bien les lignes')
  console.error('  `const BUILD_ID = ...` et `const PRECACHE_URLS = ...`.')
  process.exit(1)
}

writeFileSync(SW, sw)
console.log('[build-pwa] Cache : ' + buildId)
console.log('[build-pwa] Precache : ' + urls.length + ' fichiers')
