/* =============================================
   RERACK – editeur.js
   Éditeur 2D : canvas, profilés, propriétés, coût, fiche technique
   ============================================= */

// ---- Données des profilés ----
const PROFILE_TYPES = [
  {
    id: 'profile-74x74', name: 'Profilé 74×74', type: 'beam',
    color: '#10b981', fixedWidth: 7.4, fixedHeight: 7.4,
    defaultLength: 190, maxLength: 190, pricePerUnit: 5000, weightPerUnit: 8,
  },
  {
    id: 'profile-36x36', name: 'Profilé 36×36', type: 'beam',
    color: '#059669', fixedWidth: 3.6, fixedHeight: 3.6,
    defaultLength: 190, maxLength: 190, pricePerUnit: 1400, weightPerUnit: 2.4,
  },
  {
    id: 'plank-120x25', name: 'Planche 120×25', type: 'plank',
    color: '#3b82f6', fixedWidth: 12, fixedHeight: 2.5,
    defaultLength: 185, maxLength: 185, pricePerUnit: 2600, weightPerUnit: 4.5,
  },
  {
    id: 'plank-100x30', name: 'Planche 100×30', type: 'plank',
    color: '#2563eb', fixedWidth: 10, fixedHeight: 3,
    defaultLength: 185, maxLength: 185, pricePerUnit: 2600, weightPerUnit: 4.5,
  },
];

const SCALE = 3;       // 1 cm = 3 px
const GRID = 5;        // grille de 5 cm

// ---- State ----
let profiles = [];
let selectedId = null;
let snapToGrid = true;
let dragState = null;   // { id, offX, offY }
let canvas, ctx;

// ---- Init canvas ----
function initCanvas() {
  canvas = document.getElementById('editor-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('dblclick', onDblClick);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
}

function resizeCanvas() {
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  redraw();
}

// ---- Draw ----
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  profiles.forEach(p => drawProfile(p));
  updateHint();
}

