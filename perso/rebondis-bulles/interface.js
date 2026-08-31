/* =========================================================================
   REBONDIS BULLES — INTERFACE
   Déroulement des parties, entrées, tableau de bord.
   Aucune règle de plateau ici : la physique et le solveur sont dans
   MoteurBulles, le dessin dans PlateauPixel.
   ========================================================================= */

(function (M) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var CLE_PARTIE = 'bulles-partie-v2';
  var CLE_SCORES = 'bulles-scores-v1';          // mode classique
  var CLE_CLASSEMENT = 'bulles-classement-v1';  // mode rapide

  var MANCHES_CLASSIQUE = 17;
  var DELAI_SOLUTION = 60000;   // classique : la solution se débloque après 60 s
  var LIMITE_MANCHE = 60000;    // rapide : temps imparti pour répondre

  /* --------------------------------------------------------- FORMES --- */

  var FORMES = {
    cercle: '<circle cx="50" cy="50" r="34" fill="currentColor"/>',
    carre: '<rect x="17" y="17" width="66" height="66" rx="4" fill="currentColor"/>',
    triangle: '<polygon points="50,14 87,80 13,80" fill="currentColor"/>',
    etoile: '<polygon points="50,12 62,38 88,50 62,62 50,88 38,62 12,50 38,38" fill="currentColor"/>',
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

  var plateau = M.creerPlateau();

  var jeu = {
    mode: 'classique',
    positions: [],
    departManche: [],
    positionsSuivantes: null,   // position d'où repartira la manche suivante
    paquet: [],
    jetonIndex: -1,
    manche: 0,
    coups: 0,
    historique: [],
    selection: 0,
    optimal: null,              // null = calcul en cours, -1 = plus de 13 coups
    chemin: null,
    resolu: false,              // la manche est close
    assistee: false,
    terminee: false,
    etapeSolution: 0,
    solutionOuverte: false,

    /* classique */
    totalCoups: 0,
    totalOptimal: 0,
    coupsMesures: 0,
    manchesMesurees: 0,

    /* rapide */
    points: 0,
    manchesJouees: 0,
    tempsCompte: 0,             // temps de jeu seul, hors consultation des solutions
    meilleurCoups: null,        // meilleure réponse trouvée dans la manche
    meilleuresPositions: null,
    verdict: null
  };

  var chrono = { debut: 0, actif: false, timer: null, fige: 0 };
  var manche = { debut: 0, cumule: 0, timer: null, close: false };

  var el = {};
  var solveur = null;
  var demandeCourante = 0;

  function rapide() { return jeu.mode === 'rapide'; }

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
    if (id !== demandeCourante) return;     // réponse périmée
    jeu.optimal = optimal;
    jeu.chemin = chemin;
    /* Une réponse a pu être donnée avant que l'objectif ne revienne :
       on la juge maintenant. */
    if (rapide() && !manche.close && jeu.meilleurCoups !== null) evaluerReponse();
    afficher();
    sauvegarder();
  }

  /* ------------------------------------------------------- PARTIE --- */

  function nouvellePartie(mode) {
    if (mode) jeu.mode = mode;
    jeu.positions = M.placerBulles(plateau);
    jeu.positionsSuivantes = null;
    jeu.paquet = M.melangerPaquet();
    jeu.manche = 0;
    jeu.terminee = false;
    jeu.totalCoups = 0;
    jeu.totalOptimal = 0;
    jeu.coupsMesures = 0;
    jeu.manchesMesurees = 0;
    jeu.points = 0;
    jeu.manchesJouees = 0;
    jeu.tempsCompte = 0;
    chrono.fige = 0;
    arreterChrono();
    el.recap.hidden = true;
    piocher();
  }

  function piocher() {
    if (!rapide() && !jeu.paquet.length) { terminerPartie(); return; }
    if (rapide() && !jeu.paquet.length) jeu.paquet = M.melangerPaquet();

    if (jeu.positionsSuivantes) {
      jeu.positions = jeu.positionsSuivantes.slice();
      jeu.positionsSuivantes = null;
    }

    /* Un jeton déjà satisfait par la position en cours ne ferait pas de
       manche : il repart sous le paquet. */
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
    jeu.solutionOuverte = false;
    jeu.meilleurCoups = null;
    jeu.meilleuresPositions = null;
    jeu.verdict = null;
    jeu.selection = bulleParDefaut();
    manche.close = false;

    demarrerMinuteurManche(0);
    demanderObjectif();

    if (rapide()) message('Manche ' + jeu.manche + '. Une minute pour trouver le meilleur trajet.');
    else message('Manche ' + jeu.manche + ' sur ' + MANCHES_CLASSIQUE + '. ' + texteAide());
  }

  function bulleParDefaut() {
    var jeton = plateau.jetons[jeu.jetonIndex];
    return jeton.couleur === 'vortex' ? (jeu.selection || 0) : M.COULEURS.indexOf(jeton.couleur);
  }

  function texteAide() {
    return estTactile()
      ? 'Fais glisser une bulle dans une direction.'
      : 'Choisis une bulle, puis lance-la avec les flèches.';
  }
/*
  function rejouerManche() {
    if (jeu.terminee || manche.close) return;
    jeu.positions = jeu.departManche.slice();
    jeu.coups = 0;
    jeu.historique = [];
    jeu.etapeSolution = 0;
    afficher();
    message('Position de départ de la manche rétablie.');
    sauvegarder();
  }

  function annuler() {
    if (!jeu.historique.length || jeu.terminee || manche.close) return;
    var avant = jeu.historique.pop();
    jeu.positions = avant.positions;
    jeu.selection = avant.selection;
    jeu.coups--;
    afficher();
    message('Coup annulé.');
    sauvegarder();
  }
*/

function rejouerManche() {
    if (jeu.terminee || manche.close) return;
    jeu.positions = jeu.departManche.slice();
    jeu.coups = 0;
    jeu.historique = [];
    jeu.etapeSolution = 0;
    
    // NOUVEAU : On redébloque la partie
    jeu.resolu = false;
    
    afficher();
    message('Position de départ de la manche rétablie.');
    sauvegarder();
  }

  function annuler() {
    if (!jeu.historique.length || jeu.terminee || manche.close) return;
    var avant = jeu.historique.pop();
    jeu.positions = avant.positions;
    jeu.selection = avant.selection;
    jeu.coups--;
    
    // NOUVEAU : On redébloque la partie si on avait gagné
    jeu.resolu = false;
    
    afficher();
    message('Coup annulé.');
    sauvegarder();
  }
  function mancheSuivante() {
    if (!jeu.resolu) return;
    if (!rapide()) {
      jeu.totalCoups += jeu.coups;
      if (jeu.optimal > 0) {
        jeu.totalOptimal += jeu.optimal;
        jeu.coupsMesures += jeu.coups;
        jeu.manchesMesurees++;
      }
    }
    piocher();
    sauvegarder();
  }

  /* --------------------------------------------------- DÉPLACEMENT --- */

  function deplacer(direction) {
    if (jeu.resolu || jeu.terminee || manche.close) return;
    var arrivee = M.glisserPosition(plateau, jeu.positions, jeu.selection, direction);
    if (arrivee === jeu.positions[jeu.selection]) return;

    var depuis = jeu.positions[jeu.selection];
    jeu.historique.push({ positions: jeu.positions.slice(), selection: jeu.selection });
    jeu.positions[jeu.selection] = arrivee;
    jeu.coups++;
    PlateauPixel.animer(jeu.selection, depuis, arrivee, direction);
    demarrerChrono();
    vibrer(8);
    verifierVictoire();
    afficher();
    sauvegarder();
  }

  function verifierVictoire() {
    if (!M.dejaPose(plateau, jeu.positions, plateau.jetons[jeu.jetonIndex])) return;

    if (!rapide()) {
      jeu.resolu = true;
      suspendreMinuteurManche();
      vibrer([10, 60, 10]);
      var texte = 'Manche ' + jeu.manche + ' résolue en ' + jeu.coups + ' coup' +
        (jeu.coups > 1 ? 's' : '') + '. ';
      if (jeu.assistee) texte += 'Solution consultée.';
      else if (jeu.optimal > 0 && jeu.coups === jeu.optimal) texte += 'Optimal.';
      else if (jeu.optimal > 0) texte += 'Optimal : ' + jeu.optimal + '.';
      texte += jeu.paquet.length
        ? ' ' + jeu.paquet.length + ' jeton' + (jeu.paquet.length > 1 ? 's' : '') + ' restant' +
          (jeu.paquet.length > 1 ? 's' : '') + '.'
        : ' Dernier jeton de la partie.';
      message(texte, 'resolu');
      return;
    }

    /* Mode rapide : la réponse est enregistrée, mais la manche reste ouverte
       tant que la minute n'est pas écoulée — le joueur peut viser mieux. */
    if (jeu.meilleurCoups === null || jeu.coups < jeu.meilleurCoups) {
      jeu.meilleurCoups = jeu.coups;
      jeu.meilleuresPositions = jeu.positions.slice();
    }
    vibrer([10, 60, 10]);
    evaluerReponse();
  }

  /* Une réponse vient d'être posée : clôt la manche si elle est optimale,
     sinon remet le plateau en place pour une nouvelle tentative. */
  function evaluerReponse() {
    if (manche.close) return;
    if (jeu.optimal === null) {
      message('Réponse en ' + jeu.meilleurCoups + ' coups. Vérification en cours…');
      return;
    }
    var atteint = jeu.optimal < 0 ? true : jeu.meilleurCoups <= jeu.optimal;
    if (atteint) { cloturerManche('optimal'); return; }

    jeu.positions = jeu.departManche.slice();
    jeu.coups = 0;
    jeu.historique = [];
    PlateauPixel.definirEtat(etatRendu());
    message('Réponse en ' + jeu.meilleurCoups + ' coups enregistrée, l\'optimal est à ' +
      jeu.optimal + '. Encore ' + Math.ceil(resteManche() / 1000) + ' s pour faire mieux.');
  }

  function resteManche() {
    return Math.max(0, LIMITE_MANCHE - tempsManche());
  }

  function cloturerManche(verdict) {
    if (manche.close) return;
    manche.close = true;
    jeu.resolu = true;
    jeu.verdict = verdict;
    suspendreMinuteurManche();

    var duree = Math.min(tempsManche(), LIMITE_MANCHE);
    jeu.tempsCompte += duree;
    jeu.manchesJouees++;

    var gagnes = 0;
    if (verdict === 'optimal') {
      /* Point plein, plus un bonus au prorata du temps gagné sur la minute. */
      gagnes = 1 + Math.max(0, (LIMITE_MANCHE - duree) / LIMITE_MANCHE);
      jeu.positionsSuivantes = (jeu.meilleuresPositions || jeu.positions).slice();
      message('Optimal en ' + jeu.meilleurCoups + ' coups, ' + Math.round(duree / 1000) +
        ' s. +' + gagnes.toFixed(2) + ' points.', 'resolu');
    } else if (verdict === 'partiel') {
      /* Au prorata de la distance à l'optimal. */
      gagnes = jeu.optimal > 0 ? jeu.optimal / jeu.meilleurCoups : 1;
      jeu.positionsSuivantes = jeu.meilleuresPositions.slice();
      message('Temps écoulé. Meilleure réponse : ' + jeu.meilleurCoups + ' coups contre ' +
        jeu.optimal + ' possibles. +' + gagnes.toFixed(2) + ' point.', 'resolu');
    } else {
      jeu.positionsSuivantes = jeu.departManche.slice();
      message('Temps écoulé, aucune réponse. La solution est à disposition, ' +
        'prends le temps de la regarder.', 'resolu');
    }
    jeu.points += gagnes;

    /* La solution n'est proposée que si le joueur n'a rien produit dans la
       minute, ou s'il a trouvé l'optimum. Une réponse perfectible a déjà eu
       sa chance : la partie enchaîne. */
    /* jeu.solutionOuverte = (verdict !== 'partiel'); */
    jeu.solutionOuverte = true;
    afficher();
    sauvegarder();
  }

  function finManche() {          // la minute s'épuise
    if (!rapide() || manche.close) return;
    cloturerManche(jeu.meilleurCoups === null ? 'zero' : 'partiel');
  }

  function terminerPartie() {
    jeu.terminee = true;
    suspendreMinuteurManche();
    arreterChrono();
    
    // NOUVEAU : Demander le pseudo
    var pseudoJoueur = prompt("Partie terminée ! Entrez votre pseudo pour le classement :", "Joueur") || "Anonyme";

    if (rapide()) {
      /* Une manche interrompue n'est ni comptée ni chronométrée : elle ne
         doit pas dégrader la cadence de la partie. */
      var score = {
        pseudo: pseudoJoueur, // Ajout du pseudo
        date: Date.now(),
        manches: jeu.manchesJouees,
        points: Math.round(jeu.points * 100) / 100,
        temps: jeu.tempsCompte,
        taux: Math.round(cadence() * 100) / 100
      };
      enregistrer(CLE_CLASSEMENT, score,
        function (a, b) { return b.taux - a.taux || b.manches - a.manches; });
      afficherRecapRapide(score);
    } else {
      var s = {
        pseudo: pseudoJoueur, // Ajout du pseudo
        date: Date.now(),
        coups: jeu.totalCoups,
        optimal: jeu.totalOptimal,
        coupsMesures: jeu.coupsMesures,
        manchesMesurees: jeu.manchesMesurees,
        temps: chrono.fige
      };
      enregistrer(CLE_SCORES, s,
        function (a, b) { return a.coups - b.coups || a.temps - b.temps; });
      afficherRecapClassique(s);
    }
    afficher();
    sauvegarder();
  }

  /* Cadence : chaque manche vaut une minute pleine, qu'elle ait été bouclée
     en cinq secondes ou en cinquante-neuf. La vitesse est déjà récompensée
     par le bonus ; la compter aussi au dénominateur la paierait deux fois et
     ferait exploser le classement sur les seules manches très courtes. */
  function cadence() {
    return jeu.manchesJouees > 0 ? jeu.points / jeu.manchesJouees : 0;
  }

  /* ----------------------------------------------------- SOLUTION --- */

  function avancerSolution() {
    if (!jeu.chemin) return;
    jeu.assistee = true;
    if (jeu.etapeSolution === 0) {
      jeu.positions = jeu.departManche.slice();
      jeu.coups = 0;
      jeu.historique = [];
    }
    var coup = jeu.chemin[jeu.etapeSolution];
    jeu.selection = coup.bulle;
    var origine = jeu.positions[coup.bulle];
    jeu.positions[coup.bulle] = M.glisserPosition(plateau, jeu.positions, coup.bulle, coup.direction);
    PlateauPixel.animer(coup.bulle, origine, jeu.positions[coup.bulle], coup.direction);
    jeu.coups++;
    jeu.etapeSolution++;

    if (rapide()) {
      /* Consultation libre : elle ne coûte ni temps compté, ni point. */
      afficher();
      message(jeu.etapeSolution >= jeu.chemin.length
        ? 'Solution complète en ' + jeu.chemin.length + ' coups.'
        : 'Solution ' + jeu.etapeSolution + '/' + jeu.chemin.length + ' : ' +
          NOMS[M.COULEURS[coup.bulle]] + ' ' + FLECHES[coup.direction] + '.');
      return;
    }

    verifierVictoire();
    afficher();
    if (!jeu.resolu) {
      message('Solution ' + jeu.etapeSolution + '/' + jeu.chemin.length + ' : ' +
        NOMS[M.COULEURS[coup.bulle]] + ' ' + FLECHES[coup.direction] + '.');
    }
    sauvegarder();
  }

  /* ----------------------------------------------------- MINUTEURS --- */

  function tempsManche() {
    return manche.cumule + (manche.debut ? Date.now() - manche.debut : 0);
  }

  function demarrerMinuteurManche(cumuleInitial) {
    arreterMinuteurManche();
    manche.cumule = cumuleInitial || 0;
    manche.debut = Date.now();
    manche.timer = setInterval(battre, 250);
    battre();
  }

  function suspendreMinuteurManche() {
    if (manche.debut) { manche.cumule += Date.now() - manche.debut; manche.debut = 0; }
    arreterMinuteurManche();
  }

  function arreterMinuteurManche() {
    if (manche.timer) { clearInterval(manche.timer); manche.timer = null; }
  }

  /* Battement commun : décompte du mode rapide, déblocage de la solution
     en classique. Il court dès la révélation du jeton, sans attendre un coup. */
  function battre() {
    if (rapide() && !manche.close && !jeu.terminee && tempsManche() >= LIMITE_MANCHE) {
      finManche();
      return;
    }
    majCompteurs();
    majSolution();
  }

  function demarrerChrono() {
    if (chrono.actif || jeu.terminee) return;
    chrono.actif = true;
    chrono.debut = Date.now() - chrono.fige;
    chrono.timer = setInterval(afficherChrono, 250);
  }

  function arreterChrono() {
    if (chrono.timer) clearInterval(chrono.timer);
    chrono.timer = null;
    if (chrono.actif) chrono.fige = Date.now() - chrono.debut;
    chrono.actif = false;
    afficherChrono();
  }

  function mmss(ms) {
    var s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function afficherChrono() {
    if (el.temps) el.temps.textContent = mmss(chrono.actif ? Date.now() - chrono.debut : chrono.fige);
  }

  function duree(ms) {
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0');
  }

  function majSolution() {
    if (jeu.terminee) { el.solution.disabled = true; return; }

    if (jeu.etapeSolution > 0 && jeu.chemin) {
      el.solution.disabled = jeu.etapeSolution >= jeu.chemin.length;
      el.solution.textContent = 'Solution ' + jeu.etapeSolution + '/' + jeu.chemin.length;
      return;
    }
    if (rapide()) {
      el.solution.disabled = !(manche.close && jeu.solutionOuverte && jeu.chemin);
      el.solution.textContent = manche.close && !jeu.solutionOuverte
        ? 'Solution — passée' : 'Montrer la solution';
      return;
    }
    if (jeu.resolu) {
      el.solution.disabled = true;
      el.solution.textContent = 'Montrer la solution';
      return;
    }
    var reste = DELAI_SOLUTION - tempsManche();
    if (reste > 0) {
      el.solution.disabled = true;
      el.solution.textContent = 'Solution dans ' + Math.ceil(reste / 1000) + ' s';
      return;
    }
    if (!jeu.chemin) {
      el.solution.disabled = true;
      el.solution.textContent = jeu.optimal === null ? 'Solution — calcul…' : 'Solution indisponible';
      return;
    }
    arreterMinuteurManche();
    el.solution.disabled = false;
    el.solution.textContent = 'Montrer la solution';
  }

  /* -------------------------------------------------------- SCORES --- */

  function lire(cle) {
    try {
      var brut = localStorage.getItem(cle);
      var liste = brut ? JSON.parse(brut) : [];
      return Array.isArray(liste) ? liste : [];
    } catch (e) { return []; }
  }

  function enregistrer(cle, score, tri) {
    try {
      var liste = lire(cle);
      liste.push(score);
      liste.sort(tri);
      localStorage.setItem(cle, JSON.stringify(liste.slice(0, 5)));
    } catch (e) { /* stockage indisponible */ }
  }

  function ligne(gauche, droite) {
    return '<div class="ligne"><span>' + gauche + '</span><span class="valeur">' + droite + '</span></div>';
  }

  function afficherRecapClassique(score) {
    var mesurees = score.manchesMesurees === undefined ? MANCHES_CLASSIQUE : score.manchesMesurees;
    var ecart = Math.max(0, (score.coupsMesures === undefined ? score.coups : score.coupsMesures) - score.optimal);
    var l = [ligne('Coups joués', score.coups), ligne('Écart à l\'optimal', '+' + ecart)];
    if (mesurees < MANCHES_CLASSIQUE) l.push(ligne('Manches mesurées', mesurees + '/' + MANCHES_CLASSIQUE));
    l.push(ligne('Temps', duree(score.temps)));

    var meilleurs = lire(CLE_SCORES);
    if (meilleurs.length > 1) {
      l.push('<div class="separateur"></div>');
        meilleurs.forEach(function (s, i) {
                var nomAffiche = s.pseudo ? s.pseudo : 'Anonyme';
                l.push(ligne((i + 1) + '. ' + nomAffiche + ' (' + new Date(s.date).toLocaleDateString('fr-FR') + ')',
                  s.coups + ' coups · ' + duree(s.temps)));
              });
    }
    el.recap.innerHTML = l.join('');
    el.recap.hidden = false;
    message('Partie terminée : les ' + MANCHES_CLASSIQUE + ' jetons sont passés.', 'resolu');
  }

  function afficherRecapRapide(score) {
    var l = [
      ligne('Cadence', score.taux.toFixed(2) + ' pts/min'),
      ligne('Manches', score.manches),
      ligne('Points', score.points.toFixed(2)),
      ligne('Temps réel', duree(score.temps))
    ];
    var classement = lire(CLE_CLASSEMENT);
    if (classement.length) {
      l.push('<div class="separateur"></div>');
        classement.forEach(function (s, i) {
                // NOUVEAU : Ajout du pseudo devant la date
                var nomAffiche = s.pseudo ? s.pseudo : 'Anonyme';
                l.push(ligne((i + 1) + '. ' + nomAffiche + ' (' + new Date(s.date).toLocaleDateString('fr-FR') + ')' +
                  (s.date === score.date ? ' — actuel' : ''),
                  s.taux.toFixed(2) + ' pts/min · ' + s.manches + ' manches'));
              });
    }
    el.recap.innerHTML = l.join('');
    el.recap.hidden = false;
    message('Partie rapide terminée.', 'resolu');
  }

  /* ---------------------------------------------------- SAUVEGARDE --- */

  function sauvegarder() {
    try {
      localStorage.setItem(CLE_PARTIE, JSON.stringify({
        mode: jeu.mode, positions: jeu.positions, departManche: jeu.departManche,
        positionsSuivantes: jeu.positionsSuivantes, paquet: jeu.paquet,
        jetonIndex: jeu.jetonIndex, manche: jeu.manche, coups: jeu.coups,
        historique: jeu.historique, selection: jeu.selection, optimal: jeu.optimal,
        chemin: jeu.chemin, resolu: jeu.resolu, assistee: jeu.assistee,
        terminee: jeu.terminee, totalCoups: jeu.totalCoups, totalOptimal: jeu.totalOptimal,
        coupsMesures: jeu.coupsMesures, manchesMesurees: jeu.manchesMesurees,
        points: jeu.points, manchesJouees: jeu.manchesJouees, tempsCompte: jeu.tempsCompte,
        temps: chrono.actif ? Date.now() - chrono.debut : chrono.fige,
        tempsManche: tempsManche(), close: manche.close
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
      /* Une manche rapide close ne se reprend pas en l'état : son décompte
         est terminé. On repart proprement sur la manche suivante. */
      if (s.mode === 'rapide' && s.close) return false;

      jeu.mode = s.mode === 'rapide' ? 'rapide' : 'classique';
      jeu.positions = s.positions.slice();
      jeu.departManche = (s.departManche || s.positions).slice();
      jeu.positionsSuivantes = s.positionsSuivantes || null;
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
      jeu.points = s.points || 0;
      jeu.manchesJouees = s.manchesJouees || 0;
      jeu.tempsCompte = s.tempsCompte || 0;
      chrono.fige = s.temps || 0;
      manche.close = false;

      demarrerMinuteurManche(rapide() ? (s.tempsManche || 0) : (s.tempsManche || 0));
      if (jeu.optimal === null) demanderObjectif();
      afficher();
      message('Partie reprise — manche ' + jeu.manche + '.');
      return true;
    } catch (e) { return false; }
  }

  /* --------------------------------------------------------- RENDU --- */

  function etatRendu() {
    return {
      positions: jeu.positions,
      jetonIndex: jeu.jetonIndex,
      selection: jeu.selection,
      resolu: jeu.resolu
    };
  }
/*
  function majCompteurs() {
    el.manche.textContent = rapide() ? jeu.manche : jeu.manche + '/' + MANCHES_CLASSIQUE;
    el.coups.textContent = jeu.coups;
    // NOUVEAU : On cache l'objectif si aucune réponse n'a été soumise et que la manche est en cours
    var cacherObjectif = jeu.optimal === null || (jeu.meilleurCoups === null && !jeu.resolu);
    el.objectif.textContent = cacherObjectif ? '…' : (jeu.optimal < 0 ? '13+' : jeu.optimal);
    
    el.objectif.textContent = jeu.optimal === null ? '…' : (jeu.optimal < 0 ? '13+' : jeu.optimal);

    if (rapide()) {
      el.restant.textContent = Math.ceil((manche.close ? 0 : resteManche()) / 1000) + ' s';
      el.points.textContent = jeu.points.toFixed(2);
      el.taux.textContent = cadence().toFixed(2);
    } else {
      afficherChrono();
    }
  }*/
  
  function majCompteurs() {
    el.manche.textContent = rapide() ? jeu.manche : jeu.manche + '/' + MANCHES_CLASSIQUE;
    el.coups.textContent = jeu.coups;
    
    // NOUVEAU : On cache l'objectif si aucune réponse n'a été soumise et que la manche est en cours
    var cacherObjectif = jeu.optimal === null || (jeu.meilleurCoups === null && !jeu.resolu);
    el.objectif.textContent = cacherObjectif ? '…' : (jeu.optimal < 0 ? '13+' : jeu.optimal);
    
    // SUPPRIME LA LIGNE QUI ÉTAIT ICI !

    if (rapide()) {
      el.restant.textContent = Math.ceil((manche.close ? 0 : resteManche()) / 1000) + ' s';
      el.points.textContent = jeu.points.toFixed(2);
      el.taux.textContent = cadence().toFixed(2);
    } else {
      afficherChrono();
    }
  }

  function afficher() {
    var jeton = plateau.jetons[jeu.jetonIndex];

    PlateauPixel.definirEtat(etatRendu());

    el.plateau.setAttribute('aria-label',
      'Plateau 16 par 16. Jeton : ' + nomJeton(jeton) +
      '. Bulle sélectionnée : ' + NOMS[M.COULEURS[jeu.selection]] + '.');

    el.compteurs.dataset.mode = jeu.mode;
    el.vignette.innerHTML = svgForme(jeton);
    el.libelleJeton.textContent = nomJeton(jeton);
    el.selection.textContent = NOMS[M.COULEURS[jeu.selection]];

    var bloque = jeu.terminee || manche.close;
    el.annuler.disabled = jeu.historique.length === 0 || bloque;
    el.rejouer.disabled = bloque;
    el.terminer.hidden = !rapide();
    el.terminer.disabled = jeu.terminee;
    el.suivante.disabled = !jeu.resolu && !jeu.terminee;
    el.suivante.textContent = jeu.terminee ? 'Nouvelle partie'
      : (rapide() || jeu.paquet.length ? 'Manche suivante' : 'Terminer la partie');

    Array.prototype.forEach.call(el.modes, function (b) {
      var actif = b.dataset.mode === jeu.mode;
      b.classList.toggle('actif', actif);
      b.setAttribute('aria-pressed', actif ? 'true' : 'false');
    });

    majCompteurs();
    majSolution();
  }

  function message(texte, classe) {
    el.message.textContent = texte;
    el.message.className = 'message' + (classe ? ' ' + classe : '');
  }

  /* -------------------------------------------------------- ENTRÉES --- */

  var TOUCHES = {
    ArrowUp: 'haut', ArrowRight: 'droite', ArrowDown: 'bas', ArrowLeft: 'gauche',
    z: 'haut', d: 'droite', s: 'bas', q: 'gauche', w: 'gauche'
  };

  function estTactile() {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  }

  function selectionnerCase(pos) {
    var i = jeu.positions.indexOf(pos);
    if (i === -1) return false;
    jeu.selection = i;
    afficher();
    return true;
  }

  function brancher() {
    el.plateau.addEventListener('click', function (ev) {
      selectionnerCase(PlateauPixel.caseDepuisPoint(ev.clientX, ev.clientY));
    });

    el.plateau.addEventListener('mousemove', function (ev) {
      var pos = PlateauPixel.caseDepuisPoint(ev.clientX, ev.clientY);
      el.plateau.style.cursor =
        (!jeu.resolu && jeu.positions.indexOf(pos) !== -1) ? 'pointer' : 'default';
    });

    var depart = null;
    el.plateau.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 1) { depart = null; return; }
      var t = ev.touches[0];
      depart = { x: t.clientX, y: t.clientY, pos: PlateauPixel.caseDepuisPoint(t.clientX, t.clientY) };
    }, { passive: true });

    el.plateau.addEventListener('touchend', function (ev) {
      if (!depart) return;
      var t = ev.changedTouches[0];
      var dx = t.clientX - depart.x, dy = t.clientY - depart.y;
      var ax = Math.abs(dx), ay = Math.abs(dy);
      var pos = depart.pos;
      depart = null;
      if (Math.max(ax, ay) < 20) { selectionnerCase(pos); return; }
      ev.preventDefault();
      selectionnerCase(pos);
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

    Array.prototype.forEach.call(el.modes, function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.mode === jeu.mode) return;
        nouvellePartie(b.dataset.mode);
        message(b.dataset.mode === 'rapide'
          ? 'Mode rapide : une minute par manche, cadence en points par minute.'
          : 'Mode classique : les ' + MANCHES_CLASSIQUE + ' jetons, sans limite de temps.');
      });
    });

    el.annuler.addEventListener('click', annuler);
    el.rejouer.addEventListener('click', rejouerManche);
    el.solution.addEventListener('click', avancerSolution);
    el.terminer.addEventListener('click', function () { if (!jeu.terminee) terminerPartie(); });
    el.suivante.addEventListener('click', function () {
      if (jeu.terminee) { el.recap.hidden = true; nouvellePartie(); }
      else mancheSuivante();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        arreterChrono();
        suspendreMinuteurManche();
        sauvegarder();
      } else if (!jeu.terminee && !manche.close && !jeu.resolu) {
        demarrerMinuteurManche(manche.cumule);
      }
    });
  }

  function vibrer(motif) {
    if (navigator.vibrate) { try { navigator.vibrate(motif); } catch (e) {} }
  }

  /* ------------------------------------------------------ DÉMARRAGE --- */

  document.addEventListener('DOMContentLoaded', function () {
    ['plateau', 'vignette', 'libelle-jeton', 'compteurs', 'manche', 'coups', 'objectif',
     'temps', 'restant', 'points', 'taux', 'selection', 'message', 'recap',
     'annuler', 'rejouer', 'solution', 'terminer', 'suivante']
      .forEach(function (id) {
        el[id.replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] =
          document.getElementById(id);
      });
    el.modes = document.querySelectorAll('[data-mode]');

    solveur = creerSolveur();
    if (solveur) {
      solveur.onmessage = function (e) {
        recevoirObjectif(e.data.id, e.data.optimal, e.data.chemin);
      };
      solveur.onerror = function () { solveur = null; };
    }

    PlateauPixel.init(el.plateau, plateau);
    if (!reprendre()) nouvellePartie();
    brancher();

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  });

})(window.MoteurBulles);
