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
| `MS_PAR_CASE` | temps par case, vitesse constante | 20 ms |
| `MS_MIN` / `MS_MAX` | bornes de durée | 60 / 340 ms |
| `REBOND` | profondeur du rebond à l'impact | 2 px |
| `MS_REBOND` | durée du retour | 70 ms |

La bulle file à vitesse rigoureusement constante, sans courbe d'entrée ni de
sortie, et s'arrête net sur l'obstacle. Un trajet de dix cases dure donc dix
fois plus qu'un trajet d'une case : la distance reste lisible à l'œil.

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


## Plateau aléatoire

Les emplacements des 17 jetons sont fixes — ils sont répartis par quadrant pour
garder un plateau équilibré — mais **l'orientation de chaque coin en « L » et
la position des huit murs de bord sont tirées au sort à chaque partie**.

La seule contrainte est qu'aucune case jouable ne doit se retrouver fermée sur
trois côtés : avec quatre côtés, trois murs sont forcément consécutifs, ce qui
crée un « U », une impasse à sortie unique. La pose est donc gloutonne — pour
chaque coin, les quatre orientations sont essayées dans un ordre aléatoire et
la première acceptable est retenue. Vérifié sur 500 graines : zéro U, zéro case
isolée, orientations équiréparties, et zéro jeton hors de portée de 13 coups.

**La graine circule.** Le solveur tourne dans un Worker qui reconstruit le
plateau de son côté : chaque requête porte donc la graine, sans quoi il
résoudrait un autre plateau que celui affiché. Elle est également sauvegardée
avec la partie en cours. `creerPlateau(graine)` est reproductible : même
graine, mêmes murs.

## Objectif masqué

Le nombre de coups optimal s'affiche `?` tant que le joueur n'a rien proposé.
Il se révèle dès qu'une solution est posée, ou dès que la manche se clôt. En
mode rapide, c'est ce qui rend la relance utile : on découvre l'objectif en
même temps que l'écart qui reste à combler.

## Consultation de la solution

| Mode | Quand |
|---|---|
| Classique | après 60 s de réflexion, **ou** après avoir résolu la manche, pour la relire |
| Rapide | dès que la manche est close, quel que soit le verdict |

Si l'objectif dépasse la profondeur de recherche d'entrée (13 coups), le
bouton propose « Chercher la solution » et relance une recherche à 20 coups —
moins d'une seconde, dans le Worker. Il n'existe donc plus de cas où le joueur
reste devant un bouton mort.

Relire une solution après avoir résolu ne modifie ni le décompte de la manche
ni la position de départ de la suivante : les deux sont figés au moment où la
manche est validée.