function drawGrid() {
  if (!snapToGrid) return;
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  const step = GRID * SCALE;
  for (let x = 0; x < canvas.width; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
}

function drawProfile(p) {
  const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
  if (!pt) return;

  const px = p.x * SCALE, py = p.y * SCALE;
  const pw = p.length * SCALE, ph = pt.fixedWidth * SCALE;

  const selected = p.id === selectedId;

  ctx.save();
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.rotate((p.rotation * Math.PI) / 180);

  // Shadow
  if (selected) {
    ctx.shadowColor = 'rgba(5,150,105,0.35)';
    ctx.shadowBlur = 12;
  }

  // Body
  ctx.fillStyle = pt.color;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 4);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Border
  ctx.strokeStyle = selected ? '#065f46' : 'rgba(0,0,0,0.18)';
  ctx.lineWidth = selected ? 2.5 : 1.2;
  ctx.beginPath();
  ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 4);
  ctx.stroke();

  // Label
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'white';
  ctx.font = `bold ${Math.min(12, ph * 0.7)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = `${p.length}cm`;
  if (pw > 40) ctx.fillText(label, 0, 0);

  // Selection handles
  if (selected) {
    ctx.fillStyle = '#065f46';
    [[-pw / 2, -ph / 2], [pw / 2, -ph / 2], [-pw / 2, ph / 2], [pw / 2, ph / 2]].forEach(([hx, hy]) => {
      ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill();
    });
  }

  ctx.restore();
}

function updateHint() {
  const hint = document.getElementById('canvas-hint');
  if (hint) hint.style.display = profiles.length === 0 ? 'block' : 'none';
}

// ---- Hit test ----
function hitTest(mx, my) {
  for (let i = profiles.length - 1; i >= 0; i--) {
    const p = profiles[i];
    const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
    if (!pt) continue;
    const cx = p.x * SCALE + (p.length * SCALE) / 2;
    const cy = p.y * SCALE + (pt.fixedWidth * SCALE) / 2;
    const angle = -(p.rotation * Math.PI) / 180;
    const dx = mx - cx, dy = my - cy;
    const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
    const ly = dx * Math.sin(angle) + dy * Math.cos(angle);
    if (Math.abs(lx) <= (p.length * SCALE) / 2 && Math.abs(ly) <= (pt.fixedWidth * SCALE) / 2) {
      return p.id;
    }
  }
  return null;
}

// ---- Mouse events ----
function onMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const hit = hitTest(mx, my);
  if (hit) {
    selectedId = hit;
    const p = profiles.find(x => x.id === hit);
    dragState = { id: hit, offX: mx - p.x * SCALE, offY: my - p.y * SCALE };
    renderProperties();
    renderCost();
    updateToolbar();
  } else {
    selectedId = null;
    dragState = null;
    renderProperties();
    updateToolbar();
  }
  redraw();
}

function onMouseMove(e) {
  if (!dragState) return;
  const rect = canvas.getBoundingClientRect();
  let x = (e.clientX - rect.left - dragState.offX) / SCALE;
  let y = (e.clientY - rect.top  - dragState.offY) / SCALE;
  if (snapToGrid) { x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID; }
  x = Math.max(0, x); y = Math.max(0, y);
  const p = profiles.find(x2 => x2.id === dragState.id);
  if (p) { p.x = x; p.y = y; }
  redraw();
  renderProperties();
}

function onMouseUp() { dragState = null; }

function onDblClick(e) {
  const rect = canvas.getBoundingClientRect();
  const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
  if (hit) deleteProfile(hit);
}

// ---- Touch events ----
function onTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const mx = t.clientX - rect.left, my = t.clientY - rect.top;
  const hit = hitTest(mx, my);
  if (hit) {
    selectedId = hit;
    const p = profiles.find(x => x.id === hit);
    dragState = { id: hit, offX: mx - p.x * SCALE, offY: my - p.y * SCALE };
    renderProperties(); renderCost(); updateToolbar();
  }
  redraw();
}
function onTouchMove(e) {
  e.preventDefault();
  if (!dragState) return;
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  let x = (t.clientX - rect.left - dragState.offX) / SCALE;
  let y = (t.clientY - rect.top  - dragState.offY) / SCALE;
  if (snapToGrid) { x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID; }
  x = Math.max(0, x); y = Math.max(0, y);
  const p = profiles.find(x2 => x2.id === dragState.id);
  if (p) { p.x = x; p.y = y; }
  redraw(); renderProperties();
}
function onTouchEnd() { dragState = null; }

// ---- Add profile ----
function addProfile(profileTypeId) {
  const pt = PROFILE_TYPES.find(t => t.id === profileTypeId);
  if (!pt) return;
  const id = `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const col = profiles.length % 3;
  const row = Math.floor(profiles.length / 3);
  profiles.push({
    id, profileTypeId,
    x: 20 + col * 70, y: 20 + row * 40,
    length: pt.defaultLength,
    rotation: 0,
  });
  selectedId = id;
  updateToolbar();
  renderProperties();
  renderCost();
  redraw();
  showToast(`${pt.name} ajouté`, 'success');
}

// ---- Delete profile ----
function deleteProfile(id) {
  profiles = profiles.filter(p => p.id !== id);
  if (selectedId === id) selectedId = null;
  updateToolbar();
  renderProperties();
  renderCost();
  redraw();
  showToast('Profilé supprimé');
}

// ---- Update selected profile ----
function updateSelected(key, value) {
  const p = profiles.find(x => x.id === selectedId);
  if (!p) return;
  p[key] = value;
  redraw();
}

