# openGym — PWA

Version dépouillée d'[openGym](https://gitlab.com/DuarteSantos8/opengym) qui
s'installe sur un iPhone (ou Android) comme une app native et fonctionne
entièrement hors ligne, sans backend.

- Progression, routines, timer de repos, historique, statistiques, heatmap,
  body-map, plate calculator, imports Hevy/CSV — tout est là.
- Toutes les données restent sur le téléphone (`localStorage`).
- Interface en français ou anglais, détectées depuis la langue du système.
- Images/GIFs des exercices servis depuis jsDelivr (pinnés à un commit).

Ce qui a été retiré : le backend Node, les comptes utilisateurs, la
synchronisation multi-appareils, le coach IA, l'admin — tout ce qui
nécessitait un serveur.

## Déployer sur GitHub Pages

1. Push ce repo sur GitHub.
2. Onglet **Settings → Pages** → dans « Source », sélectionne **GitHub
   Actions**.
3. Fais un push sur `main`. Le workflow `.github/workflows/pages.yml` build
   et publie automatiquement.
4. La PWA sera à `https://<ton-user>.github.io/<nom-du-repo>/`.

Alternative : Netlify ou Cloudflare Pages fonctionnent aussi bien
(build command : `npm run build:pwa`, publish directory : `frontend/dist`).

## Build en local

```sh
cd frontend
npm ci
npm run build:pwa
```

Le résultat est dans `frontend/dist/`. Pour prévisualiser :

```sh
cd frontend/dist && python3 -m http.server 8765
```

et ouvrir `http://localhost:8765/`. Un service worker exige HTTPS ou
`localhost` — donc l'installation de la PWA ne fonctionne pas quand
l'URL est une IP locale (`192.168.x.x`).

## Voir aussi

`PWA-README.md` détaille le fonctionnement du service worker, la stratégie
de cache, la checklist iPhone, et ce que je n'ai pas pu tester moi-même.

## Licence

AGPL-3.0-or-later — voir `LICENSE`.
