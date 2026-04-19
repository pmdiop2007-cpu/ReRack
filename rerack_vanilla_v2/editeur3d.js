/* =============================================
   RERACK – editeur3d.js
   Éditeur 3D Three.js avec connexion par aimantation
   ============================================= */

// ---- Données des profilés ----
const PROFILE_TYPES = [
  { id:'profile-74x74', name:'Profilé 74×74', type:'beam',  color:'#10b981', hex:0x10b981, fixedWidth:7.4,  fixedHeight:7.4,  defaultLength:190, maxLength:190, pricePerUnit:5000, weightPerUnit:8   },
  { id:'profile-36x36', name:'Profilé 36×36', type:'beam',  color:'#059669', hex:0x059669, fixedWidth:3.6,  fixedHeight:3.6,  defaultLength:190, maxLength:190, pricePerUnit:1400, weightPerUnit:2.4 },
  { id:'plank-120x25',  name:'Planche 120×25',type:'plank', color:'#3b82f6', hex:0x3b82f6, fixedWidth:12,   fixedHeight:2.5,  defaultLength:185, maxLength:185, pricePerUnit:2600, weightPerUnit:4.5 },
  { id:'plank-100x30',  name:'Planche 100×30',type:'plank', color:'#2563eb', hex:0x2563eb, fixedWidth:10,   fixedHeight:3,    defaultLength:185, maxLength:185, pricePerUnit:2600, weightPerUnit:4.5 },
];

const GRID = 5;          // snap grid cm
const SNAP_DIST = 8;     // cm distance to snap to another block's endpoint
const UNIT = 1;          // 1 cm = 1 Three.js unit (scaled down below)
const SCENE_SCALE = 0.1; // scene units: 1 scene unit = 10 cm

// ---- State ----
let profiles = [];        // our data objects
let selectedId = null;
let snapEnabled = true;
let scene, camera, renderer, raycaster, mouse;
let orbitEnabled = true;
let orbitState = null;    // { x, y, theta, phi, dist }
let meshMap = {};         // id -> THREE.Group
let highlightMesh = null; // green ghost for snap preview

// ---- Init Three.js ----
function initThree() {
  const vp = document.getElementById('viewport');

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 80, 200);

  // Camera
  camera = new THREE.PerspectiveCamera(45, vp.clientWidth / vp.clientHeight, 0.1, 500);
  setCameraView('persp');

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(vp.clientWidth, vp.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  vp.appendChild(renderer.domElement);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(30, 60, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
  sun.shadow.camera.right = sun.shadow.camera.top = 60;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9bbdff, 0.3);
  fill.position.set(-20, 10, -20);
  scene.add(fill);

  // Grid floor
  const gridHelper = new THREE.GridHelper(100, 40, 0x2a2a4a, 0x252540);
  gridHelper.material.opacity = 0.6;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  // Floor (shadow receiver)
  const floorGeo = new THREE.PlaneGeometry(100, 100);
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.18 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Raycaster
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Events
  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('mousedown', onPointerDown);
  renderer.domElement.addEventListener('mousemove', onPointerMove);
  renderer.domElement.addEventListener('mouseup', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
  renderer.domElement.addEventListener('touchmove', onTouchMove2, { passive: false });
  renderer.domElement.addEventListener('touchend', onTouchEnd2);
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

  // Snap highlight ghost
  const ghostGeo = new THREE.BoxGeometry(1, 1, 1);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.3, wireframe: false });
  highlightMesh = new THREE.Mesh(ghostGeo, ghostMat);
  highlightMesh.visible = false;
  scene.add(highlightMesh);

  animate();
}

// ---- Camera views ----
const orbitDefault = { theta: Math.PI / 5, phi: Math.PI / 4.5, dist: 55 };
let orbitCam = { ...orbitDefault };

function setCameraView(view) {
  if (view === 'persp') {
    orbitCam = { ...orbitDefault };
    orbitEnabled = true;
  } else if (view === 'top') {
    camera.position.set(0, 60, 0.001);
    camera.lookAt(0, 0, 0);
    orbitEnabled = false;
    return;
  } else if (view === 'front') {
    camera.position.set(0, 8, 60);
    camera.lookAt(0, 8, 0);
    orbitEnabled = false;
    return;
  } else if (view === 'side') {
    camera.position.set(60, 8, 0);
    camera.lookAt(0, 8, 0);
    orbitEnabled = false;
    return;
  }
  updateOrbitCamera();
}

