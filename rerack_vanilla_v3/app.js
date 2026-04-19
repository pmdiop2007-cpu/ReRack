/* =============================================
   RERACK – app.js  (partagé entre toutes les pages)
   Contient : authentification, header, toast
   ============================================= */

// ---- Auth helpers ----
function getUser() {
  try { return JSON.parse(localStorage.getItem('rerack-user')); } catch { return null; }
}
function logout() {
  localStorage.removeItem('rerack-user');
  window.location.href = 'index.html';
}

// ---- Render auth in header ----
function renderAuth() {
  const user = getUser();
  ['nav-auth', 'mobile-auth'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (user) {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <div class="user-chip">👤 ${escapeHtml(user.name)}</div>
          <button class="btn btn-outline btn-sm" onclick="logout()">Déconnexion</button>
        </div>`;
    } else {
      el.innerHTML = `<a href="login.html" class="btn btn-outline btn-sm">🔑 Connexion</a>`;
    }
  });
}

// ---- Mobile menu toggle ----
function initMobileMenu() {
  const btn = document.getElementById('menu-btn');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => {
    menu.classList.toggle('open');
    btn.textContent = menu.classList.contains('open') ? '✕' : '☰';
  });
}

// ---- Toast ----
let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ---- Escape HTML ----
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Init on load ----
document.addEventListener('DOMContentLoaded', () => {
  renderAuth();
  initMobileMenu();
});
