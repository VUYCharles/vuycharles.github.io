# openGym — PWA installable depuis un site statique

Ce patch transforme le build **DEMO** d'openGym (`VITE_DEMO=1`) en une vraie
PWA autonome : installable sur un iPhone, jouable hors ligne, indépendante
de tout serveur une fois installée. Aucun backend Node, aucune connexion à
un serveur local — toutes les données restent sur le téléphone dans
`localStorage` (le code du mode DEMO qui existe déjà dans le projet).

---

## Pourquoi ta version actuelle ne marche pas en 5G

Une PWA installée est liée pour la vie à **l'origine** depuis laquelle on
l'a installée. Si tu ouvres ta webapp sur `http://192.168.1.42:5173`
puis « Ajouter à l'écran d'accueil », l'iPhone appellera toujours cette
adresse, y compris quand il n'est plus sur ton WiFi. Aucun service worker
ne peut compenser ça, parce que **le service worker lui-même est servi
depuis cette adresse**.

La seule solution : servir l'app depuis une **URL publique en HTTPS**. Deux
chemins :

- ton portfolio (`opengym.mon-site.ch`, ou `mon-site.ch/opengym/`),
- ton serveur local exposé via **Cloudflare Tunnel** avec un vrai nom de
  domaine + HTTPS (`cloudflared tunnel --url http://localhost:8765`).

L'un ou l'autre marche, la contrainte importante est HTTPS.

---

## Fichiers modifiés

| Fichier | Ce qui change |
|---|---|
| `frontend/public/sw.js` | Réécriture complète : precache à l'install, cache versionné, allowlist jsDelivr, réponse offline pour la navigation |
| `frontend/public/manifest.webmanifest` | Remplace `manifest.json`. Icônes `any` + `maskable` séparées, ajout de `id`, `lang`, `dir` |
| `frontend/public/manifest.json` | **Supprimé** (remplacé par le `.webmanifest`) |
| `frontend/index.html` | `<link>` mis à jour, `theme-color` en variantes light/dark |
| `frontend/src/main.jsx` | Enregistrement du SW plus solide : auto-update périodique, gestion de la nouvelle version |
| `frontend/scripts/build-pwa.mjs` | **Nouveau.** Script post-build qui injecte la liste des fichiers pré-cachés et bump l'ID du cache |
| `frontend/package.json` | Nouveau script `npm run build:pwa` |
| `frontend/src/lib/i18n-core.js` | Nouvelle fonction `detectBrowserLang()` qui matche `navigator.languages` contre les 15 packs disponibles |
| `frontend/src/lib/i18n.js` | Re-export de `detectBrowserLang` |
| `frontend/src/App.jsx` | Utilise `detectBrowserLang()` en fallback de `S.lang` |
| `frontend/src/views/Settings.jsx` | Le sélecteur de langue affiche la langue détectée quand aucun choix explicite |
| `frontend/src/store/useStore.js` | `DEF.lang = ''` (au lieu de `'en'`) — signal "jamais choisi, auto-détecter" |
| `frontend/src/store/useStore.restore.test.jsx` | Test mis à jour pour le nouveau contrat de `DEF.lang` |

Aucune dépendance npm ajoutée. Le patch ne touche à rien en dehors du
build DEMO — les modes self-hosted, mobile, et le backend restent
strictement identiques.

---

## Construire et servir

### 1. Build

```sh
cd frontend
npm install
npm run build:pwa
```

Ce script fait deux choses :

1. `vite build` avec `VITE_DEMO=1` et les URLs jsDelivr pour les
   médias — pareil que le workflow GitHub Pages officiel.
2. `node scripts/build-pwa.mjs` : liste tout ce que Vite a produit dans
   `dist/`, injecte la liste dans `dist/sw.js` (pour le precache), et
   génère un `BUILD_ID` unique qui devient le nom du cache. Chaque build
   jette donc automatiquement l'ancien cache — c'est le fix du bug
   « j'ai mis à jour mais je vois toujours l'ancienne version ».