function updateOrbitCamera() {
  const { theta, phi, dist } = orbitCam;
  camera.position.set(
    dist * Math.sin(phi) * Math.sin(theta),
    dist * Math.cos(phi),
    dist * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(0, 5, 0);
}

// ---- Resize ----
function onResize() {
  const vp = document.getElementById('viewport');
  camera.aspect = vp.clientWidth / vp.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(vp.clientWidth, vp.clientHeight);
}

// ---- Animate ----
function animate() {
  requestAnimationFrame(animate);
  // Gentle auto-rotate when nothing selected and orbit enabled
  if (orbitEnabled && !orbitState && !selectedId && profiles.length > 0) {
    orbitCam.theta += 0.0005;
    updateOrbitCamera();
  }
  renderer.render(scene, camera);
}

// ---- Orbit drag ----
let pointerStart = null;
let clickThreshold = 5; // px, to distinguish click vs drag
let pointerMoved = false;

function onPointerDown(e) {
  if (e.button === 2) return; // right click
  pointerStart = { x: e.clientX, y: e.clientY };
  pointerMoved = false;
  if (orbitEnabled) {
    orbitState = { startX: e.clientX, startY: e.clientY, theta: orbitCam.theta, phi: orbitCam.phi };
  }
}

function onPointerMove(e) {
  if (pointerStart) {
    const dx = e.clientX - pointerStart.x, dy = e.clientY - pointerStart.y;
    if (Math.sqrt(dx*dx+dy*dy) > clickThreshold) pointerMoved = true;
  }
  if (orbitState && orbitEnabled) {
    const dx = (e.clientX - orbitState.startX) * 0.006;
    const dy = (e.clientY - orbitState.startY) * 0.006;
    orbitCam.theta = orbitState.theta - dx;
    orbitCam.phi = Math.max(0.1, Math.min(Math.PI / 2.1, orbitState.phi + dy));
    updateOrbitCamera();
  }
  // Snap preview on hover
  updateSnapPreview(e.clientX, e.clientY);
}

function onPointerUp(e) {
  const wasOrbit = pointerMoved;
  orbitState = null;
  pointerStart = null;
  if (!wasOrbit) {
    handleClick(e.clientX, e.clientY);
  }
}

function onWheel(e) {
  e.preventDefault();
  orbitCam.dist = Math.max(10, Math.min(120, orbitCam.dist + e.deltaY * 0.05));
  if (orbitEnabled) updateOrbitCamera();
}

// ---- Touch for orbit ----
let touchOrbit = null;
let lastTouchDist = null;
function onTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    pointerStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    pointerMoved = false;
    touchOrbit = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, theta: orbitCam.theta, phi: orbitCam.phi };
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastTouchDist = Math.sqrt(dx*dx+dy*dy);
  }
}
function onTouchMove2(e) {
  e.preventDefault();
  if (e.touches.length === 1 && touchOrbit && orbitEnabled) {
    const dx = (e.touches[0].clientX - touchOrbit.startX) * 0.007;
    const dy = (e.touches[0].clientY - touchOrbit.startY) * 0.007;
    orbitCam.theta = touchOrbit.theta - dx;
    orbitCam.phi = Math.max(0.1, Math.min(Math.PI / 2.1, touchOrbit.phi + dy));
    updateOrbitCamera();
    if (pointerStart) {
      const ddx = e.touches[0].clientX - pointerStart.x, ddy = e.touches[0].clientY - pointerStart.y;
      if (Math.sqrt(ddx*ddx+ddy*ddy) > clickThreshold) pointerMoved = true;
    }
  } else if (e.touches.length === 2 && lastTouchDist) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx*dx+dy*dy);
    orbitCam.dist = Math.max(10, Math.min(120, orbitCam.dist - (dist - lastTouchDist) * 0.1));
    if (orbitEnabled) updateOrbitCamera();
    lastTouchDist = dist;
  }
}
function onTouchEnd2(e) {
  if (e.changedTouches.length === 1 && !pointerMoved) {
    handleClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }
  touchOrbit = null; lastTouchDist = null; pointerStart = null;
}

// ---- Click → select ----
function handleClick(cx, cy) {
  const vp = document.getElementById('viewport');
  const rect = vp.getBoundingClientRect();
  mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // Check intersections with profile meshes
  const meshes = Object.values(meshMap).flatMap(g => g.children.filter(c => c.isMesh));
  const hits = raycaster.intersectObjects(meshes);
  if (hits.length > 0) {
    // Find which profile owns this mesh
    const hitObj = hits[0].object;
    for (const [id, grp] of Object.entries(meshMap)) {
      if (grp.children.includes(hitObj) || grp.children.some(c => c === hitObj)) {
        selectProfile(id);
        return;
      }
    }
  }
  // Deselect
  selectProfile(null);
}

// ---- Snap preview ----
function updateSnapPreview(cx, cy) {
  // Only show preview if we have profiles and are hovering over viewport
  highlightMesh.visible = false;
  const label = document.getElementById('snap-label');
  label.style.display = 'none';
}

// ---- Profile 3D mesh ----
function cm(v) { return v * SCENE_SCALE; } // cm to scene units

function createProfileMesh(p) {
  const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
  if (!pt) return null;

  const grp = new THREE.Group();

  // Main body
  const geo = new THREE.BoxGeometry(cm(p.length), cm(pt.fixedHeight), cm(pt.fixedWidth));

  // Add slight bevel effect using EdgesGeometry
  const mat = new THREE.MeshStandardMaterial({
    color: pt.hex,
    roughness: 0.45,
    metalness: 0.15,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  grp.add(mesh);

  // Edge lines for crisp look
  const edges = new THREE.EdgesGeometry(geo);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 });
  const lines = new THREE.LineSegments(edges, lineMat);
  grp.add(lines);

  // End-face markers (connection points)
  const endMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, transparent: true, opacity: 0.5 });
  const endGeo = new THREE.BoxGeometry(cm(0.6), cm(pt.fixedHeight * 0.85), cm(pt.fixedWidth * 0.85));
  [-1, 1].forEach(side => {
    const end = new THREE.Mesh(endGeo, endMat);
    end.position.x = side * cm(p.length / 2 - 0.3);
    grp.add(end);
  });

  // Position
  grp.position.set(cm(p.x), cm(p.y + pt.fixedHeight / 2), cm(p.z));
  grp.rotation.y = (p.rotation * Math.PI) / 180;

  grp.userData.profileId = p.id;
  return grp;
}