// ---- Toolbar ----
function updateToolbar() {
  document.getElementById('profile-count').textContent = `${profiles.length} profilé${profiles.length !== 1 ? 's' : ''}`;
  const selBtn = document.getElementById('btn-delete-selected');
  const selCount = document.getElementById('selected-count');
  if (selectedId) {
    selBtn.style.display = '';
    selCount.style.display = '';
    selCount.textContent = '1 sélectionné';
  } else {
    selBtn.style.display = 'none';
    selCount.style.display = 'none';
  }
}

// ---- Render profile list ----
function renderProfileList() {
  const container = document.getElementById('profile-list');
  container.innerHTML = PROFILE_TYPES.map(pt => `
    <div class="profile-block" data-type="${pt.id}" onclick="addProfile('${pt.id}')">
      <div class="profile-block-top">
        <div class="profile-dot" style="background:${pt.color};"></div>
        <span class="profile-block-name">${escapeHtml(pt.name)}</span>
      </div>
      <div class="profile-block-dims">${pt.fixedWidth}×${pt.fixedHeight} cm — max ${pt.maxLength} cm</div>
      <div class="profile-block-price">${pt.pricePerUnit.toLocaleString()} FCFA / unité</div>
    </div>`).join('');
}

// ---- Render properties panel ----
function renderProperties() {
  const panel = document.getElementById('properties-panel');
  const p = profiles.find(x => x.id === selectedId);
  if (!p) {
    panel.innerHTML = `<p class="sidebar-hint">Cliquez sur un profilé dans le canvas pour le modifier</p>`;
    return;
  }
  const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
  if (!pt) return;

  panel.innerHTML = `
    <div class="prop-section">
      <div class="prop-label">${escapeHtml(pt.name)}</div>
      <div class="prop-grid-2">
        <div class="prop-info">
          <div class="prop-info-label">Largeur (fixe)</div>
          <div class="prop-info-value">${pt.fixedWidth} cm</div>
        </div>
        <div class="prop-info">
          <div class="prop-info-label">Épaisseur (fixe)</div>
          <div class="prop-info-value">${pt.fixedHeight} cm</div>
        </div>
      </div>
    </div>

    <div class="prop-section">
      <div class="prop-label">Dimensions</div>
      <div class="prop-slider-wrap">
        <div class="prop-slider-label">
          <span>Longueur</span>
          <span id="len-val">${p.length} cm</span>
        </div>
        <input type="range" min="10" max="${pt.maxLength}" value="${p.length}" step="1"
          oninput="updateSelected('length', +this.value); document.getElementById('len-val').textContent=this.value+' cm'; renderCost();" />
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Maximum : ${pt.maxLength} cm</div>
      </div>
    </div>

    <div class="prop-section">
      <div class="prop-label">Rotation</div>
      <div class="prop-slider-wrap">
        <div class="prop-slider-label">
          <span>Angle</span>
          <span id="rot-val">${p.rotation}°</span>
        </div>
        <input type="range" min="0" max="360" value="${p.rotation}" step="15"
          oninput="updateSelected('rotation', +this.value); document.getElementById('rot-val').textContent=this.value+'°';" />
      </div>
    </div>

    <div class="prop-section">
      <div class="prop-label">Position (cm)</div>
      <div class="prop-grid-2">
        <div>
          <label style="font-size:12px;margin-bottom:4px;">X
            <input type="number" value="${Math.round(p.x)}" style="margin-top:4px;"
              oninput="updateSelected('x', +this.value);" />
          </label>
        </div>
        <div>
          <label style="font-size:12px;margin-bottom:4px;">Y
            <input type="number" value="${Math.round(p.y)}" style="margin-top:4px;"
              oninput="updateSelected('y', +this.value);" />
          </label>
        </div>
      </div>
    </div>

    <button class="btn btn-danger btn-sm w-full" onclick="deleteProfile('${p.id}')">🗑 Supprimer ce profilé</button>`;
}