En fin de build, tu dois voir :

```
[build-pwa] Cache : 1.3.1-abc12345
[build-pwa] Precache : 55 fichiers
```

Le dossier `dist/` est prêt à être déposé sur n'importe quel hébergeur
statique HTTPS (Netlify, Cloudflare Pages, GitHub Pages, ton propre nginx,
etc.). Le build est portable : `base: './'` (déjà défini dans
`vite.config.js`) fait que le même dossier fonctionne à la racine d'un
domaine ou dans n'importe quel sous-chemin.

### 2. Servir en local pour tester

Un service worker exige HTTPS **ou** `localhost`. Pour tester sur ton
ordinateur avant de déployer :

```sh
cd frontend/dist
python3 -m http.server 8765
```

puis ouvre `http://localhost:8765/`. Le SW s'enregistrera, la PWA sera
installable depuis Chrome desktop (icône + dans la barre d'adresse).

### 3. Servir en HTTPS depuis un serveur local (Cloudflare Tunnel)

Si tu veux garder le build sur ton PC mais y accéder depuis ton téléphone
en 5G :

```sh
# une fois : brew install cloudflared  (ou apt install / equivalent)
cd frontend/dist
python3 -m http.server 8765 &
cloudflared tunnel --url http://localhost:8765
```

Cloudflare te donne une URL du type `https://xxxx-xxxx.trycloudflare.com`
en HTTPS immédiatement. Ouvre-la sur ton iPhone et installe la PWA
depuis ce domaine. Elle continuera à fonctionner en 5G tant que ton PC
+ tunnel tournent.

Pour un vrai portfolio, mieux vaut un vrai domaine : le tunnel gratuit
change d'URL à chaque redémarrage et **ça casserait l'installation**
(voir plus bas).

---

## Checklist iPhone (déroule-la toi-même)

### À l'installation

1. Ouvre l'URL HTTPS de la PWA dans **Safari** (pas Chrome iOS : la
   « Ajouter à l'écran d'accueil » depuis Chrome ne crée pas une vraie
   PWA sur iOS).
2. Bouton **Partager** → **Sur l'écran d'accueil**.
3. Le titre proposé doit être « openGym ». L'icône doit être celle du
   projet, pas une capture d'écran de la page.
4. Lance l'app depuis l'écran d'accueil. **Elle doit s'ouvrir en
   plein écran, sans la barre d'adresse Safari.** Si tu vois la barre
   d'adresse, `display: standalone` ne s'est pas appliqué et il faut
   désinstaller/réinstaller.

### Test hors ligne

1. Depuis l'app installée, ouvre au moins un exercice avec un GIF et
   attends que le GIF se charge (il va dans le cache media).
2. Active le **mode Avion**.
3. Ferme complètement l'app depuis le multitâche, puis rouvre-la
   depuis l'icône. L'interface doit s'afficher entièrement.
4. Navigue dans **Library**, **Plan**, **Stats**, **Settings**. Tout
   doit répondre.
5. Le GIF que tu avais chargé plus tôt doit toujours s'afficher.
   Les GIFs jamais chargés afficheront un placeholder — c'est normal,
   ils viennent de jsDelivr et n'étaient pas en cache.

### Forcer une mise à jour

Une fois installée, la PWA se met à jour toute seule dans la plupart
des cas :

- Au retour au premier plan, le SW compare son URL avec le serveur.
- Une vérification est aussi programmée toutes les heures pendant que
  l'app est ouverte.
- Quand un nouveau SW est prêt, l'app recharge une fois automatiquement
  pour l'adopter.

Si ça ne suffit pas (rare, mais arrive), la procédure manuelle :

- Réglages iPhone → **Safari** → **Effacer historique et données** ne
  suffit **pas** pour une PWA. Il faut :