function addMeshToScene(p) {
  const grp = createProfileMesh(p);
  if (!grp) return;
  meshMap[p.id] = grp;
  scene.add(grp);
  // Pop-in animation
  grp.scale.set(0.01, 0.01, 0.01);
  let t = 0;
  const anim = setInterval(() => {
    t += 0.08;
    const s = Math.min(1, t * (2 - t));
    grp.scale.set(s, s, s);
    if (t >= 1) clearInterval(anim);
  }, 16);
}

function updateMesh(p) {
  if (meshMap[p.id]) { scene.remove(meshMap[p.id]); delete meshMap[p.id]; }
  addMeshToScene(p);
  if (selectedId === p.id) highlightSelected();
}

function removeMesh(id) {
  if (meshMap[id]) {
    const grp = meshMap[id];
    // Shrink-out animation
    let t = 1;
    const anim = setInterval(() => {
      t -= 0.1;
      grp.scale.setScalar(Math.max(0, t));
      if (t <= 0) { scene.remove(grp); clearInterval(anim); }
    }, 16);
    delete meshMap[id];
  }
}

function highlightSelected() {
  // Reset all
  Object.entries(meshMap).forEach(([id, grp]) => {
    grp.children.forEach(c => {
      if (c.isMesh && c.material) {
        c.material.emissive && c.material.emissive.set(0x000000);
        c.material.emissiveIntensity = 0;
      }
    });
  });
  if (!selectedId || !meshMap[selectedId]) return;
  const grp = meshMap[selectedId];
  grp.children.forEach(c => {
    if (c.isMesh && c.material && c.material.emissive) {
      c.material.emissive.set(0x00ff88);
      c.material.emissiveIntensity = 0.25;
    }
  });
}

// ---- Select ----
function selectProfile(id) {
  selectedId = id;
  highlightSelected();
  renderProperties();
  updateToolbar();
}