// ---- Render cost panel ----
function renderCost() {
  const panel = document.getElementById('cost-panel');
  if (profiles.length === 0) {
    panel.innerHTML = `<p class="sidebar-hint">Ajoutez des profilés pour voir l'estimation</p>`;
    return;
  }

  const { totalCost, totalWeight, details } = calcCostAndWeight();

  panel.innerHTML = `
    <div class="cost-summary">
      <div class="cost-card cost-card-green">
        <div class="cost-label">💰 Prix Total</div>
        <div class="cost-value">${totalCost.toLocaleString()} <small>FCFA</small></div>
      </div>
      <div class="cost-card cost-card-blue">
        <div class="cost-label">⚖ Poids</div>
        <div class="cost-value">${totalWeight.toFixed(2)} <small>kg</small></div>
      </div>
    </div>
    <div class="cost-detail">
      <div class="cost-detail-title">Détails par type</div>
      ${details.map(d => `
        <div class="cost-detail-row">
          <div class="cost-row-top">
            <span style="font-weight:600;">${escapeHtml(d.name)}</span>
            <span>${d.cost.toLocaleString()} FCFA</span>
          </div>
          <div class="cost-row-sub">
            <span>${d.unitsNeeded} unité${d.unitsNeeded > 1 ? 's' : ''}</span>
            <span>${d.weight.toFixed(2)} kg</span>
          </div>
          <div class="efficiency-bar">
            <div class="efficiency-fill ${d.efficiency >= 80 ? 'eff-high' : d.efficiency >= 60 ? 'eff-mid' : 'eff-low'}"
              style="width:${d.efficiency}%;"></div>
          </div>
          <div style="text-align:right;font-size:11px;margin-top:2px;"
            class="${d.efficiency >= 80 ? 'eff-text-high' : d.efficiency >= 60 ? 'eff-text-mid' : 'eff-text-low'}">
            ${d.efficiency.toFixed(1)}% efficacité
          </div>
        </div>`).join('')}
    </div>`;
}

// ---- Cost calculation ----
function calcCostAndWeight() {
  const usageByType = {};
  profiles.forEach(p => {
    if (!usageByType[p.profileTypeId]) usageByType[p.profileTypeId] = { segments: [], totalUsed: 0 };
    usageByType[p.profileTypeId].segments.push(p.length);
    usageByType[p.profileTypeId].totalUsed += p.length;
  });

  let totalCost = 0, totalWeight = 0;
  const details = [];

  Object.entries(usageByType).forEach(([typeId, usage]) => {
    const pt = PROFILE_TYPES.find(t => t.id === typeId);
    if (!pt) return;
    const segs = [...usage.segments].sort((a, b) => b - a);
    const units = [];
    segs.forEach(seg => {
      let placed = false;
      for (const unit of units) {
        const used = unit.reduce((s, l) => s + l, 0);
        if (used + seg <= pt.maxLength) { unit.push(seg); placed = true; break; }
      }
      if (!placed) units.push([seg]);
    });
    const unitsNeeded = units.length;
    const totalAvail = unitsNeeded * pt.maxLength;
    const efficiency = (usage.totalUsed / totalAvail) * 100;
    const weightPerCm = pt.weightPerUnit / pt.maxLength;
    const weight = usage.totalUsed * weightPerCm;
    const cost = unitsNeeded * pt.pricePerUnit;
    totalCost += cost; totalWeight += weight;
    details.push({ name: pt.name, unitsNeeded, cost, weight, efficiency });
  });

  return { totalCost, totalWeight, details };
}

