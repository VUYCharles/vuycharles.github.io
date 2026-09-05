import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE } from './lib/mobile.js'
import './index.css'

// App.jsx restores per-route scroll itself; the browser's own attempt races it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Enregistrement du service worker.
//
// - Pas dans le build mobile (Capacitor) : le shell natif sert déjà tout depuis
//   le disque, un SW en plus n'apporte rien et complique la vie.
// - `https:` uniquement : Safari refuse d'installer un SW en clair. `localhost`
//   est traité comme sécurisé par le navigateur donc marche aussi.
// - En cas d'échec on ne casse pas la page : la webapp fonctionne sans SW,
//   c'est juste l'offline qui saute.
if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // Quand un nouveau SW est trouvé, on lui dit `skipWaiting` dès qu'il
      // est prêt — plus la peine de fermer tous les onglets pour voir la
      // nouvelle version après un déploiement.
      const promote = worker => {
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage('SKIP_WAITING')
          }
        })
      }
      promote(reg.installing)
      reg.addEventListener('updatefound', () => promote(reg.installing))

      // Une fois par heure : on demande au navigateur de comparer le SW du
      // serveur au SW installé. Utile pour les téléphones qu'on n'ouvre que
      // rarement — sinon la mise à jour peut attendre des jours.
      setInterval(() => { reg.update().catch(() => {}) }, 60 * 60 * 1000)
    }).catch(() => { /* pas critique : l'app marche sans SW */ })

    // Le nouveau SW a pris la main : on recharge une fois pour aligner les
    // JS/CSS du DOM avec ceux du nouveau cache. On ne s'abonne à ça QUE
    // si un SW existait déjà : sinon le premier install déclencherait un
    // reload gratuit à chaque première visite, très déroutant. Le drapeau
    // évite la boucle si l'utilisateur clique "recharger" au même moment.
    if (navigator.serviceWorker.controller) {
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        refreshing = true
        location.reload()
      })
    }
  })
}
