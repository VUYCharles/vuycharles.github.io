/* openGym service worker — offline-first pour le build DEMO (VITE_DEMO=1).
 *
 * Trois idées :
 *  1. À l'install, on PRÉ-CACHE tout ce que le build a produit (HTML + JS + CSS +
 *     icônes + manifest). La liste est injectée à la fin du build par le script
 *     `scripts/build-pwa.mjs` — ne pas éditer la constante __PRECACHE__ à la
 *     main, elle est remplacée automatiquement.
 *  2. Le nom du cache contient un hash du build. Chaque build déployé jette
 *     donc automatiquement l'ancien cache : plus de "j'ai déployé mais je vois
 *     toujours l'ancien" — c'était la première cause de bug remontée.
 *  3. Les GIFs/images des exercices sont hébergés sur jsDelivr (voir vite build
 *     avec VITE_GIF_BASE). Comme c'est une autre origine, on les traite à part :
 *     cache runtime opportuniste, avec allowlist pour ne rien cacher d'inconnu.
 *
 * Ce SW est utilisé uniquement pour le build DEMO servi sur un site statique
 * HTTPS. Il ne connaît AUCUNE route /api/ et n'essaie pas de les cacher —
 * ce build n'en a plus.
 */

// Remplacés au build. Fallback pour le cas où on ouvrirait ce fichier
// directement (dev, curieux) : cache vide, pas de casse.
const BUILD_ID = '__BUILD_ID__';              // ex. "1.3.1-abc12345"
const PRECACHE_URLS = ['./', './index.html']; // __PRECACHE_URLS__

// Séparés pour pouvoir purger l'un sans jeter l'autre à chaque déploiement.
const APP_CACHE = 'opengym-app-' + BUILD_ID;  // le build lui-même (HTML/JS/CSS)
const MEDIA_CACHE = 'opengym-media-v1';        // les GIFs/images jsDelivr

// Origines externes qu'on accepte de mettre en cache. Une URL qui n'est pas
// dans cette liste passe en réseau direct sans jamais être stockée : la
// dernière chose qu'on veut est cacher un tracker ou une pub par accident.
const ALLOWED_EXTERNAL = [
  'https://cdn.jsdelivr.net'
]

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE)
    // addAll est atomique — si un seul asset manque, l'install échoue et le
    // vieux SW reste en place. C'est ce qu'on veut : mieux vaut garder la
    // version qui marche que promouvoir une moitié cassée.
    await cache.addAll(PRECACHE_URLS)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    // On jette les vieux caches d'app (autres BUILD_ID). Le cache media est
    // gardé — les GIFs sont immuables (URL pinnée à un commit sur jsDelivr).
    await Promise.all(
      keys
        .filter(k => k.startsWith('opengym-app-') && k !== APP_CACHE)
        .map(k => caches.delete(k))
    )
    await self.clients.claim()
  })())
})

// Permet au client de forcer une prise en main immédiate quand un nouveau
// SW attend en `waiting` (voir main.jsx : "nouvelle version dispo"). Sans ça,
// il faut fermer tous les onglets pour que le nouveau SW prenne la main.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// --- Notifications push : on garde le comportement d'origine mais rendu
// tolérant. En mode DEMO il n'y a pas de serveur pour envoyer des push,
// donc en pratique ces handlers ne s'exécuteront jamais.
self.addEventListener('push', event => {
  const data = (() => { try { return event.data ? event.data.json() : {} } catch { return {} } })()
  event.waitUntil(self.registration.showNotification(data.title || 'openGym', {
    body: data.body || '',
    icon: 'icon-512.png',
    badge: 'icon-180.png',
    tag: data.tag || 'opengym',
    renotify: true
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(clients => {
    const c = clients.find(cl => 'focus' in cl)
    return c ? c.focus() : self.clients.openWindow('./')
  }))
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // 1. Navigation (une URL de page, pas un asset). Le build est une SPA :
  //    on répond toujours avec index.html en cache. Ça permet d'ouvrir
  //    /workout, /stats, etc. offline, et aussi de repartir sur une route
  //    profonde après un cold start hors ligne.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE)
      const shell = await cache.match('./index.html') || await cache.match('index.html')
      if (shell) return shell
      // Précache raté ? Dernier recours : réseau.
      try { return await fetch(req) } catch { return new Response('Offline', { status: 503 }) }
    })())
    return
  }

  // 2. Assets same-origin (JS/CSS hashés par Vite, icônes, manifest, etc.).
  //    Cache-first : les noms sont uniques par build donc jamais périmés.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE)
      const hit = await cache.match(req)
      if (hit) return hit
      try {
        const res = await fetch(req)
        // On ne met en cache que les réponses "propres" (200, basic).
        // Pas de opaques : elles pèsent leur taille max pour rien.
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone())
        return res
      } catch {
        return new Response('', { status: 504 })
      }
    })())
    return
  }

  // 3. Assets cross-origin : uniquement pour les origines qu'on a explicitement
  //    autorisées (jsDelivr, pour les images/GIFs). Le reste part en réseau
  //    direct, sans cache.
  const externallyAllowed = ALLOWED_EXTERNAL.some(o => url.href.startsWith(o + '/'))
  if (!externallyAllowed) return

  event.respondWith((async () => {
    const cache = await caches.open(MEDIA_CACHE)
    const hit = await cache.match(req)
    if (hit) return hit
    try {
      // NE PAS forcer `mode: 'cors'` ici. Une <img src="..."> initie sa requête
      // en no-cors ; on override le mode côté SW et Safari iOS refuse ensuite
      // de tainter/servir la réponse au <img> d'origine — le GIF ne s'affiche
      // pas alors qu'il a bien été téléchargé. On garde le mode d'origine, la
      // réponse sera `opaque` mais parfaitement utilisable dans un <img>.
      const res = await fetch(req)
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone())
      return res
    } catch {
      // Pas de GIF sous la main : on renvoie une 504, le composant Media
      // affiche déjà un placeholder si l'image ne charge pas.
      return new Response('', { status: 504 })
    }
  })())
})
