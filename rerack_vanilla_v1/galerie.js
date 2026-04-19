/* =============================================
   RERACK – galerie.js
   Gestion de la galerie communautaire
   ============================================= */

// ---- Projets par défaut ----
const DEFAULT_PROJECTS = [
  {
    id: '1', title: 'Bureau Minimaliste', author: 'Sarah Chen',
    image: 'https://images.unsplash.com/photo-1622579521534-8252f7da47fd?w=600&q=80',
    likes: 234, comments: 45, views: 1820, category: 'Table', featured: true,
    description: 'Un bureau parfait pour un espace de travail épuré',
  },
  {
    id: '2', title: 'Étagère Modulaire', author: 'Alex Rivera',
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80',
    likes: 189, comments: 32, views: 1456, category: 'Étagère', featured: true,
    description: "Système d'étagères flexible pour tous vos livres",
  },
  {
    id: '3', title: 'Chaise Contemporaine', author: 'Marie Johnson',
    image: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=600&q=80',
    likes: 312, comments: 67, views: 2134, category: 'Chaise', featured: true,
    description: 'Design ergonomique et élégant',
  },
  {
    id: '4', title: 'Table Basse Simple', author: 'Tom Anderson',
    image: 'https://images.unsplash.com/photo-1513161455079-7dc1de15ef3e?w=600&q=80',
    likes: 156, comments: 28, views: 987, category: 'Table',
    description: 'Parfaite pour un salon moderne',
  },
  {
    id: '5', title: 'Bibliothèque Murale', author: 'Emma Wilson',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80',
    likes: 198, comments: 41, views: 1345, category: 'Étagère',
    description: "Optimise l'espace vertical",
  },
  {
    id: '6', title: 'Bureau Ajustable', author: 'David Kim',
    image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&q=80',
    likes: 276, comments: 53, views: 1789, category: 'Table',
    description: 'Bureau debout pour une meilleure ergonomie',
  },
];

// ---- State ----
let allProjects = [];
let likedProjects = new Set();
let currentCategory = 'Tout';
let currentSort = 'likes';
let searchQuery = '';

// ---- Load data ----
function loadProjects() {
  const community = JSON.parse(localStorage.getItem('community-projects') || '[]');
  const formatted = community.map(p => ({
    id: p.id, title: p.title, author: p.author,
    image: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600&q=80',
    likes: p.likes || 0, comments: p.comments || 0, views: p.views || 0,
    category: 'Table', description: p.description, timestamp: p.timestamp,
  }));
  allProjects = [...DEFAULT_PROJECTS, ...formatted];
  likedProjects = new Set(JSON.parse(localStorage.getItem('liked-projects') || '[]'));
}

// ---- Filter & Sort ----
function getFiltered() {
  let list = allProjects;
  if (currentCategory !== 'Tout') list = list.filter(p => p.category === currentCategory);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  }
  if (currentSort === 'likes') list = [...list].sort((a, b) => b.likes - a.likes);
  else list = [...list].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return list;
}

// ---- Render card ----
function renderCard(project, featured = false) {
  const liked = likedProjects.has(project.id);
  return `
    <div class="project-card ${featured ? 'featured' : ''}" data-id="${project.id}">
      <div class="card-img-wrap">
        <img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.title)}" loading="lazy"
          onerror="this.src='https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80'" />
        ${featured ? '<div class="card-badge-featured">✨ Vedette</div>' : ''}
        <div class="card-badge-cat">${escapeHtml(project.category)}</div>
      </div>
      <div class="card-body">
        <h3>${escapeHtml(project.title)}</h3>
        <p class="card-author">par ${escapeHtml(project.author)}</p>
        ${project.description ? `<p class="card-desc">${escapeHtml(project.description)}</p>` : ''}
        <div class="card-stats">
          <button class="like-btn ${liked ? 'liked' : ''}" data-id="${project.id}">
            ${liked ? '❤️' : '🤍'} <span class="like-count">${project.likes}</span>
          </button>
          <div class="card-stat">💬 <span>${project.comments}</span></div>
          <div class="card-stat">👁 <span>${project.views}</span></div>
        </div>
      </div>
    </div>`;
}

// ---- Render all ----
function render() {
  const filtered = getFiltered();
  const featured = allProjects.filter(p => p.featured);

  const featuredSection = document.getElementById('featured-section');
  const featuredGrid = document.getElementById('featured-grid');
  const allGrid = document.getElementById('all-grid');
  const emptyState = document.getElementById('empty-state');
  const allTitle = document.getElementById('all-title');
  const count = document.getElementById('results-count');

  // Featured section only visible when no filter/search
  if (currentCategory === 'Tout' && !searchQuery) {
    featuredSection.style.display = '';
    featuredGrid.innerHTML = featured.map(p => renderCard(p, true)).join('');
  } else {
    featuredSection.style.display = 'none';
  }

  allTitle.textContent = currentCategory === 'Tout' ? 'Tous les Projets' : `Designs de ${currentCategory}`;
  count.textContent = `${filtered.length} projet${filtered.length !== 1 ? 's' : ''} trouvé${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    allGrid.innerHTML = '';
    emptyState.style.display = '';
  } else {
    emptyState.style.display = 'none';
    allGrid.innerHTML = filtered.map(p => renderCard(p)).join('');
  }

  // Attach like button events
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleLike(btn.dataset.id));
  });
}

// ---- Toggle like ----
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

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  loadProjects();
  render();

  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    render();
  });
  document.getElementById('cat-filter').addEventListener('change', e => {
    currentCategory = e.target.value;
    render();
  });
  document.getElementById('sort-filter').addEventListener('change', e => {
    currentSort = e.target.value;
    render();
  });
});
