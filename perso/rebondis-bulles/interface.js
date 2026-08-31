/* =========================================================================
   REBONDIS BULLES — INTERFACE
   Rendu, entrées, déroulement de la partie. Aucune règle de jeu ici :
   la physique et le solveur sont dans MoteurBulles.
   ========================================================================= */

(function (M) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var CLE_PARTIE = 'bulles-partie-v1';
  var CLE_SCORES = 'bulles-scores-v1';
  var DELAI_SOLUTION = 60000;     // la solution se débloque après 60 s de manche

  /* --------------------------------------------------------- FORMES --- */

  var FORMES = {
    cercle: '<circle cx="50" cy="50" r="34" fill="currentColor"/>',
    carre: '<rect x="17" y="17" width="66" height="66" rx="4" fill="currentColor"/>',
    triangle: '<polygon points="50,14 87,80 13,80" fill="currentColor"/>',
    etoile: '<polygon points="50,10 60,36.3 88,37.6 66.2,55.3 73.5,82.4 50,67 26.5,82.4 33.8,55.3 12,37.6 40,36.3" fill="currentColor"/>',
    vortex: [
      '<path d="M50 50 L50 16 A34 34 0 0 1 84 50 Z" fill="var(--jeu-rouge)"/>',
      '<path d="M50 50 L84 50 A34 34 0 0 1 50 84 Z" fill="var(--jeu-vert)"/>',
      '<path d="M50 50 L50 84 A34 34 0 0 1 16 50 Z" fill="var(--jeu-bleu)"/>',
      '<path d="M50 50 L16 50 A34 34 0 0 1 50 16 Z" fill="var(--jeu-jaune)"/>'
    ].join('')
  };

  var NOMS = { rouge: 'Rouge', vert: 'Verte', bleu: 'Bleue', jaune: 'Jaune', vortex: 'Vortex' };
  var NOMS_FORMES = { cercle: 'Cercle', carre: 'Carré', triangle: 'Triangle', etoile: 'Étoile' };
  var FLECHES = { haut: '↑', droite: '→', bas: '↓', gauche: '←' };

  function svgForme(jeton) {
    return '<svg viewBox="0 0 100 100" xmlns="' + NS + '" aria-hidden="true" ' +
      'style="color: var(--jeu-' + jeton.couleur + ')">' + FORMES[jeton.forme] + '</svg>';
  }

  function nomJeton(jeton) {
    if (jeton.couleur === 'vortex') return 'Vortex — n\'importe quelle bulle';
    return NOMS_FORMES[jeton.forme] + ' ' + NOMS[jeton.couleur];
  }

  /* ---------------------------------------------------------- ÉTAT --- */

  /* Le plateau est construit une fois pour toutes : il ne change jamais,
     ni entre les manches, ni entre les parties. */
  var plateau = M.creerPlateau();

  var jeu = {
    positions: [],        // position actuelle des 4 bulles
    departManche: [],     // position au début de la manche en cours
    paquet: [],           // indices des jetons restants (pioche sans remise)
    jetonIndex: -1,
    manche: 0,
    coups: 0,
    historique: [],
    selection: 0,
    optimal: null,        // null = en cours de calcul, -1 = plus de 13 coups
    chemin: null,
    resolu: false,
    assistee: false,
    terminee: false,
    totalCoups: 0,
    totalOptimal: 0,
    coupsMesures: 0,       // coups joués sur les manches dont l'optimal est connu
    manchesMesurees: 0,
    etapeSolution: 0
  };

  var chrono = { debut: 0, actif: false, timer: null, fige: 0, manche: 0 };
  var el = {};
  var cellules = [];
  var solveur = null;
  var demandeCourante = 0;

  /* ------------------------------------------------- SOLVEUR ASYNC --- */

  function creerSolveur() {
    try {
      var source = self.SOURCE_SOLVEUR;
      if (source) {
        var blob = new Blob([source], { type: 'text/javascript' });
        return new Worker(URL.createObjectURL(blob));
      }
      return new Worker('solveur.js');
    } catch (e) {
      return null;   // repli : calcul sur le fil principal
    }
  }

  function demanderObjectif() {
    demandeCourante++;
    var id = demandeCourante;
    var positions = jeu.positions.slice();
    var jetonIndex = jeu.jetonIndex;

    jeu.optimal = null;
    jeu.chemin = null;
    afficher();

    if (solveur) {
      solveur.postMessage({ id: id, positions: positions, jeton: jetonIndex, profondeurMax: 13 });
      return;
    }
    setTimeout(function () {
      var r = M.resoudre(plateau, positions, plateau.jetons[jetonIndex], { profondeurMax: 13 });
      recevoirObjectif(id, r.optimal, r.chemin);
    }, 20);
  }

  function recevoirObjectif(id, optimal, chemin) {
    if (id !== demandeCourante) return;    // réponse périmée
    jeu.optimal = optimal;
    jeu.chemin = chemin;
    afficher();
    sauvegarder();
  }

  /* -------------------------------------------------- CONSTRUCTION --- */

  function construirePlateau() {
    el.plateau.innerHTML = '';
    cellules = [];

    for (var y = 0; y < M.TAILLE; y++) {
      for (var x = 0; x < M.TAILLE; x++) {
        var c = document.createElement('div');
        c.className = 'case';
        c.dataset.pos = M.index(x, y);

        var jeton = plateau.jetons.filter(function (j) { return j.x === x && j.y === y; })[0];
        if (jeton) {
          var m = document.createElement('span');
          m.className = 'marque';
          m.innerHTML = svgForme(jeton);
          c.appendChild(m);
        }

        var b = document.createElement('span');
        b.className = 'bulle';
        c.appendChild(b);

        el.plateau.appendChild(c);
        cellules.push(c);
      }
    }
    el.plateau.appendChild(construireMurs());
  }

  function construireMurs() {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'couche-murs');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('preserveAspectRatio', 'none');

    var morceaux = [];
    for (var i = 1; i < 16; i++) {
      morceaux.push(trait(0, i, 16, i, 'var(--carte)', 1));
      morceaux.push(trait(i, 0, i, 16, 'var(--carte)', 1));
    }
    morceaux.push('<rect x="7" y="7" width="2" height="2" fill="var(--carte)"/>');

    for (var y = 0; y < 16; y++) {
      for (var x = 0; x < 16; x++) {
        var c = plateau.cellules[M.index(x, y)];
        if (c.top) morceaux.push(trait(x, y, x + 1, y, 'var(--brume)', 2));
        if (c.left) morceaux.push(trait(x, y, x, y + 1, 'var(--brume)', 2));
        if (y === 15 && c.bottom) morceaux.push(trait(x, 16, x + 1, 16, 'var(--brume)', 2));
        if (x === 15 && c.right) morceaux.push(trait(16, y, 16, y + 1, 'var(--brume)', 2));
      }
    }
    svg.innerHTML = morceaux.join('');
    return svg;
  }

  function trait(x1, y1, x2, y2, couleur, epaisseur) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="' + couleur + '" stroke-width="' + epaisseur +
      '" stroke-linecap="square" vector-effect="non-scaling-stroke"/>';
  }

  /* ------------------------------------------------------- PARTIE --- */

  function nouvellePartie() {
    jeu.positions = M.placerBulles(plateau);
    jeu.paquet = M.melangerPaquet();
    jeu.manche = 0;
    jeu.totalCoups = 0;
    jeu.totalOptimal = 0;
    jeu.coupsMesures = 0;
    jeu.manchesMesurees = 0;
    jeu.terminee = false;
    chrono.fige = 0;
    arreterChrono();
    piocher();
  }

  /* Pioche le jeton suivant depuis la position actuelle des bulles. */
  function piocher() {
    if (!jeu.paquet.length) { terminerPartie(); return; }

    /* Un jeton déjà satisfait par la position en cours ne ferait pas de
       manche : on le remet sous le paquet et on pioche le suivant. */
    var essais = 0;
    while (essais < jeu.paquet.length &&
           M.dejaPose(plateau, jeu.positions, plateau.jetons[jeu.paquet[0]])) {
      jeu.paquet.push(jeu.paquet.shift());
      essais++;
    }

    jeu.jetonIndex = jeu.paquet.shift();
    jeu.manche++;
    jeu.departManche = jeu.positions.slice();
    jeu.coups = 0;
    jeu.historique = [];
    jeu.resolu = false;
    jeu.assistee = false;
    jeu.etapeSolution = 0;
    jeu.selection = choisirBulleParDefaut();
    chrono.manche = maintenant();
    demanderObjectif();
    message('Manche ' + jeu.manche + ' sur 17. ' + texteAide());
  }

  function choisirBulleParDefaut() {
    var jeton = plateau.jetons[jeu.jetonIndex];
    return jeton.couleur === 'vortex' ? jeu.selection || 0 : M.COULEURS.indexOf(jeton.couleur);
  }

  function texteAide() {
    return estTactile()
      ? 'Fais glisser une bulle dans une direction.'
      : 'Choisis une bulle, puis lance-la avec les flèches.';
  }

  function rejouerManche() {
    if (jeu.terminee) return;
    jeu.positions = jeu.departManche.slice();
    jeu.coups = 0;
    jeu.historique = [];
    jeu.resolu = false;
    jeu.etapeSolution = 0;
    afficher();
    message('Manche ' + jeu.manche + ' remise à sa position de départ.');
    sauvegarder();
  }

  function annuler() {
    if (!jeu.historique.length || jeu.terminee) return;
    var avant = jeu.historique.pop();
    jeu.positions = avant.positions;
    jeu.selection = avant.selection;
    jeu.coups--;
    jeu.resolu = false;
    afficher();
    message('Coup annulé.');
    sauvegarder();
  }

  function mancheSuivante() {
    if (!jeu.resolu) return;
    jeu.totalCoups += jeu.coups;
    /* Une manche au-delà de 13 coups n'a pas d'optimal connu : elle compte
       dans le total mais reste hors du calcul de l'écart. */
    if (jeu.optimal > 0) {
      jeu.totalOptimal += jeu.optimal;
      jeu.coupsMesures += jeu.coups;
      jeu.manchesMesurees++;
    }
    piocher();
    sauvegarder();
  }

  function terminerPartie() {
    jeu.terminee = true;
    arreterChrono();
    var score = {
      date: Date.now(),
      coups: jeu.totalCoups,
      optimal: jeu.totalOptimal,
      coupsMesures: jeu.coupsMesures,
      manchesMesurees: jeu.manchesMesurees,
      temps: chrono.fige
    };
    enregistrerScore(score);
    afficher();
    afficherRecap(score);
    sauvegarder();
  }

  /* --------------------------------------------------- DÉPLACEMENT --- */

  function deplacer(direction) {
    if (jeu.resolu || jeu.terminee) return;
    var arrivee = M.glisserPosition(plateau, jeu.positions, jeu.selection, direction);
    if (arrivee === jeu.positions[jeu.selection]) return;

    jeu.historique.push({ positions: jeu.positions.slice(), selection: jeu.selection });
    jeu.positions[jeu.selection] = arrivee;
    jeu.coups++;
    demarrerChrono();
    vibrer(8);
    verifierVictoire();
    afficher();
    sauvegarder();
  }

  function verifierVictoire() {
    if (!M.dejaPose(plateau, jeu.positions, plateau.jetons[jeu.jetonIndex])) return;
    jeu.resolu = true;
    vibrer([10, 60, 10]);

    var texte = 'Manche ' + jeu.manche + ' résolue en ' + jeu.coups + ' coup' +
      (jeu.coups > 1 ? 's' : '') + '. ';
    if (jeu.assistee) texte += 'Solution consultée.';
    else if (jeu.optimal > 0 && jeu.coups === jeu.optimal) texte += 'Optimal.';
    else if (jeu.optimal > 0) texte += 'Optimal : ' + jeu.optimal + '.';

    if (jeu.paquet.length) texte += ' ' + jeu.paquet.length + ' jeton' +
      (jeu.paquet.length > 1 ? 's' : '') + ' restant' + (jeu.paquet.length > 1 ? 's' : '') + '.';
    else texte += ' Dernier jeton de la partie.';
    message(texte, 'resolu');
  }

  function vibrer(motif) {
    if (navigator.vibrate) { try { navigator.vibrate(motif); } catch (e) {} }
  }

  /* ----------------------------------------------------- SOLUTION --- */

  function solutionDisponible() {
    if (jeu.resolu || jeu.terminee || !jeu.chemin) return false;
    return maintenant() - chrono.manche >= DELAI_SOLUTION;
  }

  /* Avance d'un coup dans la solution optimale, à chaque clic. */
  function avancerSolution() {
    if (!jeu.chemin || jeu.resolu) return;
    jeu.assistee = true;
    if (jeu.etapeSolution === 0) {
      jeu.positions = jeu.departManche.slice();
      jeu.coups = 0;
      jeu.historique = [];
    }
    var coup = jeu.chemin[jeu.etapeSolution];
    jeu.selection = coup.bulle;
    jeu.positions[coup.bulle] = M.glisserPosition(plateau, jeu.positions, coup.bulle, coup.direction);
    jeu.coups++;
    jeu.etapeSolution++;
    verifierVictoire();
    afficher();
    if (!jeu.resolu) {
      message('Solution ' + jeu.etapeSolution + '/' + jeu.chemin.length + ' : ' +
        NOMS[M.COULEURS[coup.bulle]] + ' ' + FLECHES[coup.direction] + '.');
    }
    sauvegarder();
  }

  /* ------------------------------------------------------- CHRONO --- */

  function maintenant() { return Date.now(); }

  function demarrerChrono() {
    if (chrono.actif || jeu.terminee) return;
    chrono.actif = true;
    chrono.debut = Date.now() - chrono.fige;
    chrono.timer = setInterval(function () { afficherChrono(); majSolution(); }, 250);
  }

  function arreterChrono() {
    if (chrono.timer) clearInterval(chrono.timer);
    chrono.timer = null;
    if (chrono.actif) chrono.fige = Date.now() - chrono.debut;
    chrono.actif = false;
    afficherChrono();
  }

  function afficherChrono() {
    var ms = chrono.actif ? Date.now() - chrono.debut : chrono.fige;
    var s = Math.floor(ms / 1000);
    el.temps.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' +
      String(s % 60).padStart(2, '0');
  }

  function majSolution() {
    var dispo = solutionDisponible();
    el.solution.disabled = !dispo;
    el.solution.textContent = jeu.etapeSolution > 0 && jeu.chemin
      ? 'Solution ' + jeu.etapeSolution + '/' + jeu.chemin.length
      : 'Montrer la solution';
  }

  /* ------------------------------------------------------- SCORES --- */

  function lireScores() {
    try {
      var brut = localStorage.getItem(CLE_SCORES);
      var liste = brut ? JSON.parse(brut) : [];
      return Array.isArray(liste) ? liste : [];
    } catch (e) { return []; }
  }

  function enregistrerScore(score) {
    try {
      var liste = lireScores();
      liste.push(score);
      liste.sort(function (a, b) { return a.coups - b.coups || a.temps - b.temps; });
      localStorage.setItem(CLE_SCORES, JSON.stringify(liste.slice(0, 5)));
    } catch (e) { /* stockage indisponible */ }
  }

  function duree(ms) {
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0');
  }

  function afficherRecap(score) {
    var lignes = [];
    var mesurees = score.manchesMesurees === undefined ? 17 : score.manchesMesurees;
    var ecart = Math.max(0, (score.coupsMesures === undefined ? score.coups : score.coupsMesures) - score.optimal);
    lignes.push('<div class="ligne"><span>Coups joués</span><span class="valeur">' + score.coups + '</span></div>');
    lignes.push('<div class="ligne"><span>Écart à l\'optimal</span><span class="valeur">+' + ecart + '</span></div>');
    if (mesurees < 17) {
      lignes.push('<div class="ligne"><span>Manches mesurées</span><span class="valeur">' +
        mesurees + '/17</span></div>');
    }
    lignes.push('<div class="ligne"><span>Temps</span><span class="valeur">' + duree(score.temps) + '</span></div>');

    var meilleurs = lireScores();
    if (meilleurs.length > 1) {
      lignes.push('<div class="separateur"></div>');
      meilleurs.forEach(function (s, i) {
        lignes.push('<div class="ligne"><span>' + (i + 1) + '. ' +
          new Date(s.date).toLocaleDateString('fr-FR') + '</span><span class="valeur">' +
          s.coups + ' coups · ' + duree(s.temps) + '</span></div>');
      });
    }
    el.recap.innerHTML = lignes.join('');
    el.recap.hidden = false;
    message('Partie terminée : les 17 jetons sont passés.', 'resolu');
  }

  /* --------------------------------------------------- SAUVEGARDE --- */

  function sauvegarder() {
    try {
      localStorage.setItem(CLE_PARTIE, JSON.stringify({
        positions: jeu.positions, departManche: jeu.departManche, paquet: jeu.paquet,
        jetonIndex: jeu.jetonIndex, manche: jeu.manche, coups: jeu.coups,
        historique: jeu.historique, selection: jeu.selection, optimal: jeu.optimal,
        chemin: jeu.chemin, resolu: jeu.resolu, assistee: jeu.assistee,
        terminee: jeu.terminee, totalCoups: jeu.totalCoups, totalOptimal: jeu.totalOptimal,
        coupsMesures: jeu.coupsMesures, manchesMesurees: jeu.manchesMesurees,
        temps: chrono.actif ? Date.now() - chrono.debut : chrono.fige
      }));
    } catch (e) { /* stockage indisponible : pas de reprise */ }
  }

  function reprendre() {
    var brut = null;
    try { brut = localStorage.getItem(CLE_PARTIE); } catch (e) { return false; }
    if (!brut) return false;
    try {
      var s = JSON.parse(brut);
      if (!s || !Array.isArray(s.positions) || s.positions.length !== 4) return false;
      if (!Array.isArray(s.paquet) || !plateau.jetons[s.jetonIndex]) return false;
      if (s.terminee) return false;

      jeu.positions = s.positions.slice();
      jeu.departManche = (s.departManche || s.positions).slice();
      jeu.paquet = s.paquet.slice();
      jeu.jetonIndex = s.jetonIndex;
      jeu.manche = s.manche || 1;
      jeu.coups = s.coups || 0;
      jeu.historique = s.historique || [];
      jeu.selection = s.selection || 0;
      jeu.optimal = typeof s.optimal === 'number' ? s.optimal : null;
      jeu.chemin = s.chemin || null;
      jeu.resolu = !!s.resolu;
      jeu.assistee = !!s.assistee;
      jeu.totalCoups = s.totalCoups || 0;
      jeu.totalOptimal = s.totalOptimal || 0;
      jeu.coupsMesures = s.coupsMesures || 0;
      jeu.manchesMesurees = s.manchesMesurees || 0;
      chrono.fige = s.temps || 0;
      chrono.manche = maintenant();

      if (jeu.optimal === null) demanderObjectif();
      afficher();
      message('Partie reprise — manche ' + jeu.manche + ' sur 17.');
      return true;
    } catch (e) { return false; }
  }

  /* -------------------------------------------------------- RENDU --- */

  function afficher() {
    var jeton = plateau.jetons[jeu.jetonIndex];
    var but = M.index(jeton.x, jeton.y);

    for (var i = 0; i < cellules.length; i++) {
      var c = cellules[i];
      var bulle = c.lastChild;
      var k = jeu.positions.indexOf(i);

      c.className = 'case' + (i === but ? ' cible-active' : '') +
        (k !== -1 && !jeu.resolu ? ' jouable' : '');

      if (k === -1) {
        bulle.className = 'bulle';
        c.removeAttribute('role');
        c.removeAttribute('tabindex');
        c.removeAttribute('aria-label');
      } else {
        bulle.className = 'bulle active ' + M.COULEURS[k] +
          (k === jeu.selection ? ' selectionnee' : '');
        c.setAttribute('role', 'button');
        c.setAttribute('tabindex', '0');
        c.setAttribute('aria-label', 'Bulle ' + NOMS[M.COULEURS[k]]);
      }
    }

    el.vignette.innerHTML = svgForme(jeton);
    el.libelleJeton.textContent = nomJeton(jeton);
    el.manche.textContent = jeu.manche + '/17';
    el.coups.textContent = jeu.coups;
    el.objectif.textContent = jeu.optimal === null ? '…' : (jeu.optimal < 0 ? '13+' : jeu.optimal);
    el.selection.textContent = NOMS[M.COULEURS[jeu.selection]];
    el.annuler.disabled = jeu.historique.length === 0 || jeu.terminee;
    el.rejouer.disabled = jeu.terminee;
    el.suivante.disabled = !jeu.resolu && !jeu.terminee;
    el.suivante.textContent = jeu.terminee ? 'Nouvelle partie'
      : (jeu.paquet.length ? 'Manche suivante' : 'Terminer la partie');
    majSolution();
    afficherChrono();
  }

  function message(texte, classe) {
    el.message.textContent = texte;
    el.message.className = 'message' + (classe ? ' ' + classe : '');
  }

  /* ------------------------------------------------------ ENTRÉES --- */

  var TOUCHES = {
    ArrowUp: 'haut', ArrowRight: 'droite', ArrowDown: 'bas', ArrowLeft: 'gauche',
    z: 'haut', d: 'droite', s: 'bas', q: 'gauche', w: 'gauche'
  };

  function estTactile() {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  }

  function selectionner(cellule) {
    var i = jeu.positions.indexOf(Number(cellule.dataset.pos));
    if (i === -1) return false;
    jeu.selection = i;
    afficher();
    return true;
  }

  function brancher() {
    el.plateau.addEventListener('click', function (ev) {
      var c = ev.target.closest('.case');
      if (c) selectionner(c);
    });

    el.plateau.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var c = ev.target.closest('.case');
      if (c && selectionner(c)) ev.preventDefault();
    });

    /* Glissement du doigt : c'est la commande principale sur téléphone.
       Si le geste part d'une bulle, c'est elle qui est lancée. */
    var depart = null;
    el.plateau.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 1) { depart = null; return; }
      var t = ev.touches[0];
      var cellule = document.elementFromPoint(t.clientX, t.clientY);
      cellule = cellule && cellule.closest ? cellule.closest('.case') : null;
      depart = { x: t.clientX, y: t.clientY, cellule: cellule };
    }, { passive: true });

    el.plateau.addEventListener('touchend', function (ev) {
      if (!depart) return;
      var t = ev.changedTouches[0];
      var dx = t.clientX - depart.x, dy = t.clientY - depart.y;
      var ax = Math.abs(dx), ay = Math.abs(dy);
      var cellule = depart.cellule;
      depart = null;

      if (Math.max(ax, ay) < 20) {                   // simple appui : sélection
        if (cellule) selectionner(cellule);
        return;
      }
      ev.preventDefault();
      if (cellule) selectionner(cellule);            // le geste part d'une bulle
      deplacer(ax > ay ? (dx > 0 ? 'droite' : 'gauche') : (dy > 0 ? 'bas' : 'haut'));
    }, { passive: false });

    document.addEventListener('keydown', function (ev) {
      var dir = TOUCHES[ev.key];
      if (dir) { ev.preventDefault(); deplacer(dir); return; }
      if (ev.key === 'Tab' && !ev.shiftKey && ev.target === document.body) {
        ev.preventDefault();
        jeu.selection = (jeu.selection + 1) % 4;
        afficher();
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-direction]'), function (b) {
      b.addEventListener('click', function () { deplacer(b.dataset.direction); });
    });

    el.annuler.addEventListener('click', annuler);
    el.rejouer.addEventListener('click', rejouerManche);
    el.solution.addEventListener('click', avancerSolution);
    el.suivante.addEventListener('click', function () {
      if (jeu.terminee) { el.recap.hidden = true; nouvellePartie(); }
      else mancheSuivante();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { arreterChrono(); sauvegarder(); }
    });
  }

  /* --------------------------------------------------- DÉMARRAGE --- */

  document.addEventListener('DOMContentLoaded', function () {
    ['plateau', 'vignette', 'libelle-jeton', 'manche', 'coups', 'objectif', 'temps',
     'selection', 'message', 'recap', 'annuler', 'rejouer', 'solution', 'suivante']
      .forEach(function (id) {
        el[id.replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] =
          document.getElementById(id);
      });

    solveur = creerSolveur();
    if (solveur) {
      solveur.onmessage = function (e) {
        recevoirObjectif(e.data.id, e.data.optimal, e.data.chemin);
      };
      solveur.onerror = function () { solveur = null; };
    }

    construirePlateau();
    if (!reprendre()) nouvellePartie();
    brancher();

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  });

})(window.MoteurBulles);