// ---- Add profile ----
function addProfile(profileTypeId) {
  const pt = PROFILE_TYPES.find(t => t.id === profileTypeId);
  if (!pt) return;
  const id = `p-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

  // Stack new profiles neatly
  const col = profiles.length % 3;
  const row = Math.floor(profiles.length / 3);

  const p = {
    id, profileTypeId,
    x: col * (pt.defaultLength + 5),
    y: 0,
    z: row * (pt.fixedWidth + 5),
    length: pt.defaultLength,
    rotation: 0,
  };

  profiles.push(p);
  addMeshToScene(p);
  selectProfile(id);
  renderCost();
  updateHint();
  updateToolbar();
  showToast(`${pt.name} ajouté`, 'success');
}

// ---- Delete ----
function deleteProfile(id) {
  profiles = profiles.filter(p => p.id !== id);
  removeMesh(id);
  if (selectedId === id) { selectedId = null; renderProperties(); }
  renderCost();
  updateHint();
  updateToolbar();
  showToast('Profilé supprimé');
}

// ---- Snap logic ----
// Returns the snap position {x,y,z} if a nearby connection exists, or null
function getSnapTarget(movingProfile, proposedX, proposedZ, rotation) {
  if (!snapEnabled) return null;
  const mpt = PROFILE_TYPES.find(t => t.id === movingProfile.profileTypeId);
  if (!mpt) return null;

  // Get endpoints of the moving profile (at proposed position)
  const angleRad = (rotation * Math.PI) / 180;
  const halfLen = movingProfile.length / 2;
  const movingEnds = [
    { x: proposedX + halfLen * Math.cos(angleRad), z: proposedZ - halfLen * Math.sin(angleRad) },
    { x: proposedX - halfLen * Math.cos(angleRad), z: proposedZ + halfLen * Math.sin(angleRad) },
  ];

  let bestDist = SNAP_DIST;
  let bestSnap = null;

  for (const other of profiles) {
    if (other.id === movingProfile.id) continue;
    const opt = PROFILE_TYPES.find(t => t.id === other.profileTypeId);
    if (!opt) continue;

    const otherAngle = (other.rotation * Math.PI) / 180;
    const otherHalf = other.length / 2;
    const otherCX = other.x, otherCZ = other.z;

    // Other profile's endpoints
    const otherEnds = [
      { x: otherCX + otherHalf * Math.cos(otherAngle), z: otherCZ - otherHalf * Math.sin(otherAngle) },
      { x: otherCX - otherHalf * Math.cos(otherAngle), z: otherCZ + otherHalf * Math.sin(otherAngle) },
      // Also midpoint sides (top/bottom)
      { x: otherCX + (opt.fixedWidth / 2) * Math.sin(otherAngle), z: otherCZ + (opt.fixedWidth / 2) * Math.cos(otherAngle) },
      { x: otherCX - (opt.fixedWidth / 2) * Math.sin(otherAngle), z: otherCZ - (opt.fixedWidth / 2) * Math.cos(otherAngle) },
    ];

    for (const mEnd of movingEnds) {
      for (const oEnd of otherEnds) {
        const d = Math.sqrt((mEnd.x - oEnd.x) ** 2 + (mEnd.z - oEnd.z) ** 2);
        if (d < bestDist) {
          bestDist = d;
          // Shift the proposed center so mEnd aligns with oEnd
          const dx = oEnd.x - mEnd.x, dz = oEnd.z - mEnd.z;
          bestSnap = { x: proposedX + dx, z: proposedZ + dz, label: `Connexion détectée — ${d.toFixed(1)} cm` };
        }
      }
    }
  }

  return bestSnap;
}

// ---- Update profile from property inputs ----
function updateProfileProp(key, value) {
  const p = profiles.find(x => x.id === selectedId);
  if (!p) return;
  const numVal = parseFloat(value);

  if (key === 'length') {
    const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
    p.length = Math.max(10, Math.min(pt.maxLength, numVal));
  } else if (key === 'rotation') {
    p.rotation = numVal;
  } else if (key === 'x') {
    p.x = numVal;
  } else if (key === 'z') {
    p.z = numVal;
  } else if (key === 'y') {
    p.y = Math.max(0, numVal);
  }

  // Snap on manual move
  if ((key === 'x' || key === 'z') && snapEnabled) {
    const snap = getSnapTarget(p, p.x, p.z, p.rotation);
    if (snap) { p.x = snap.x; p.z = snap.z; showSnapLabel(snap.label); }
  }

  updateMesh(p);
  renderCost();
}

let snapLabelTimer;
function showSnapLabel(msg) {
  const el = document.getElementById('snap-label');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(snapLabelTimer);
  snapLabelTimer = setTimeout(() => { el.style.display = 'none'; }, 1500);
}

// ---- Render profile list ----
function renderProfileList() {
  const html = PROFILE_TYPES.map(pt => `
    <div class="profile-block" style="--c:${pt.color}" onclick="addProfile('${pt.id}')">
      <div class="profile-block-top">
        <div class="profile-dot" style="background:${pt.color}"></div>
        <span class="profile-block-name">${pt.name}</span>
      </div>
      <div class="profile-block-dims">${pt.fixedWidth}×${pt.fixedHeight} cm · max ${pt.maxLength} cm</div>
      <div class="profile-block-price">${pt.pricePerUnit.toLocaleString()} FCFA/unité</div>
    </div>`).join('');
  document.getElementById('profile-list').innerHTML = html;
  // Also cache it for drawer
  window._profileListHTML = html;
}

// ---- Render properties ----
function renderProperties(container) {
  const panel = container || document.getElementById('properties-panel');
  const p = profiles.find(x => x.id === selectedId);
  if (!p) { panel.innerHTML = `<p class="sidebar-hint">Cliquez sur un profilé dans le canvas pour le modifier</p>`; return; }
  const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
  if (!pt) return;

  panel.innerHTML = `
    <div class="prop-section">
      <div class="prop-label">${pt.name}</div>
      <div class="prop-grid-2">
        <div class="prop-info"><div class="prop-info-label">Largeur (fixe)</div><div class="prop-info-value">${pt.fixedWidth} cm</div></div>
        <div class="prop-info"><div class="prop-info-label">Épaisseur (fixe)</div><div class="prop-info-value">${pt.fixedHeight} cm</div></div>
      </div>
    </div>

    <div class="prop-section">
      <div class="prop-label">Longueur</div>
      <div class="prop-slider-wrap">
        <div class="prop-slider-label"><span>Longueur</span><span id="len-val-${p.id}">${p.length} cm</span></div>
        <input type="range" min="10" max="${pt.maxLength}" value="${p.length}" step="1"
          oninput="document.getElementById('len-val-${p.id}').textContent=this.value+' cm';updateProfileProp('length',this.value);" />
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">Max : ${pt.maxLength} cm</div>
      </div>
    </div>

    <div class="prop-section">
      <div class="prop-label">Rotation (axe Y)</div>
      <div class="prop-slider-wrap">
        <div class="prop-slider-label"><span>Angle</span><span id="rot-val-${p.id}">${p.rotation}°</span></div>
        <input type="range" min="0" max="360" value="${p.rotation}" step="15"
          oninput="document.getElementById('rot-val-${p.id}').textContent=this.value+'°';updateProfileProp('rotation',this.value);" />
      </div>
    </div>

    <div class="prop-section">
      <div class="prop-label">Position (cm)</div>
      <div class="prop-grid-2">
        <div><label style="font-size:12px;">X (gauche↔droite)
          <input type="number" value="${Math.round(p.x)}" oninput="updateProfileProp('x',this.value);" /></label>
        </div>
        <div><label style="font-size:12px;">Z (avant↔arrière)
          <input type="number" value="${Math.round(p.z)}" oninput="updateProfileProp('z',this.value);" /></label>
        </div>
      </div>
      <div style="margin-top:8px;">
        <label style="font-size:12px;">Y (hauteur)
          <input type="number" value="${Math.round(p.y)}" oninput="updateProfileProp('y',this.value);" />
        </label>
      </div>
    </div>

    <div class="prop-section" style="background:#f0fdf4;border-radius:10px;padding:12px;border:1px solid #a7f3d0;">
      <div class="prop-label" style="color:#065f46;">⚡ Connexion rapide</div>
      <p style="font-size:13px;color:#047857;line-height:1.5;">Modifiez X ou Z pour approcher une extrémité — la pièce s'aimante automatiquement à ${SNAP_DIST} cm.</p>
      <button class="btn btn-sm btn-outline" style="margin-top:8px;width:100%;" onclick="autoSnap('${p.id}')">
        🔗 Auto-connecter maintenant
      </button>
    </div>

    <button class="btn btn-danger-soft btn-sm w-full" style="margin-top:8px;" onclick="deleteProfile('${p.id}')">
      🗑 Supprimer ce profilé
    </button>`;
}

// ---- Auto-snap: snap selected profile to closest connection ----
function autoSnap(id) {
  const p = profiles.find(x => x.id === id);
  if (!p) return;
  const snap = getSnapTarget(p, p.x, p.z, p.rotation);
  if (snap) {
    p.x = snap.x; p.z = snap.z;
    updateMesh(p);
    renderProperties();
    showSnapLabel('✓ Connexion établie !');
    showToast('Profilé connecté !', 'success');
  } else {
    showToast('Aucune connexion proche trouvée', 'error');
  }
}

// ---- Render cost ----
function renderCost(container) {
  const panel = container || document.getElementById('cost-panel');
  if (profiles.length === 0) { panel.innerHTML = `<p class="sidebar-hint">Ajoutez des profilés pour voir l'estimation</p>`; return; }
  const { totalCost, totalWeight, details } = calcCostAndWeight();
  panel.innerHTML = `
    <div class="cost-summary">
      <div class="cost-card cost-card-green"><div class="cost-label">💰 Prix Total</div><div class="cost-value">${totalCost.toLocaleString()}<small> FCFA</small></div></div>
      <div class="cost-card cost-card-blue"><div class="cost-label">⚖ Poids</div><div class="cost-value">${totalWeight.toFixed(1)}<small> kg</small></div></div>
    </div>
    <div class="cost-detail">
      <div class="cost-detail-title">Détails par type</div>
      ${details.map(d => `
        <div class="cost-detail-row">
          <div class="cost-row-top"><span style="font-weight:600">${d.name}</span><span>${d.cost.toLocaleString()} FCFA</span></div>
          <div class="cost-row-sub"><span>${d.unitsNeeded} unité${d.unitsNeeded>1?'s':''}</span><span>${d.weight.toFixed(2)} kg</span></div>
          <div class="efficiency-bar"><div class="efficiency-fill ${d.efficiency>=80?'eff-high':d.efficiency>=60?'eff-mid':'eff-low'}" style="width:${d.efficiency}%"></div></div>
          <div style="text-align:right;font-size:11px;margin-top:2px;" class="${d.efficiency>=80?'eff-text-high':d.efficiency>=60?'eff-text-mid':'eff-text-low'}">${d.efficiency.toFixed(1)}%</div>
        </div>`).join('')}
    </div>`;
}

