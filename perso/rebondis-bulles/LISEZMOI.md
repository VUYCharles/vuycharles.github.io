# Rebondis Bulles

Puzzle de glissade 16 × 16, jouable au doigt, installable comme application.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | la page (projet du portfolio + application) |
| `style.css` | direction artistique Horizon v3.0 |
| `moteur.js` | plateau, physique de glissade, solveur A* — aucun accès au DOM |
| `plateau.js` | rendu pixel art sur canvas, glissade et rebond |
| `interface.js` | entrées, déroulement de la partie |
| `solveur.js` | Worker : calcule l'objectif hors du fil principal |
| `sw.js` | service worker (hors ligne) |
| `manifest.webmanifest`, `icone*.svg` | installation sur l'écran d'accueil |

## Mise en ligne

Le service worker et le Worker exigent **http(s)** : en ouvrant `index.html`
depuis le disque (`file://`), le jeu fonctionne mais sans hors-ligne, et le
calcul de l'objectif retombe sur le fil principal.

En local :

```
python3 -m http.server 8000
```

puis `http://localhost:8000/`.

## À chaque livraison

Incrémenter `CACHE` dans `sw.js` (`bulles-v1` → `bulles-v2`). Sans ça, les
appareils qui ont déjà visité le site continueront de servir l'ancienne
version depuis leur cache.

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


## Le rendu

Le plateau est un canvas de 192 px de côté (16 cases de 12 px), agrandi en
`image-rendering: pixelated`. Les sprites sont des masques 8 × 8 déclarés en
haut de `plateau.js` : les modifier suffit à changer les formes.

Les jetons sont dessinés en contour, les bulles en disque plein — c'est ce qui
évite qu'un jeton rond soit pris pour une bulle de la même couleur. Les jetons
non tirés sont rapprochés du fond plutôt que rendus transparents, pour garder
des pixels francs.

Réglages de l'animation, en tête de `plateau.js` :

| Constante | Rôle | Valeur |
|---|---|---|
| `MS_BASE` / `MS_PAR_CASE` | socle et allongement par case | 50 ms / 18 ms |
| `MS_MIN` / `MS_MAX` | bornes de durée | 85 / 280 ms |
| `ELAN` | part d'inertie dans la courbe | 0.45 |
| `REBOND` | profondeur du rebond à l'impact | 2 px |
| `MS_REBOND` | durée du retour | 70 ms |

La bulle part d'un coup puis se laisse porter : elle démarre à 1,45 fois sa
vitesse moyenne et percute encore à 0,55. `ELAN` règle cette décroissance —
à 0 le mouvement est parfaitement linéaire, au-delà de 0,5 la bulle mollit
avant l'obstacle et le choc ne se lit plus.

L'animation est purement visuelle : le moteur a déjà déplacé la bulle quand
elle démarre, donc rien ne dépend d'elle. `prefers-reduced-motion: reduce`
la désactive entièrement, et le reste du site n'a toujours aucune transition
ni animation CSS.


## Les deux modes

### Classique
Les 17 jetons du paquet, sans remise, sans limite de temps. Score = coups
joués et écart à la somme des optimaux. Au bout de 60 s sur une manche, le
bouton « Montrer la solution » se débloque.

### Rapide
Manches sans fin, une minute par jeton, chronométrée dès la révélation.

| Situation | Points | Solution montrée |
|---|---|---|
| Trajet optimal trouvé dans la minute | 1 + (temps restant / 60 s), donc jusqu'à 2 | oui |
| Réponse perfectible à l'expiration | optimal / coups joués | non |
| Aucune réponse à l'expiration | 0 | oui |

Une réponse perfectible ne clôt pas la manche : elle est enregistrée, le
plateau revient à sa position de départ et le joueur peut retenter dans le
temps restant. Seule sa meilleure réponse compte.

La **cadence** est le score retenu : points divisés par le nombre de manches,
chacune valant une minute pleine quel que soit le temps réellement passé
dessus. Elle vaut donc entre 0 et 2 pts/min. Compter le temps réel au
dénominateur paierait la vitesse deux fois — une fois par le bonus, une fois
par la division — et le classement se jouerait alors uniquement sur les
manches expédiées en quelques secondes.

Une partie interrompue en pleine manche ne compte pas la manche en cours. Le
classement local garde les cinq meilleures cadences avec le nombre de manches ;
à cadence égale, la partie la plus longue passe devant.

Constantes, en tête de `interface.js` :

| Constante | Rôle | Valeur |
|---|---|---|
| `LIMITE_MANCHE` | temps imparti en rapide | 60 000 ms |
| `DELAI_SOLUTION` | déblocage de la solution en classique | 60 000 ms |
| `MANCHES_CLASSIQUE` | longueur d'une partie classique | 17 |

Les scores vivent dans `localStorage` : `bulles-scores-v1` (classique),
`bulles-classement-v1` (rapide), `bulles-partie-v2` (partie en cours).
