/**
 * Routeur minimaliste + rendu des projets
 * Chargé sur toutes les pages
 */

document.addEventListener('DOMContentLoaded', () => {
  // Marquer le lien actif dans la navigation
  markActiveNavLink();

  // Rendre la grille projets si présente
  renderProjectsGrid('grid-perso', 'perso');
  renderProjectsGrid('grid-mcta', 'mcta');

  // Rendre la page détail projet si présente
  renderProjectDetail();
});

/**
 * Marque le lien actif dans la navigation selon la page courante
 */
function markActiveNavLink() {
  const currentPath = window.location.pathname;
  const links = document.querySelectorAll('.nav-links a');

  links.forEach(link => {
    link.classList.remove('active');
    const href = link.getAttribute('href');
    if (href && currentPath.endsWith(href.replace('./', ''))) {
      link.classList.add('active');
    }
  });
}

/**
 * Remplit une grille de projets
 * @param {string} gridId - ID de l'élément grille
 * @param {string} categorie - "perso" ou "mcta"
 */
function renderProjectsGrid(gridId, categorie) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  const projetsFiltres = projectsDB.filter(p => p.categorie === categorie);
  grid.innerHTML = '';

  if (projetsFiltres.length === 0) {
    grid.innerHTML = '<p style="font-family: var(--font-mono); color: var(--brume);">Aucun projet pour le moment.</p>';
    return;
  }

  projetsFiltres.forEach(projet => {
    const card = document.createElement('a');
    card.href = `projet.html?id=${projet.id}`;
    card.className = 'project-card';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = projet.title;

    const tag = document.createElement('div');
    tag.className = 'card-tag';
    tag.textContent = projet.tag;

    card.appendChild(title);
    card.appendChild(tag);
    grid.appendChild(card);
  });
}

/**
 * Remplit la page détail d'un projet si l'URL contient ?id=
 */
function renderProjectDetail() {
  const params = new URLSearchParams(window.location.search);
  const projetId = params.get('id');

  const titleEl = document.getElementById('detail-title');
  if (!titleEl || !projetId) return;

  const projet = projectsDB.find(p => p.id === projetId);
  if (!projet) {
    titleEl.textContent = 'Projet introuvable';
    return;
  }

  // Titre
  titleEl.textContent = projet.title;

  // Métadonnées
  const metaEl = document.getElementById('detail-meta');
  if (metaEl) {
    metaEl.textContent = `${projet.tag} • ${projet.date} • ${projet.statut}`;
  }

  // Description
  const descEl = document.getElementById('detail-desc');
  if (descEl) {
    descEl.textContent = projet.description;
  }

  // Bloc technique
  const techEl = document.getElementById('detail-tech');
  if (techEl && projet.tech) {
    techEl.innerHTML = '';
    for (const [label, valeur] of Object.entries(projet.tech)) {
      const line = document.createElement('div');
      line.className = 'tech-line';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'tech-label';
      labelSpan.textContent = `${label} :`;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'tech-value';

      if (label === 'Lien' && valeur.startsWith('http')) {
        const link = document.createElement('a');
        link.href = valeur;
        link.textContent = valeur;
        link.target = '_blank';
        link.rel = 'noopener';
        valueSpan.appendChild(link);
      } else {
        valueSpan.textContent = valeur;
      }

      line.appendChild(labelSpan);
      line.appendChild(valueSpan);
      techEl.appendChild(line);
    }
  }

  // Titre de la page
  document.title = `${projet.title} — Prénom NOM`;
}