- Sur l'icône de la PWA, appuie long → **Supprimer l'app**.
- Réinstalle-la depuis l'URL.

En dernier recours, quand tu débogges : sur Chrome desktop, DevTools →
Application → Service Workers → « Update on reload » puis F5.

---

## Ce que je n'ai pas pu vérifier

Je n'ai pas d'iPhone sous la main. Le build a été testé avec Node 22 et
un serveur HTTP local, mais **le comportement réel sur iOS reste à
valider par toi**. En particulier :

- L'icône « maskable » réutilise `icon-512.png` (icône déjà présente
  dans le projet). Un vrai fichier maskable, dessiné avec le contenu
  concentré dans les 60 % centraux, rendra mieux sur Android — sans
  quoi Android peut rogner les bords de l'icône. Sur iOS c'est
  l'`apple-touch-icon` qui est utilisée, pas la maskable, donc ce point
  ne t'affectera pas si tu ne cibles que l'iPhone.
- La couleur `theme-color` pour le mode clair (`#f5f5f5`) est une
  supposition — je ne connais pas la vraie identité visuelle du site.
  À ajuster si nécessaire dans `frontend/index.html`.
- Si la PWA est déjà installée sur ton iPhone à l'ancienne adresse,
  la nouvelle installation ne la remplacera pas : **désinstalle
  l'ancienne d'abord**. iOS traite chaque origine comme une app
  distincte.
- **Changer d'URL après une installation casse la PWA installée.** Si
  tu changes de sous-domaine ou passes de `mon-site.ch/opengym/` à
  `opengym.mon-site.ch`, il faudra réinstaller. Choisis ton URL
  définitive avant la première install.
- Certaines API utilisées par le projet ne sont pas disponibles sur
  Safari iOS (notamment `BarcodeDetector` : le projet a un fallback
  vers `jsQR` mais je ne l'ai pas testé). La cadence d'écran en
  arrière-plan et les notifications locales sur iOS sont
  volontairement limitées par Apple.
- Le mode DEMO d'openGym met **tout** dans `localStorage`. iOS peut
  purger `localStorage` d'une PWA sous pression mémoire (peu fréquent
  mais possible). Le mode Capacitor (via `npm run build:mobile`,
  emballage natif) est plus sûr pour un usage long terme si tu tiens
  à ton historique.

---

## Langue auto-détectée

L'app repose sur `navigator.languages` (dans l'ordre : Réglages iOS → Général →
Langue et région). Un iPhone en français ouvre openGym en français, un
iPhone en allemand en allemand, etc. Les 15 packs suivants sont supportés :

`en de es fr it pt pt-BR pl tr ru zh ko hi th hu`

Une langue non supportée retombe sur la suivante dans les préférences du
téléphone, puis sur l'anglais en dernier recours. Le choix de l'utilisateur
dans **Settings → Language** l'emporte toujours sur la détection.

---

## Résumé des trois pièges qu'on a désamorcés

1. **Cache jamais bumped** : le SW original gardait `opengym-rt-v1` à
   travers tous les builds. Un utilisateur qui avait installé la PWA
   ne voyait jamais les mises à jour. → `BUILD_ID` régénéré à chaque
   `npm run build:pwa`.
2. **Rien de pré-caché à l'install** : le SW original ne mettait en
   cache qu'au fur et à mesure des visites. Si l'utilisateur naviguait
   dans une page qu'il n'avait jamais vue avant de perdre le réseau,
   il tombait sur une erreur. → `caches.addAll(...)` à l'install avec
   la liste des 55 fichiers du build.
3. **Le SW s'installait sur l'IP locale** : l'app s'installait sur
   `http://192.168.x.x`, plus atteignable en 5G. → *Ce point-là n'est
   pas un bug de code*, c'est une contrainte de la spec PWA. La
   solution est d'utiliser un domaine public HTTPS (Cloudflare Tunnel
   ou hébergement statique).
