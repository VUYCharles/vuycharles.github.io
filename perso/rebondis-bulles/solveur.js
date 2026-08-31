/* =========================================================================
   REBONDIS BULLES — SOLVEUR EN TÂCHE DE FOND
   Le calcul de l'objectif peut prendre jusqu'à ~1,5 s sur téléphone pour
   les jetons à 12-13 coups. Il tourne ici, dans un Worker, pour que le
   plateau reste réactif pendant ce temps.
   ========================================================================= */

importScripts('moteur.js');

var plateau = MoteurBulles.creerPlateau();

self.onmessage = function (e) {
  var d = e.data;
  var resultat = MoteurBulles.resoudre(
    plateau,
    d.positions,
    plateau.jetons[d.jeton],
    { profondeurMax: d.profondeurMax || 13 }
  );
  self.postMessage({
    id: d.id,
    optimal: resultat.optimal,
    chemin: resultat.chemin
  });
};