// ---- Cost calc ----
function calcCostAndWeight() {
  const byType = {};
  profiles.forEach(p => {
    if (!byType[p.profileTypeId]) byType[p.profileTypeId] = { segs:[], total:0 };
    byType[p.profileTypeId].segs.push(p.length);
    byType[p.profileTypeId].total += p.length;
  });
  let totalCost=0, totalWeight=0; const details=[];
  Object.entries(byType).forEach(([tid, u]) => {
    const pt = PROFILE_TYPES.find(t=>t.id===tid); if(!pt) return;
    const segs=[...u.segs].sort((a,b)=>b-a); const units=[];
    segs.forEach(s=>{ let ok=false; for(const u of units){if(u.reduce((a,b)=>a+b,0)+s<=pt.maxLength){u.push(s);ok=true;break;}} if(!ok)units.push([s]); });
    const n=units.length, eff=(u.total/(n*pt.maxLength))*100;
    const w=u.total*(pt.weightPerUnit/pt.maxLength);
    const c=n*pt.pricePerUnit;
    totalCost+=c; totalWeight+=w;
    details.push({name:pt.name, unitsNeeded:n, cost:c, weight:w, efficiency:eff});
  });
  return {totalCost, totalWeight, details};
}

// ---- Cut plan ----
function generateCutPlan() {
  const byType={};
  profiles.forEach((p,i)=>{ if(!byType[p.profileTypeId])byType[p.profileTypeId]=[]; byType[p.profileTypeId].push({length:p.length,pieceIndex:i+1}); });
  const plan=[];
  Object.entries(byType).forEach(([tid,pieces])=>{
    const pt=PROFILE_TYPES.find(t=>t.id===tid); if(!pt) return;
    const sorted=[...pieces].sort((a,b)=>b.length-a.length); const units=[];
    sorted.forEach(pc=>{ let ok=false; for(const u of units){if(u.reduce((s,x)=>s+x.length,0)+pc.length<=pt.maxLength){u.push(pc);ok=true;break;}} if(!ok)units.push([pc]); });
    units.forEach((unit,ui)=>{ const tot=unit.reduce((s,x)=>s+x.length,0); plan.push({pt,unit,unitIndex:ui+1,totalUsed:tot,efficiency:(tot/pt.maxLength)*100}); });
  });
  return plan;
}

