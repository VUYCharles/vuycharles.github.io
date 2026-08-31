/* =========================================================================
   REBONDIS BULLES — RENDU PIXEL ART
   Dessine le plateau sur un canvas basse résolution (16 × 12 = 192 px de
   côté) agrandi en pixels nets. Le mouvement est purement visuel : l'état
   du jeu est déjà à jour dans le moteur quand l'animation démarre.
   ========================================================================= */

(function (M, global) {
  'use strict';

  var CASE = 12;                       // pixels internes par case
  var COTE = CASE * M.TAILLE;          // 192
  var MARGE = 2;                       // bord de la case autour d'une bulle
  var REBOND = 2;                      // profondeur du rebond, en pixels
  var MS_PAR_CASE = 20;                // vitesse : la bulle file à cadence fixe
  var MS_MIN = 60, MS_MAX = 340;
  var MS_REBOND = 70;

  /* Sprites 8 × 8. '#' = pixel plein. */
  var SPRITES = {
    cercle: [
      '..####..',
      '.######.',
      '########',
      '########',
      '########',
      '########',
      '.######.',
      '..####..'
    ],
    carre: [
      '########',
      '########',
      '########',
      '########',
      '########',
      '########',
      '########',
      '########'
    ],
    triangle: [
      '...##...',
      '...##...',
      '..####..',
      '..####..',
      '.######.',
      '.######.',
      '########',
      '########'
    ],
    etoile: [
      '...##...',
      '...##...',
      '..####..',
      '########',
      '########',
      '..####..',
      '...##...',
      '...##...'
    ]
  };
  SPRITES.vortex = SPRITES.cercle;

  var DECALAGES = {
    haut:   { dx: 0,  dy: -1 },
    droite: { dx: 1,  dy: 0  },
    bas:    { dx: 0,  dy: 1  },
    gauche: { dx: -1, dy: 0  }
  };

  var canvas = null, ctx = null, plateau = null;
  var etat = { positions: [0, 0, 0, 0], jetonIndex: 0, selection: 0, resolu: false };
  var anim = null;                     // { bulle, depuis, vers, dx, dy, debut, glisse, total }
  var boucle = null;
  var couleurs = {};

  /* ------------------------------------------------------------ THÈME --- */

  var REPLI = {
    '--fond': '#F2F5F4', '--carte': '#E4EBE8', '--brume': '#8A9CA8', '--texte': '#1E2D3A',
    '--jeu-rouge': '#C08A80', '--jeu-vert': '#8CB8A0', '--jeu-bleu': '#90A8C8', '--jeu-jaune': '#C0AC7C'
  };

  /* Accepte #rgb, #rrggbb et rgb(...). */
  function versRvb(c) {
    if (!c) return [0, 0, 0];
    if (c.charAt(0) === '#') {
      var h = c.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    var m = c.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  }

  /* Rapproche une couleur du fond : sert à éteindre les jetons non tirés
     sans recourir à la transparence, qui brouillerait les pixels. */
  function estomper(couleur, fond, part) {
    var a = versRvb(couleur), b = versRvb(fond);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * part) + ',' +
                    Math.round(a[1] + (b[1] - a[1]) * part) + ',' +
                    Math.round(a[2] + (b[2] - a[2]) * part) + ')';
  }

  function lireCouleurs() {
    var style = getComputedStyle(document.documentElement);
    function v(nom) { return (style.getPropertyValue(nom) || '').trim() || REPLI[nom]; }
    couleurs = {
      fond: v('--fond'),
      carte: v('--carte'),
      brume: v('--brume'),
      texte: v('--texte'),
      rouge: v('--jeu-rouge'),
      vert: v('--jeu-vert'),
      bleu: v('--jeu-bleu'),
      jaune: v('--jeu-jaune')
    };
  }

  function mouvementReduit() {
    return global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ----------------------------------------------------------- DESSIN --- */

  function pixel(x, y, w, h, couleur) {
    ctx.fillStyle = couleur;
    ctx.fillRect(x, y, w, h);
  }

  function plein(motif, x, y) {
    return x >= 0 && y >= 0 && x < 8 && y < 8 && motif[y][x] === '#';
  }

  /* Un pixel de contour : plein, mais bordant le vide. Les jetons sont
     dessinés en contour et les bulles en disque plein, pour qu'un jeton
     rond ne puisse jamais être confondu avec une bulle de même couleur. */
  function contour(motif, x, y) {
    if (!plein(motif, x, y)) return false;
    return !plein(motif, x - 1, y) || !plein(motif, x + 1, y) ||
           !plein(motif, x, y - 1) || !plein(motif, x, y + 1);
  }

  function sprite(motif, px, py, couleur, creux) {
    ctx.fillStyle = couleur;
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        if (creux ? !contour(motif, x, y) : motif[y][x] !== '#') continue;
        ctx.fillRect(px + x, py + y, 1, 1);
      }
    }
  }

  function spriteVortex(px, py, part) {
    var motif = SPRITES.cercle;
    var quart = [couleurs.rouge, couleurs.vert, couleurs.bleu, couleurs.jaune];
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        if (!contour(motif, x, y)) continue;
        var c = quart[(y < 4 ? 0 : 2) + (x < 4 ? 0 : 1)];
        ctx.fillStyle = part ? estomper(c, couleurs.fond, part) : c;
        ctx.fillRect(px + x, py + y, 1, 1);
      }
    }
  }

  function dessinerMurs() {
    for (var y = 0; y < M.TAILLE; y++) {
      for (var x = 0; x < M.TAILLE; x++) {
        var c = plateau.cellules[M.index(x, y)];
        /* Un mur est partagé par deux cases : on ne trace que le haut et la
           gauche, plus les deux bords extrêmes. Sinon chaque cloison
           apparaîtrait en double. */
        if (c.top)  pixel(x * CASE, y * CASE, CASE, 1, couleurs.brume);
        if (c.left) pixel(x * CASE, y * CASE, 1, CASE, couleurs.brume);
        if (y === M.TAILLE - 1 && c.bottom) pixel(x * CASE, COTE - 1, CASE, 1, couleurs.brume);
        if (x === M.TAILLE - 1 && c.right)  pixel(COTE - 1, y * CASE, 1, CASE, couleurs.brume);
      }
    }
  }

  function positionBulle(i) {
    var p = etat.positions[i];
    var px = M.colonne(p) * CASE + MARGE;
    var py = M.ligne(p) * CASE + MARGE;

    if (anim && anim.bulle === i) {
      var t = Date.now() - anim.debut;
      var dep = { x: M.colonne(anim.depuis) * CASE + MARGE, y: M.ligne(anim.depuis) * CASE + MARGE };
      if (t < anim.glisse) {
        /* Vitesse rigoureusement constante, du départ à l'impact : aucune
           courbe d'entrée ni de sortie. L'œil suit une vitesse uniforme bien
           mieux qu'une courbe, et un long trajet dure visiblement plus
           longtemps qu'un court — la distance reste lisible. */
        var k = t / anim.glisse;
        px = dep.x + (px + anim.dx * REBOND - dep.x) * k;
        py = dep.y + (py + anim.dy * REBOND - dep.y) * k;
      } else {
        /* Choc : le dépassement se résorbe d'un coup, en amorti. */
        var r = Math.min(1, (t - anim.glisse) / MS_REBOND);
        var retour = 1 - (1 - Math.pow(1 - r, 2));
        px += anim.dx * REBOND * retour;
        py += anim.dy * REBOND * retour;
      }
    }
    return { x: Math.round(px), y: Math.round(py) };
  }

  function dessiner() {
    if (!ctx) return;
    var jeton = plateau.jetons[etat.jetonIndex];
    var but = M.index(jeton.x, jeton.y);

    pixel(0, 0, COTE, COTE, couleurs.fond);

    /* Trame de fond. */
    for (var i = 1; i < M.TAILLE; i++) {
      pixel(i * CASE, 0, 1, COTE, couleurs.carte);
      pixel(0, i * CASE, COTE, 1, couleurs.carte);
    }

    /* Case visée : teintée de la couleur du jeton en jeu, pour qu'on la
       repère d'un coup d'œil sans avoir à lire la forme. */
    var teinte = jeton.couleur === 'vortex'
      ? couleurs.carte
      : estomper(couleurs[jeton.couleur], couleurs.fond, 0.8);
    pixel(M.colonne(but) * CASE, M.ligne(but) * CASE, CASE, CASE, teinte);
    pixel(7 * CASE, 7 * CASE, CASE * 2, CASE * 2, couleurs.carte);

    /* Jetons en contour : pleine couleur pour celui qui est en jeu,
       estompé vers le fond pour les autres. */
    plateau.jetons.forEach(function (j) {
      var px = j.x * CASE + MARGE, py = j.y * CASE + MARGE;
      var actif = M.index(j.x, j.y) === but;
      if (j.couleur === 'vortex') { spriteVortex(px, py, actif ? 0 : 0.5); return; }
      var c = actif ? couleurs[j.couleur] : estomper(couleurs[j.couleur], couleurs.fond, 0.5);
      sprite(SPRITES[j.forme], px, py, c, true);
    });

    dessinerMurs();

    /* Bulles. */
    for (var b = 0; b < 4; b++) {
      var pos = positionBulle(b);
      sprite(SPRITES.cercle, pos.x, pos.y, couleurs[M.COULEURS[b]], false);
    }

    /* Repère de sélection : un cadre d'un pixel autour de la case. */
    if (!etat.resolu) {
      var s = etat.positions[etat.selection];
      var sx = M.colonne(s) * CASE, sy = M.ligne(s) * CASE;
      ctx.fillStyle = couleurs.texte;
      ctx.fillRect(sx + 1, sy + 1, CASE - 2, 1);
      ctx.fillRect(sx + 1, sy + CASE - 2, CASE - 2, 1);
      ctx.fillRect(sx + 1, sy + 1, 1, CASE - 2);
      ctx.fillRect(sx + CASE - 2, sy + 1, 1, CASE - 2);
    }
  }

  /* --------------------------------------------------------- BOUCLE --- */

  function tourner() {
    dessiner();
    if (!anim) { boucle = null; return; }
    if (Date.now() - anim.debut >= anim.total) {
      anim = null;
      dessiner();
      boucle = null;
      return;
    }
    boucle = global.requestAnimationFrame(tourner);
  }

  function lancer() {
    if (boucle === null) boucle = global.requestAnimationFrame(tourner);
  }

  /* ------------------------------------------------------- API --- */

  var API = {
    init: function (element, plateauJeu) {
      plateau = plateauJeu;
      canvas = element;
      canvas.width = COTE;
      canvas.height = COTE;
      ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return;              // pas de contexte : le jeu reste jouable, sans dessin
      ctx.imageSmoothingEnabled = false;
      lireCouleurs();

      if (global.matchMedia) {
        var sombre = global.matchMedia('(prefers-color-scheme: dark)');
        var relire = function () { lireCouleurs(); dessiner(); };
        if (sombre.addEventListener) sombre.addEventListener('change', relire);
        else if (sombre.addListener) sombre.addListener(relire);
      }
    },

    /* Le plateau change à chaque partie : ses murs sont tirés au sort. */
    definirPlateau: function (nouveau) {
      plateau = nouveau;
      if (ctx) dessiner();
    },

    definirEtat: function (nouvel) {
      if (!ctx) return;
      etat.positions = nouvel.positions.slice();
      etat.jetonIndex = nouvel.jetonIndex;
      etat.selection = nouvel.selection;
      etat.resolu = nouvel.resolu;
      if (!anim) dessiner();
    },

    /* Le moteur a déjà déplacé la bulle : on rattrape visuellement. */
    animer: function (bulle, depuis, vers, direction) {
      if (!ctx) return;
      if (mouvementReduit()) { dessiner(); return; }
      if (anim) { anim = null; }                 // la précédente se termine net
      var d = DECALAGES[direction];
      var cases = Math.abs(M.colonne(vers) - M.colonne(depuis)) +
                  Math.abs(M.ligne(vers) - M.ligne(depuis));
      var glisse = Math.max(MS_MIN, Math.min(MS_MAX, cases * MS_PAR_CASE));
      anim = {
        bulle: bulle, depuis: depuis, vers: vers,
        dx: d.dx, dy: d.dy,
        debut: Date.now(), glisse: glisse, total: glisse + MS_REBOND
      };
      lancer();
    },

    /* Coordonnées écran → case du plateau, ou -1 hors grille. */
    caseDepuisPoint: function (clientX, clientY) {
      if (!canvas) return -1;
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return -1;
      var x = Math.floor((clientX - r.left) / r.width * M.TAILLE);
      var y = Math.floor((clientY - r.top) / r.height * M.TAILLE);
      if (x < 0 || y < 0 || x >= M.TAILLE || y >= M.TAILLE) return -1;
      return M.index(x, y);
    },

    rafraichir: function () { lireCouleurs(); dessiner(); },
    dessiner: dessiner
  };

  global.PlateauPixel = API;

})(window.MoteurBulles, window);
