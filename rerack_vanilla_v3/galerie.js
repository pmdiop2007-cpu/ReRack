/* ================================================================
   RERACK — galerie.js  v3
   ----------------------------------------------------------------
   CE FICHIER GÈRE :
   1. Données des projets par défaut (projets exemples)
   2. Chargement des projets communautaires (depuis localStorage)
   3. Filtrage et tri
   4. Rendu des cartes de projet
   5. Modal de détail projet (avec modification des dimensions)
   6. Likes
   ================================================================ */


/* ================================================================
   1. PROJETS EXEMPLES (projets vedettes prédéfinis)
   Pour ajouter un projet exemple, copiez un objet ci-dessous.
   ================================================================ */
const DEFAULT_PROJECTS = [
  {
    id: '1',
    title: 'Bureau Minimaliste',
    author: 'Sarah Chen',
    image: 'https://images.unsplash.com/photo-1622579521534-8252f7da47fd?w=600&q=80',
    likes: 234, comments: 45, views: 1820,
    category: 'Table',
    featured: true,
    description: 'Un bureau parfait pour un espace de travail épuré avec profilés 74×74.',
    bounds: { W: 140, H: 76, D: 70 }, // dimensions en cm (Largeur, Hauteur, Profondeur)
  },
  {
    id: '2',
    title: 'Étagère Modulaire',
    author: 'Alex Rivera',
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80',
    likes: 189, comments: 32, views: 1456,
    category: 'Étagère',
    featured: true,
    description: "Système d'étagères flexible pour tous vos livres, modulable en hauteur.",
    bounds: { W: 80, H: 180, D: 30 },
  },
  {
    id: '3',
    title: 'Chaise Contemporaine',
    author: 'Marie Johnson',
    image: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=600&q=80',
    likes: 312, comments: 67, views: 2134,
    category: 'Chaise',
    featured: true,
    description: 'Design ergonomique et élégant, entièrement en plastique recyclé.',
    bounds: { W: 50, H: 90, D: 55 },
  },
  {
    id: '4',
    title: 'Table Basse Simple',
    author: 'Tom Anderson',
    image: 'https://images.unsplash.com/photo-1513161455079-7dc1de15ef3e?w=600&q=80',
    likes: 156, comments: 28, views: 987,
    category: 'Table',
    description: 'Parfaite pour un salon moderne, hauteur 42 cm.',
    bounds: { W: 120, H: 42, D: 60 },
  },
  {
    id: '5',
    title: 'Bibliothèque Murale',
    author: 'Emma Wilson',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80',
    likes: 198, comments: 41, views: 1345,
    category: 'Étagère',
    description: "Optimise l'espace vertical sur un mur, 5 niveaux.",
    bounds: { W: 100, H: 200, D: 25 },
  },
  {
    id: '6',
    title: 'Bureau Ajustable',
    author: 'David Kim',
    image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&q=80',
    likes: 276, comments: 53, views: 1789,
    category: 'Table',
    description: 'Bureau debout pour une meilleure ergonomie, réglable.',
    bounds: { W: 160, H: 110, D: 80 },
  },
];


/* ================================================================
   2. ÉTAT GLOBAL
   ================================================================ */
let allProjects    = [];
let likedProjects  = new Set();
let currentCategory = 'Tout';
let currentSort    = 'likes';
let searchQuery    = '';
let currentDetailId = null; // id du projet ouvert dans le modal de détail


/* ================================================================
   3. CHARGEMENT DES DONNÉES
   ================================================================ */
