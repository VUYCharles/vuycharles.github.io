/**
 * Base de données des projets
 * Structure :
 * {
 *   id: string unique,
 *   title: string,
 *   tag: string (minuscules, 1-2 mots),
 *   date: "YYYY-MM-DD",
 *   statut: "actif" | "terminé" | "en cours",
 *   description: string (2-3 phrases),
 *   tech: { Label: "Valeur", ... },
 *   categorie: "perso" | "mcta"
 * }
 */

const projectsDB = [
  // ----- PROJETS PERSONNELS -----
  { id: "perso-1",
    title: "Tournois de Pétanque",
    tag: "WebAPP",
    date: "2026-07-22",
    statut: "actif",
    description: "Entrez les équipes et organisez votre tournois de pétanque.",
    tech: { 
      Langage: "HTML - CSS - JS",
      Lien: "perso/petanque-tournoi.html" 
    },
    categorie: "perso"  // ou "mcta"
  },

  {
    id: "perso-2",
    title: "Dossier Locations",
    tag: "Automatisation",
    date: "2026-07-27",
    statut: "actif",
    description: "À partir du dossier original, filigrane les documents pdfs pour chaque demande.",
    tech: {
      Langage: "Python",
      Lien: "perso/dossier_loc.html"
    },
    categorie: "perso"
  },
//  {
//     id: "perso-2",
//     title: "Parser météo aéro",
//     tag: "météo",
//     date: "2026-03-22",
//     statut: "terminé",
//     description: "Extraction et mise en forme des données METAR/TAF. Affichage minimaliste pour une lecture rapide avant vol.",
//     tech: {
//       Langage: "JavaScript",
//       Runtime: "Node.js",
//       API: "AviationWeather",
//       Lien: "https://github.com/exemple/meteo-aero"
//     },
//     categorie: "perso"
//   },
  // {
  //   id: "perso-3",
  //   title: "Dashboard silencieux",
  //   tag: "interface",
  //   date: "2026-01-15",
  //   statut: "terminé",
  //   description: "Tableau de bord personnel sans distraction. Horloge, météo locale, liste de tâches. Rafraîchissement silencieux.",
  //   tech: {
  //     Langage: "HTML/CSS/JS",
  //     Stockage: "LocalStorage",
  //     Lien: "https://github.com/exemple/dashboard"
  //   },
  //   categorie: "perso"
  // },

  // ----- PROJETS MCTA (ENAC) -----
  {
    id: "mcta-1",
    title: "Scraper agenda Aurion",
    tag: "Agenda",
    date: "2026-06-01",
    statut: "en cours",
    description: "Récupère l'agenda Aurion de ta promo sur les 3 prochains mois et le met sur ton google agenda.",
    tech: {
      Langage: "Bash",
      Interface: "CLI",
      Lien: "en cours"
    },
    categorie: "mcta"
  },
  {
    id: "mcta-2",
    title: "ICAOGuesser",
    tag: "ICAO, WebAPP",
    date: "2026-07-01",
    statut: "terminé",
    description: "GeoGuesser pour les codes ICAO en France et Europe",
    tech: {
      Langage: "HTML - CSS - JS",
      Lien: "MCTA/ICAOguesser_horizon.html"
    },
    categorie: "mcta"
  },
  {
    id: "mcta-3",
    title: "InfoTraffic Trainer",
    tag: "InfoTraffic, WebAPP",
    date: "2026-07-10",
    statut: "terminé",
    description: "Génère x aéronefs aléatoirement sur la carte vac d'Auriol afin de s'entrainer à l'infotrafic.",
    tech: {
      Langage: "HTML - CSS - JS",
      Lien: "MCTA/InfoTrafficGuesser_horizon.html"
    },
    categorie: "mcta"
  }
];

// Tri par date décroissante
projectsDB.sort((a, b) => new Date(b.date) - new Date(a.date));

// Exporter pour les autres scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = projectsDB;
}