// ---- Toolbar ----
function updateToolbar() {
  document.getElementById('profile-count').textContent = `${profiles.length} profilé${profiles.length!==1?'s':''}`;
  const delBtn = document.getElementById('btn-delete-sel');
  const selBadge = document.getElementById('selected-badge');
  if (selectedId) {
    delBtn.style.display=''; selBadge.style.display='';
    const p=profiles.find(x=>x.id===selectedId);
    const pt=p&&PROFILE_TYPES.find(t=>t.id===p.profileTypeId);
    selBadge.textContent = pt ? pt.name : '1 sélectionné';
  } else { delBtn.style.display='none'; selBadge.style.display='none'; }
}

function updateHint() {
  const hint = document.getElementById('canvas-hint');
  if (hint) hint.style.opacity = profiles.length===0 ? '1' : '0';
}

// ---- Save / Load / Clear / Export ----
function saveProject() { localStorage.setItem('rerack-project',JSON.stringify({profiles,timestamp:Date.now()})); showToast('Projet sauvegardé !','success'); }
function loadProject() {
  const s=localStorage.getItem('rerack-project'); if(!s){showToast('Aucun projet sauvegardé','error');return;}
  const d=JSON.parse(s); profiles=d.profiles||[];
  Object.keys(meshMap).forEach(id=>{scene.remove(meshMap[id]);delete meshMap[id];});
  profiles.forEach(p=>addMeshToScene(p));
  selectedId=null; updateToolbar(); renderProperties(); renderCost(); updateHint();
  showToast('Projet chargé !','success');
}
function clearCanvas() {
  if(!profiles.length)return; if(!confirm('Effacer tout le canvas ?'))return;
  profiles.forEach(p=>removeMesh(p.id)); profiles=[]; selectedId=null;
  updateToolbar(); renderProperties(); renderCost(); updateHint();
  showToast('Canvas effacé');
}
function exportJSON() {
  const blob=new Blob([JSON.stringify({profiles,timestamp:Date.now()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`rerack-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  showToast('JSON exporté !','success');
}

// ---- Share ----
function shareToGallery() { if(!profiles.length){showToast('Ajoutez des profilés','error');return;} document.getElementById('share-modal').style.display='flex'; }
function confirmShare() {
  const name=document.getElementById('share-name').value.trim(); if(!name){showToast('Donnez un nom','error');return;}
  const desc=document.getElementById('share-desc').value.trim();
  const user=getUser();
  const proj={id:`p-${Date.now()}`,title:name,description:desc,author:user?user.name:'Anonyme',profiles,likes:0,comments:0,views:0,timestamp:new Date().toISOString()};
  const ex=JSON.parse(localStorage.getItem('community-projects')||'[]'); ex.push(proj);
  localStorage.setItem('community-projects',JSON.stringify(ex));
  document.getElementById('share-modal').style.display='none';
  document.getElementById('share-name').value=''; document.getElementById('share-desc').value='';
  showToast('Partagé à la galerie !','success');
}

// ---- Fiche technique ----
function openFiche() {
  if(!profiles.length){showToast('Ajoutez des profilés','error');return;}
  const plan=generateCutPlan();
  const {totalCost}=calcCostAndWeight();
  const COLORS=['#10b981','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#ef4444','#f97316'];

  const piecesRows=profiles.map((p,i)=>{
    const pt=PROFILE_TYPES.find(t=>t.id===p.profileTypeId); if(!pt)return'';
    return `<tr><td style="font-weight:800;color:#065f46">P${i+1}</td>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${pt.color};margin-right:6px;vertical-align:middle;"></span>${pt.name}</td>
      <td style="font-family:monospace;font-size:16px;font-weight:800">${p.length} cm</td>
      <td>${pt.fixedWidth} cm</td><td>${pt.fixedHeight} cm</td>
      <td>${pt.type==='beam'?'Profilé':'Planche'}</td></tr>`;
  }).join('');

  const cutHtml=plan.map((e,ei)=>{
    const{pt,unit,unitIndex,totalUsed,efficiency}=e;
    const segs=unit.map((s,si)=>{
      const w=Math.round((s.length/pt.maxLength)*340);
      return `<div class="cut-segment" style="width:${w}px;background:${COLORS[si%COLORS.length]};" title="P${s.pieceIndex}·${s.length}cm">${w>28?s.length:''}</div>`;
    }).join('');
    const wasteW=Math.round(((pt.maxLength-totalUsed)/pt.maxLength)*340);
    const waste=wasteW>4?`<div class="cut-waste" style="flex:1;">${pt.maxLength-totalUsed>8?(pt.maxLength-totalUsed).toFixed(0)+'cm':''}</div>`:'';
    const ec=efficiency>=80?'eff-text-high':efficiency>=60?'eff-text-mid':'eff-text-low';
    return `<div class="cut-plan-block">
      <div class="cut-plan-header">
        <span class="cut-plan-name">${pt.name} — Unité #${unitIndex}</span>
        <span class="cut-eff ${ec}">${efficiency>=80?'✓':'⚠'} ${efficiency.toFixed(0)}% — chute: ${(pt.maxLength-totalUsed).toFixed(0)} cm</span>
      </div>
      <div class="cut-bar-wrap">${segs}${waste}</div>
      <div class="cut-segments-list">${unit.map(s=>`<div class="cut-seg-item"><span><b>P${s.pieceIndex}</b></span><span>${s.length} cm</span></div>`).join('')}</div>
    </div>`;
  }).join('');

  document.getElementById('fiche-content').innerHTML=`
    <div class="fiche-warning">⚠️ <div><strong>Pour l'ouvrier :</strong> Toutes les mesures sont en centimètres. Ne pas modifier les dimensions fixes. Numéroter chaque pièce après la coupe.</div></div>
    <div class="fiche-summary">
      <div class="fiche-card fiche-card-g"><div class="fiche-card-num">${profiles.length}</div><div class="fiche-card-lbl">Pièces</div></div>
      <div class="fiche-card fiche-card-b"><div class="fiche-card-num">${plan.length}</div><div class="fiche-card-lbl">Unités matière</div></div>
      <div class="fiche-card fiche-card-p"><div class="fiche-card-num">${plan.length?Math.round(plan.reduce((a,b)=>a+b.efficiency,0)/plan.length):0}%</div><div class="fiche-card-lbl">Efficacité</div></div>
    </div>
    <div class="fiche-section-title">1. Liste des pièces</div>
    <div style="overflow-x:auto"><table class="fiche-table"><thead><tr><th>N°</th><th>Matériau</th><th>Longueur</th><th>Largeur</th><th>Épais.</th><th>Type</th></tr></thead><tbody>${piecesRows}</tbody></table></div>
    <div class="fiche-section-title" style="margin-top:16px">2. Plan de découpe optimisé</div>
    ${cutHtml}`;

  document.getElementById('fiche-modal').style.display='flex';
}

function downloadFiche() {
  const ouvrier=document.getElementById('fiche-ouvrier').value.trim();
  const date=new Date().toLocaleDateString('fr-FR');
  const plan=generateCutPlan();
  const {totalCost,totalWeight}=calcCostAndWeight();
  const COLORS=['#10b981','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#ef4444'];
  const pRows=profiles.map((p,i)=>{const pt=PROFILE_TYPES.find(t=>t.id===p.profileTypeId);if(!pt)return'';return`<tr><td style="font-weight:800;color:#065f46">P${i+1}</td><td>${pt.name}</td><td style="font-family:monospace;font-size:18px;font-weight:800">${p.length} cm</td><td>${pt.fixedWidth} cm</td><td>${pt.fixedHeight} cm</td><td>${pt.type==='beam'?'Profilé':'Planche'}</td></tr>`;}).join('');
  const cutPl=plan.map(e=>{const{pt,unit,unitIndex,totalUsed,efficiency}=e;return`<div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:10px;padding:14px;"><div style="display:flex;justify-content:space-between;margin-bottom:10px;"><strong>${pt.name} — Unité #${unitIndex}</strong><span style="color:${efficiency>=80?'#065f46':efficiency>=60?'#92400e':'#7f1d1d'}">${efficiency.toFixed(0)}% — chute: ${(pt.maxLength-totalUsed).toFixed(0)} cm</span></div><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f3f4f6"><th style="padding:6px 10px;text-align:left">Pièce</th><th style="padding:6px 10px;text-align:left">Longueur</th></tr></thead><tbody>${unit.map(s=>`<tr><td style="padding:6px 10px;font-weight:700">P${s.pieceIndex}</td><td style="padding:6px 10px">${s.length} cm</td></tr>`).join('')}</tbody></table></div>`;}).join('');
  const html=`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche Technique ReRack – ${date}</title><style>body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:28px;max-width:900px;margin:0 auto}@media print{.no-print{display:none!important}}h2{font-size:16px;color:#065f46;border-bottom:2px solid #065f46;padding-bottom:4px;margin:24px 0 12px}.logo{font-size:32px;font-weight:900;color:#10b981}.header{display:flex;justify-content:space-between;border-bottom:3px solid #10b981;padding-bottom:16px;margin-bottom:24px}.warn{background:#fffbeb;border:2px solid #fbbf24;border-radius:8px;padding:12px 16px;margin-bottom:20px}.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px}.sc{border-radius:10px;padding:14px;text-align:center;border:1.5px solid}.sc-g{background:#ecfdf5;border-color:#a7f3d0}.sc-b{background:#eff6ff;border-color:#bfdbfe}.sc-p{background:#f5f3ff;border-color:#ddd6fe}.sc-num{font-size:30px;font-weight:900}.sc-g .sc-num{color:#064e3b}.sc-b .sc-num{color:#1e40af}.sc-p .sc-num{color:#4c1d95}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#065f46;color:white;padding:8px 10px;text-align:left;font-size:12px}td{padding:8px 10px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f9fafb}.sig{margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:30px}.sl{border-top:1px solid #111;padding-top:6px;font-size:12px;color:#6b7280}.foot{margin-top:32px;border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;color:#9ca3af;display:flex;justify-content:space-between}.pbtn{display:block;margin:0 auto 24px;padding:12px 32px;background:#065f46;color:white;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer}</style></head><body><button class="pbtn no-print" onclick="window.print()">🖨 Imprimer / PDF</button><div class="header"><div><div class="logo">ReRack</div><div style="font-size:12px;color:#555;margin-top:4px">Sunu Plastic Odyssey × École Polytechnique de Thiès</div></div><div style="text-align:right;font-size:12px;color:#555;line-height:2"><strong>FICHE TECHNIQUE — 3D</strong><br>Date : ${date}${ouvrier?'<br>Ouvrier : '+ouvrier:''}</div></div><div class="warn">⚠️ <strong>IMPORTANT :</strong> Vérifier chaque mesure avant la coupe. Dimensions en centimètres. Numéroter les pièces immédiatement après la coupe.</div><div class="sum"><div class="sc sc-g"><div class="sc-num">${profiles.length}</div><div>Pièces</div></div><div class="sc sc-b"><div class="sc-num">${plan.length}</div><div>Unités matière</div></div><div class="sc sc-p"><div class="sc-num">${totalCost.toLocaleString()} FCFA</div><div>Coût total</div></div></div><h2>1. LISTE DES PIÈCES</h2><table><thead><tr><th>N°</th><th>Matériau</th><th>Longueur</th><th>Largeur</th><th>Épaisseur</th><th>Type</th></tr></thead><tbody>${pRows}</tbody></table><h2>2. PLAN DE DÉCOUPE</h2>${cutPl}<h2>3. INSTRUCTIONS</h2><ol style="margin-left:20px;line-height:2.2;font-size:13px"><li>Vérifier que le matériau est du plastique recyclé homologué ReRack</li><li>Respecter l'ordre de découpe du plan</li><li>Marquer chaque pièce (P1, P2…) immédiatement après la coupe</li><li>Largeur et épaisseur sont FIXES</li><li>Contacter le responsable en cas de doute</li></ol><div class="sig"><div class="sl">Signature ouvrier</div><div class="sl">Contrôle qualité</div><div class="sl">Date de fabrication</div></div><div class="foot"><span>ReRack – Sunu Plastic Odyssey × ÉPT | ${date}</span><span>Ne pas modifier les dimensions</span></div></body></html>`;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`fiche-rerack-${Date.now()}.html`; a.click(); URL.revokeObjectURL(url);
  showToast('Fiche téléchargée ! Ouvrez dans navigateur → Ctrl+P','success');
}

// ---- Mobile drawer ----
function openDrawer(title, contentHTML) {
  document.getElementById('drawer-title').textContent = title;
  document.getElementById('drawer-content').innerHTML = contentHTML;
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('open');
  document.querySelectorAll('.mbb-btn').forEach(b=>b.classList.remove('active'));
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('open');
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  initThree();
  renderProfileList();
  renderProperties();
  renderCost();
  updateToolbar();
  updateHint();

  // Header scroll effect
  window.addEventListener('scroll', () => {
    document.getElementById('header').classList.toggle('scrolled', window.scrollY > 10);
  });

  // View buttons
  document.getElementById('view-btns').addEventListener('click', e => {
    const btn = e.target.closest('.view-btn'); if (!btn) return;
    document.querySelectorAll('.view-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    setCameraView(btn.dataset.view);
  });

  // Snap toggle
  document.getElementById('snap-toggle').addEventListener('change', e => { snapEnabled = e.target.checked; });

  // Action buttons
  document.getElementById('btn-save').addEventListener('click', saveProject);
  document.getElementById('btn-load').addEventListener('click', loadProject);
  document.getElementById('btn-clear').addEventListener('click', clearCanvas);
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-share').addEventListener('click', shareToGallery);
  document.getElementById('btn-fiche').addEventListener('click', openFiche);
  document.getElementById('btn-delete-sel').addEventListener('click', () => { if(selectedId) deleteProfile(selectedId); });

  // Modals
  document.getElementById('close-share').addEventListener('click', () => document.getElementById('share-modal').style.display='none');
  document.getElementById('cancel-share').addEventListener('click', () => document.getElementById('share-modal').style.display='none');
  document.getElementById('confirm-share').addEventListener('click', confirmShare);
  document.getElementById('close-fiche').addEventListener('click', () => document.getElementById('fiche-modal').style.display='none');
  document.getElementById('btn-download-fiche').addEventListener('click', downloadFiche);
  document.getElementById('btn-print-fiche').addEventListener('click', () => window.print());
  ['share-modal','fiche-modal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.style.display='none'; });
  });

  // Drawer
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);

  // Mobile bottom bar
  document.getElementById('mbb-profiles').addEventListener('click', () => {
    openDrawer('Profilés disponibles', `<p class="sidebar-hint">Cliquez pour ajouter au canvas 3D</p><div class="profile-list">${window._profileListHTML||''}</div>`);
    document.getElementById('mbb-profiles').classList.add('active');
  });
  document.getElementById('mbb-props').addEventListener('click', () => {
    const div=document.createElement('div');
    renderProperties(div);
    openDrawer('Propriétés', div.innerHTML);
    document.getElementById('mbb-props').classList.add('active');
  });
  document.getElementById('mbb-cost').addEventListener('click', () => {
    const div=document.createElement('div');
    renderCost(div);
    openDrawer('Estimation du projet', div.innerHTML);
    document.getElementById('mbb-cost').classList.add('active');
  });
  document.getElementById('mbb-fiche').addEventListener('click', openFiche);
});