function loadProjects() {
  // Charge les projets communautaires depuis localStorage
  const community = JSON.parse(localStorage.getItem('community-projects') || '[]');

  // Formate les projets communautaires
  const formatted = community.map(p => ({
    id:          p.id,
    title:       p.title,
    author:      p.author,
    // Utilise la photo uploadée si disponible, sinon une image par défaut
    image:       p.image || 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&q=80',
    likes:       p.likes    || 0,
    comments:    p.comments || 0,
    views:       p.views    || 0,
    category:    p.category || 'Autre',
    description: p.description,
    timestamp:   p.timestamp,
    bounds:      p.bounds   || { W: 0, H: 0, D: 0 }, // dimensions sauvegardées depuis l'éditeur
    isCommunity: true,  // flag pour identifier les projets modifiables
  }));

  // Combine projets par défaut + communautaires
  allProjects   = [...DEFAULT_PROJECTS, ...formatted];
  likedProjects = new Set(JSON.parse(localStorage.getItem('liked-projects') || '[]'));
}


/* ================================================================
   4. FILTRAGE & TRI
   ================================================================ */
function getFiltered() {
  let list = allProjects;

  // Filtre par catégorie
  if (currentCategory !== 'Tout') list = list.filter(p => p.category === currentCategory);

  // Filtre par recherche textuelle
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p =>
      p.title.toLowerCase().includes(q)      ||
      p.author.toLowerCase().includes(q)     ||
      (p.description || '').toLowerCase().includes(q)
    );
  }

  // Tri
  if (currentSort === 'likes') {
    list = [...list].sort((a, b) => b.likes - a.likes);
  } else {
    // Tri par date (projets sans date → fin de liste)
    list = [...list].sort((a, b) =>
      new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
    );
  }
  return list;
}


/* ================================================================
   5. RENDU DES CARTES
   ================================================================ */

/* Génère le HTML d'une carte de projet */
function renderCard(project, featured = false) {
  const liked    = likedProjects.has(project.id);
  // Affichage des dimensions si disponibles
  const dimsHtml = project.bounds && (project.bounds.W || project.bounds.H || project.bounds.D)
    ? `<div class="card-dims">
        ${project.bounds.W ? `<span class="card-dim-badge">L ${project.bounds.W}cm</span>` : ''}
        ${project.bounds.H ? `<span class="card-dim-badge">H ${project.bounds.H}cm</span>` : ''}
        ${project.bounds.D ? `<span class="card-dim-badge">P ${project.bounds.D}cm</span>` : ''}
       </div>`
    : '';

  return `
    <div class="project-card ${featured ? 'featured' : ''}" data-id="${project.id}" onclick="openDetail('${project.id}')">
      <div class="card-img-wrap">
        <img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}" loading="lazy"
          onerror="this.src='https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80'" />
        ${featured ? '<div class="card-badge-featured">✨ Vedette</div>' : ''}
        ${project.isCommunity ? '<div class="card-badge-featured" style="background:#7c3aed;top:12px;left:12px;right:auto">👥 Communauté</div>' : ''}
        <div class="card-badge-cat">${escapeHtml(project.category)}</div>
      </div>
      <div class="card-body">
        <h3>${escapeHtml(project.title)}</h3>
        <p class="card-author">par ${escapeHtml(project.author)}</p>
        ${dimsHtml}
        ${project.description ? `<p class="card-desc">${escapeHtml(project.description)}</p>` : ''}
        <div class="card-stats">
          <button class="like-btn ${liked ? 'liked' : ''}" data-id="${project.id}" onclick="event.stopPropagation();toggleLike('${project.id}')">
            ${liked ? '❤️' : '🤍'} <span class="like-count">${project.likes}</span>
          </button>
          <div class="card-stat">💬 <span>${project.comments}</span></div>
          <div class="card-stat">👁 <span>${project.views.toLocaleString()}</span></div>
        </div>
      </div>
    </div>`;
}

