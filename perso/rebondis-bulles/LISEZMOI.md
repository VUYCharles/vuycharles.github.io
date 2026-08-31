# Rebondis Bulles

Puzzle de glissade 16 × 16, jouable au doigt, installable comme application.

| Fichier | Rôle |
|---|---|
| `index.html` | la page (projet du portfolio + application) |
| `style.css` | direction artistique Horizon v3.0 |
| `moteur.js` | plateau, physique de glissade, solveur A* — aucun accès au DOM |
| `interface.js` | rendu, entrées, déroulement de la partie |
| `solveur.js` | Worker : calcule l'objectif hors du fil principal |
| `sw.js` | service worker (hors ligne) |
| `manifest.webmanifest`, `icone*.svg` | installation sur l'écran d'accueil |

#*

## Le solveur

Deux optimisations rendent la recherche de l'optimum exact jusqu'à 13 coups
tenable sur téléphone :

- **canonisation** : pour un jeton donné, les trois bulles non visées sont
  interchangeables. Trier leurs positions divise l'espace d'états par 6
  (par 24 pour le Vortex) ;
- **heuristique admissible** : distance vers la case but dans un jeu relâché
  où une bulle peut s'arrêter n'importe où sur son rayon. Elle minore toujours
  le coût réel et ne varie que de 1 par coup, donc A* avec file à seaux rend
  l'optimum exact, et l'élagage `g + h > 13` coupe l'essentiel de l'arbre.

Mesuré sur machine de bureau : 20 ms par manche en moyenne, 440 ms dans le
pire cas, contre 5 600 ms pour un parcours en largeur classique.