// ---- Cut plan (for fiche technique) ----
function generateCutPlan() {
  const usageByType = {};
  profiles.forEach((p, i) => {
    const key = p.profileTypeId;
    if (!usageByType[key]) usageByType[key] = [];
    usageByType[key].push({ length: p.length, pieceIndex: i + 1 });
  });

  const plan = [];
  Object.entries(usageByType).forEach(([typeId, pieces]) => {
    const pt = PROFILE_TYPES.find(t => t.id === typeId);
    if (!pt) return;
    const sorted = [...pieces].sort((a, b) => b.length - a.length);
    const units = [];
    sorted.forEach(piece => {
      let placed = false;
      for (const unit of units) {
        const used = unit.reduce((s, x) => s + x.length, 0);
        if (used + piece.length <= pt.maxLength) { unit.push(piece); placed = true; break; }
      }
      if (!placed) units.push([piece]);
    });
    units.forEach((unit, ui) => {
      const totalUsed = unit.reduce((s, x) => s + x.length, 0);
      const efficiency = (totalUsed / pt.maxLength) * 100;
      plan.push({ pt, unit, unitIndex: ui + 1, totalUsed, efficiency });
    });
  });
  return plan;
}

// ---- Fiche technique modal ----
function openFiche() {
  if (profiles.length === 0) { showToast('Ajoutez des profilés d\'abord', 'error'); return; }
  const plan = generateCutPlan();
  const { totalCost, totalWeight } = calcCostAndWeight();
  const totalUnits = plan.length;

  const COLORS = ['#10b981','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#ef4444','#f97316'];

  const cutPlanHtml = plan.map((entry, ei) => {
    const { pt, unit, unitIndex, totalUsed, efficiency } = entry;
    const barW = 340;
    const segsHtml = unit.map((seg, si) => {
      const w = Math.round((seg.length / pt.maxLength) * barW);
      const color = COLORS[si % COLORS.length];
      return `<div class="cut-segment" style="width:${w}px;background:${color};" title="P${seg.pieceIndex} – ${seg.length}cm">
        ${w > 30 ? seg.length : ''}</div>`;
    }).join('');
    const wasteW = Math.round(((pt.maxLength - totalUsed) / pt.maxLength) * barW);
    const wasteHtml = wasteW > 4
      ? `<div class="cut-waste" style="flex:1;" title="Chute ${(pt.maxLength - totalUsed).toFixed(0)}cm">${pt.maxLength - totalUsed > 8 ? `${(pt.maxLength-totalUsed).toFixed(0)}cm` : ''}</div>`
      : '';
    const effClass = efficiency >= 80 ? 'eff-text-high' : efficiency >= 60 ? 'eff-text-mid' : 'eff-text-low';
    const segsListHtml = unit.map(seg =>
      `<div class="cut-seg-item"><span><b>P${seg.pieceIndex}</b></span><span>${seg.length} cm</span></div>`
    ).join('');

    return `
      <div class="cut-plan-block">
        <div class="cut-plan-header">
          <span class="cut-plan-name">${escapeHtml(pt.name)} — Unité #${unitIndex}</span>
          <span class="cut-eff ${effClass}">
            ${efficiency >= 80 ? '✓' : '⚠'} ${efficiency.toFixed(0)}% — chute: ${(pt.maxLength - totalUsed).toFixed(0)} cm
          </span>
        </div>
        <div class="cut-bar-wrap">${segsHtml}${wasteHtml}</div>
        <div class="cut-segments-list">${segsListHtml}</div>
      </div>`;
  }).join('');

  const piecesTableRows = profiles.map((p, i) => {
    const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
    if (!pt) return '';
    return `<tr>
      <td class="fiche-piece-num">P${i + 1}</td>
      <td><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${pt.color};margin-right:6px;vertical-align:middle;"></span>${escapeHtml(pt.name)}</td>
      <td class="fiche-length">${p.length} cm</td>
      <td>${pt.fixedWidth} cm</td>
      <td>${pt.fixedHeight} cm</td>
      <td><span class="profile-block-price">${pt.type === 'beam' ? 'Profilé' : 'Planche'}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('fiche-content').innerHTML = `
    <div class="fiche-warning">
      <span>⚠️</span>
      <div><strong>Pour l'ouvrier :</strong> Ce document contient toutes les mesures en centimètres.
        Ne modifier aucune dimension fixe (largeur/épaisseur). Marquer chaque pièce après la coupe.</div>
    </div>

    <div class="fiche-summary">
      <div class="fiche-card fiche-card-g"><div class="fiche-card-num">${profiles.length}</div><div class="fiche-card-lbl">Pièces à couper</div></div>
      <div class="fiche-card fiche-card-b"><div class="fiche-card-num">${totalUnits}</div><div class="fiche-card-lbl">Unités de matière</div></div>
      <div class="fiche-card fiche-card-p"><div class="fiche-card-num">${plan.length > 0 ? Math.round(plan.reduce((a,b)=>a+b.efficiency,0)/plan.length) : 0}%</div><div class="fiche-card-lbl">Efficacité</div></div>
    </div>

    <div class="fiche-section-title">1. Liste des pièces à fabriquer</div>
    <div style="overflow-x:auto;">
      <table class="fiche-table">
        <thead><tr><th>N°</th><th>Matériau</th><th>Longueur</th><th>Largeur</th><th>Épaisseur</th><th>Type</th></tr></thead>
        <tbody>${piecesTableRows}</tbody>
      </table>
    </div>

    <div class="fiche-section-title" style="margin-top:16px;">2. Plan de découpe optimisé</div>
    ${cutPlanHtml}`;

  document.getElementById('fiche-modal').style.display = 'flex';
}

// ---- Download fiche as HTML file (→ PDF via browser print) ----
function downloadFiche() {
  const ouvrier = document.getElementById('fiche-ouvrier').value.trim();
  const date = new Date().toLocaleDateString('fr-FR');
  const plan = generateCutPlan();
  const { totalCost, totalWeight } = calcCostAndWeight();

  const COLORS = ['#10b981','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#ef4444'];

  const piecesRows = profiles.map((p, i) => {
    const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
    if (!pt) return '';
    return `<tr>
      <td style="font-weight:800;color:#065f46;">P${i+1}</td>
      <td>${pt.name}</td>
      <td style="font-family:monospace;font-size:18px;font-weight:800;">${p.length} cm</td>
      <td>${pt.fixedWidth} cm</td>
      <td>${pt.fixedHeight} cm</td>
      <td>${pt.type === 'beam' ? 'Profilé' : 'Planche'}</td>
    </tr>`;
  }).join('');

  const cutPlanHtml = plan.map(entry => {
    const { pt, unit, unitIndex, totalUsed, efficiency } = entry;
    const segsRows = unit.map(seg =>
      `<tr><td style="font-weight:700;">P${seg.pieceIndex}</td><td>${seg.length} cm</td>
       <td>${(pt.maxLength - totalUsed > 0 && unit.indexOf(seg) === unit.length-1) ? `⚠ Chute ${(pt.maxLength-totalUsed).toFixed(0)} cm` : '✓'}</td></tr>`
    ).join('');
    return `
      <div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
          <strong>${pt.name} — Unité #${unitIndex}</strong>
          <span style="color:${efficiency >= 80 ? '#065f46' : efficiency >= 60 ? '#92400e' : '#7f1d1d'};">
            ${efficiency.toFixed(0)}% — chute: ${(pt.maxLength - totalUsed).toFixed(0)} cm
          </span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f3f4f6;">
            <th style="padding:6px 10px;text-align:left;">Pièce</th>
            <th style="padding:6px 10px;text-align:left;">Longueur</th>
            <th style="padding:6px 10px;text-align:left;">Note</th>
          </tr></thead>
          <tbody>${segsRows}</tbody>
        </table>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Fiche Technique ReRack – ${date}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:28px;max-width:900px;margin:0 auto;}
  @media print{.no-print{display:none!important}}
  h1{font-size:24px;color:#065f46;margin-bottom:6px;}
  h2{font-size:16px;color:#065f46;border-bottom:2px solid #065f46;padding-bottom:4px;margin:24px 0 12px;}
  .header{display:flex;justify-content:space-between;border-bottom:3px solid #10b981;padding-bottom:16px;margin-bottom:24px;}
  .logo{font-size:32px;font-weight:900;color:#10b981;}
  .warn{background:#fffbeb;border:2px solid #fbbf24;border-radius:8px;padding:12px 16px;margin-bottom:20px;}
  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px;}
  .sc{border-radius:10px;padding:14px;text-align:center;border:1.5px solid;}
  .sc-g{background:#ecfdf5;border-color:#a7f3d0;}.sc-b{background:#eff6ff;border-color:#bfdbfe;}.sc-p{background:#f5f3ff;border-color:#ddd6fe;}
  .sc-num{font-size:30px;font-weight:900;}.sc-g .sc-num{color:#064e3b;}.sc-b .sc-num{color:#1e40af;}.sc-p .sc-num{color:#4c1d95;}
  table{width:100%;border-collapse:collapse;margin:10px 0;}
  th{background:#065f46;color:white;padding:8px 10px;text-align:left;font-size:12px;}
  td{padding:8px 10px;border-bottom:1px solid #e5e7eb;}
  tr:nth-child(even) td{background:#f9fafb;}
  .sig{margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:30px;}
  .sig-line{border-top:1px solid #111;padding-top:6px;font-size:12px;color:#6b7280;}
  .footer{margin-top:32px;border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;color:#9ca3af;display:flex;justify-content:space-between;}
  .btn-print{display:block;margin:0 auto 24px;padding:12px 32px;background:#065f46;color:white;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;}
</style>
</head>
<body>
<button class="btn-print no-print" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF</button>
<div class="header">
  <div><div class="logo">ReRack</div><div style="font-size:12px;color:#555;margin-top:4px;">Sunu Plastic Odyssey × École Polytechnique de Thiès</div></div>
  <div style="text-align:right;font-size:12px;color:#555;line-height:2;">
    <strong>FICHE TECHNIQUE DE FABRICATION</strong><br>
    Date : ${date}${ouvrier ? '<br>Ouvrier : ' + escapeHtml(ouvrier) : ''}
  </div>
</div>
<div class="warn">⚠️ <strong>IMPORTANT :</strong> Vérifier chaque mesure avant la coupe. Les dimensions sont en centimètres. Ne pas modifier la largeur/épaisseur (dimensions fixes). Numéroter chaque pièce immédiatement après la coupe.</div>
<div class="summary">
  <div class="sc sc-g"><div class="sc-num">${profiles.length}</div><div>Pièces à couper</div></div>
  <div class="sc sc-b"><div class="sc-num">${plan.length}</div><div>Unités de matière</div></div>
  <div class="sc sc-p"><div class="sc-num">${totalCost.toLocaleString()} FCFA</div><div>Coût total</div></div>
</div>
<h2>1. LISTE DES PIÈCES</h2>
<table><thead><tr><th>N°</th><th>Matériau</th><th>Longueur</th><th>Largeur (fixe)</th><th>Épaisseur (fixe)</th><th>Type</th></tr></thead>
<tbody>${piecesRows}</tbody></table>
<h2>2. PLAN DE DÉCOUPE OPTIMISÉ</h2>
${cutPlanHtml}
<h2>3. INSTRUCTIONS GÉNÉRALES</h2>
<ol style="margin-left:20px;line-height:2.2;font-size:13px;">
  <li>Vérifier que le matériau est du plastique recyclé homologué ReRack</li>
  <li>Respecter l'ordre de découpe du plan (optimisé pour minimiser les chutes)</li>
  <li>Marquer chaque pièce avec son numéro (P1, P2…) immédiatement après la coupe</li>
  <li>Les dimensions largeur/épaisseur sont FIXES et ne doivent pas être modifiées</li>
  <li>Contacter le responsable en cas de doute sur une dimension</li>
</ol>
<div class="sig">
  <div class="sig-line">Signature ouvrier</div>
  <div class="sig-line">Contrôle qualité</div>
  <div class="sig-line">Date de fabrication</div>
</div>
<div class="footer">
  <span>ReRack – Sunu Plastic Odyssey × ÉPT | ${date}</span>
  <span>Ne pas modifier les dimensions — document généré automatiquement</span>
</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fiche-technique-rerack-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Fiche téléchargée ! Ouvrez-la dans votre navigateur → Ctrl+P → PDF', 'success');
}

// ---- Save / Load / Clear / Export JSON ----
function saveProject() {
  localStorage.setItem('rerack-project', JSON.stringify({ profiles, timestamp: Date.now() }));
  showToast('Projet sauvegardé !', 'success');
}
function loadProject() {
  const saved = localStorage.getItem('rerack-project');
  if (!saved) { showToast('Aucun projet sauvegardé', 'error'); return; }
  const data = JSON.parse(saved);
  profiles = data.profiles || [];
  selectedId = null;
  updateToolbar(); renderProperties(); renderCost(); redraw();
  showToast('Projet chargé !', 'success');
}
function clearCanvas() {
  if (profiles.length === 0) return;
  if (!confirm('Effacer tout le canvas ?')) return;
  profiles = []; selectedId = null;
  updateToolbar(); renderProperties(); renderCost(); redraw();
  showToast('Canvas effacé');
}
function exportJSON() {
  const blob = new Blob([JSON.stringify({ profiles, timestamp: Date.now() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `rerack-projet-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('JSON exporté !', 'success');
}

// ---- Share to gallery ----
function shareToGallery() {
  if (profiles.length === 0) { showToast('Ajoutez des profilés d\'abord', 'error'); return; }
  document.getElementById('share-modal').style.display = 'flex';
}
function confirmShare() {
  const name = document.getElementById('share-name').value.trim();
  const desc = document.getElementById('share-desc').value.trim();
  if (!name) { showToast('Donnez un nom au projet', 'error'); return; }
  const user = getUser();
  const project = {
    id: `p-${Date.now()}`, title: name, description: desc,
    author: user ? user.name : 'Anonyme', profiles,
    likes: 0, comments: 0, views: 0,
    timestamp: new Date().toISOString(),
  };
  const existing = JSON.parse(localStorage.getItem('community-projects') || '[]');
  existing.push(project);
  localStorage.setItem('community-projects', JSON.stringify(existing));
  document.getElementById('share-modal').style.display = 'none';
  document.getElementById('share-name').value = '';
  document.getElementById('share-desc').value = '';
  showToast('Partagé à la galerie !', 'success');
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  renderProfileList();
  renderProperties();
  renderCost();
  updateToolbar();

  document.getElementById('btn-save').addEventListener('click', saveProject);
  document.getElementById('btn-load').addEventListener('click', loadProject);
  document.getElementById('btn-clear').addEventListener('click', clearCanvas);
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-share').addEventListener('click', shareToGallery);
  document.getElementById('btn-fiche').addEventListener('click', openFiche);
  document.getElementById('btn-delete-selected').addEventListener('click', () => { if (selectedId) deleteProfile(selectedId); });
  document.getElementById('snap-toggle').addEventListener('change', e => { snapToGrid = e.target.checked; redraw(); });

  document.getElementById('close-share').addEventListener('click', () => { document.getElementById('share-modal').style.display = 'none'; });
  document.getElementById('cancel-share').addEventListener('click', () => { document.getElementById('share-modal').style.display = 'none'; });
  document.getElementById('confirm-share').addEventListener('click', confirmShare);

  document.getElementById('close-fiche').addEventListener('click', () => { document.getElementById('fiche-modal').style.display = 'none'; });
  document.getElementById('btn-download-fiche').addEventListener('click', downloadFiche);
  document.getElementById('btn-print-fiche').addEventListener('click', () => window.print());

  // Close modals on overlay click
  ['share-modal','fiche-modal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
    });
  });
});