/* Rendu complet de la galerie */
function render() {
  const filtered       = getFiltered();
  const featured       = allProjects.filter(p => p.featured);
  const featuredSection = document.getElementById('featured-section');
  const featuredGrid   = document.getElementById('featured-grid');
  const allGrid        = document.getElementById('all-grid');
  const emptyState     = document.getElementById('empty-state');
  const allTitle       = document.getElementById('all-title');
  const count          = document.getElementById('results-count');

  // Section vedette : visible seulement sans filtre ni recherche
  const showFeatured = (currentCategory === 'Tout' && !searchQuery);
  featuredSection.style.display = showFeatured ? '' : 'none';
  if (showFeatured) {
    featuredGrid.innerHTML = featured.map(p => renderCard(p, true)).join('');
  }

  // Titre dynamique
  allTitle.textContent = currentCategory === 'Tout' ? 'Tous les Projets' : `Designs – ${currentCategory}`;

  // Compteur de résultats
  count.textContent = `${filtered.length} projet${filtered.length !== 1 ? 's' : ''} trouvé${filtered.length !== 1 ? 's' : ''}`;

  // Grille principale
  if (filtered.length === 0) {
    allGrid.innerHTML = '';
    emptyState.style.display = '';
  } else {
    emptyState.style.display = 'none';
    allGrid.innerHTML = filtered.map(p => renderCard(p)).join('');
  }
}


/* ================================================================
   6. MODAL DÉTAIL PROJET
   ================================================================ */

/* Ouvre le modal de détail pour un projet */
function openDetail(id) {
  const project = allProjects.find(p => p.id === id);
  if (!project) return;

  currentDetailId = id;
  document.getElementById('detail-title').textContent = project.title;

  // Incrémente les vues (seulement pour les projets en mémoire)
  project.views++;

  const b = project.bounds || { W: 0, H: 0, D: 0 };
  // Les projets communautaires ont des dimensions modifiables
  const isMod = !!project.isCommunity;

  document.getElementById('detail-body').innerHTML = `
    <!-- Image principale -->
    <div style="border-radius:12px;overflow:hidden;margin-bottom:16px;max-height:280px">
      <img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}"
        style="width:100%;height:280px;object-fit:cover;"
        onerror="this.src='https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80'" />
    </div>

    <!-- Auteur + catégorie -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div>
        <div style="font-size:16px;font-weight:700">${escapeHtml(project.title)}</div>
        <div style="font-size:13px;color:#9ca3af;margin-top:2px">par ${escapeHtml(project.author)} · ${escapeHtml(project.category)}</div>
      </div>
      <div style="display:flex;gap:12px;font-size:14px;color:#9ca3af">
        <span>❤️ ${project.likes}</span>
        <span>💬 ${project.comments}</span>
        <span>👁 ${project.views}</span>
      </div>
    </div>

    ${project.description ? `<p style="font-size:14px;color:#4b5563;line-height:1.6;margin-bottom:16px">${escapeHtml(project.description)}</p>` : ''}

    <!-- Dimensions (modifiables pour les projets communautaires, lecture seule sinon) -->
    <div style="margin-bottom:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af">
      Dimensions globales${isMod ? ' <span style="color:#059669;font-weight:600;font-size:11px">(modifiables)</span>' : ''}
    </div>
    <div class="detail-dims">
      <div class="detail-dim-card">
        <div class="detail-dim-label">Largeur</div>
        ${isMod
          ? `<input class="detail-dim-input" id="dim-W" type="number" value="${b.W}" min="1" max="500" />`
          : `<div class="detail-dim-value">${b.W || '—'} cm</div>`}
        ${isMod ? '' : '<div style="font-size:11px;color:#9ca3af;margin-top:2px">cm</div>'}
      </div>
      <div class="detail-dim-card">
        <div class="detail-dim-label">Hauteur</div>
        ${isMod
          ? `<input class="detail-dim-input" id="dim-H" type="number" value="${b.H}" min="1" max="500" />`
          : `<div class="detail-dim-value">${b.H || '—'} cm</div>`}
        ${isMod ? '' : '<div style="font-size:11px;color:#9ca3af;margin-top:2px">cm</div>'}
      </div>
      <div class="detail-dim-card">
        <div class="detail-dim-label">Profondeur</div>
        ${isMod
          ? `<input class="detail-dim-input" id="dim-D" type="number" value="${b.D}" min="1" max="500" />`
          : `<div class="detail-dim-value">${b.D || '—'} cm</div>`}
        ${isMod ? '' : '<div style="font-size:11px;color:#9ca3af;margin-top:2px">cm</div>'}
      </div>
    </div>

    ${isMod
      ? `<p style="font-size:12px;color:#9ca3af;margin-top:4px">
          Modifiez les dimensions ci-dessus selon vos besoins, puis cliquez "Sauvegarder les dimensions".
          Ces modifications sont sauvegardées localement sur votre appareil.
        </p>`
      : `<p style="font-size:12px;color:#9ca3af;margin-top:4px">
          Ce projet est un exemple de la galerie ReRack. Créez votre propre version dans l'éditeur !
        </p>`}

    <!-- Bouton ouvrir dans l'éditeur -->
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6">
      <a href="editeur.html" class="btn btn-success w-full">🧱 Ouvrir l'éditeur pour créer le vôtre</a>
    </div>`;

  // Affiche ou cache le bouton "Sauvegarder les dimensions"
  document.getElementById('btn-save-dims').style.display = isMod ? '' : 'none';

  document.getElementById('detail-modal').style.display = 'flex';
}

/* Sauvegarde les dimensions modifiées d'un projet communautaire */
function saveDetailDims() {
  const project = allProjects.find(p => p.id === currentDetailId);
  if (!project || !project.isCommunity) return;

  const W = parseInt(document.getElementById('dim-W')?.value) || 0;
  const H = parseInt(document.getElementById('dim-H')?.value) || 0;
  const D = parseInt(document.getElementById('dim-D')?.value) || 0;

  project.bounds = { W, H, D };

  // Sauvegarde dans localStorage
  const community = JSON.parse(localStorage.getItem('community-projects') || '[]');
  const idx = community.findIndex(p => p.id === currentDetailId);
  if (idx !== -1) { community[idx].bounds = { W, H, D }; localStorage.setItem('community-projects', JSON.stringify(community)); }

  showToast('Dimensions sauvegardées !', 'success');
  render(); // remet à jour les badges de dimensions dans les cards
}


/* ================================================================
   7. LIKES
   ================================================================ */
function toggleLike(id) {
  const project = allProjects.find(p => p.id === id);
  if (!project) return;
  if (likedProjects.has(id)) {
    likedProjects.delete(id);
    project.likes--;
  } else {
    likedProjects.add(id);
    project.likes++;
  }
  localStorage.setItem('liked-projects', JSON.stringify(Array.from(likedProjects)));
  render();
}


/* ================================================================
   8. INITIALISATION
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadProjects();
  render();

  /* Ombre header au scroll */
  window.addEventListener('scroll', () => {
    document.getElementById('header').classList.toggle('scrolled', window.scrollY > 10);
  });

  /* Filtres */
  document.getElementById('search-input').addEventListener('input', e => { searchQuery = e.target.value; render(); });
  document.getElementById('cat-filter').addEventListener('change',  e => { currentCategory = e.target.value; render(); });
  document.getElementById('sort-filter').addEventListener('change', e => { currentSort = e.target.value; render(); });

  /* Modal détail */
  document.getElementById('close-detail').addEventListener('click',   () => document.getElementById('detail-modal').style.display = 'none');
  document.getElementById('close-detail-2').addEventListener('click', () => document.getElementById('detail-modal').style.display = 'none');
  document.getElementById('btn-save-dims').addEventListener('click',  saveDetailDims);
  document.getElementById('detail-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  /* Animation au scroll pour les cards */
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.12 });

  // Ré-observe après chaque render (MutationObserver)
  const grids = document.querySelectorAll('.gallery-grid');
  const mutObs = new MutationObserver(() => {
    document.querySelectorAll('.project-card').forEach(card => {
      card.style.opacity   = '0';
      card.style.transform = 'translateY(20px)';
      card.style.transition = `opacity 0.45s ease, transform 0.45s ease`;
      observer.observe(card);
    });
  });
  grids.forEach(g => mutObs.observe(g, { childList: true }));
});
