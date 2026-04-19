/* ================================================================
   RERACK — editeur3d.js  v3
   ----------------------------------------------------------------
   CE FICHIER CONTIENT :
   1. Données des profilés (types, dimensions, prix)
   2. Initialisation Three.js (scène, caméra, lumières, grille)
   3. Contrôle de la caméra (orbite souris + touch, zoom)
   4. Gestion des maillages 3D (création, mise à jour, suppression)
   5. Interaction (clic, drag 3D, snap)
   6. Modes de manipulation (déplacer, rotation H, rotation V, connecter)
   7. Rendu du panneau propriétés
   8. Rendu de l'estimation de coûts
   9. Fiche technique (avec vues 3D et instructions de montage)
  10. Partage vers la galerie (avec upload photo)
  11. Drawer mobile
  12. Initialisation générale (DOMContentLoaded)
   ================================================================ */


/* ================================================================
   1. DONNÉES DES PROFILÉS
   Pour ajouter un type, copiez un objet et modifiez ses valeurs.
   hex  = couleur Three.js (0xRRGGBB)
   color= couleur CSS (#RRGGBB) — doit correspondre à hex
   ================================================================ */
const PROFILE_TYPES = [
  {
    id: 'profile-74x74',
    name: 'Profilé 74×74',
    type: 'beam',          // 'beam' (carré/rectangulaire) ou 'plank' (planche)
    color: '#10b981',      // couleur CSS
    hex: 0x10b981,         // couleur Three.js
    fixedWidth: 7.4,       // largeur fixe en cm
    fixedHeight: 7.4,      // épaisseur fixe en cm
    defaultLength: 190,    // longueur par défaut en cm
    maxLength: 190,        // longueur maximale autorisée en cm
    pricePerUnit: 5000,    // prix en FCFA par unité complète
    weightPerUnit: 8,      // poids en kg par unité complète
  },
  {
    id: 'profile-36x36',
    name: 'Profilé 36×36',
    type: 'beam',
    color: '#059669', hex: 0x059669,
    fixedWidth: 3.6, fixedHeight: 3.6,
    defaultLength: 190, maxLength: 190,
    pricePerUnit: 1400, weightPerUnit: 2.4,
  },
  {
    id: 'plank-120x25',
    name: 'Planche 120×25',
    type: 'plank',
    color: '#3b82f6', hex: 0x3b82f6,
    fixedWidth: 12, fixedHeight: 2.5,
    defaultLength: 185, maxLength: 185,
    pricePerUnit: 2600, weightPerUnit: 4.5,
  },
  {
    id: 'plank-100x30',
    name: 'Planche 100×30',
    type: 'plank',
    color: '#2563eb', hex: 0x2563eb,
    fixedWidth: 10, fixedHeight: 3,
    defaultLength: 185, maxLength: 185,
    pricePerUnit: 2600, weightPerUnit: 4.5,
  },
];

/* Constantes physiques */
const GRID      = 5;    // pas de la grille en cm
const SNAP_DIST = 10;   // distance d'aimantation en cm
const S         = 0.1;  // facteur d'échelle : 1 cm = 0.1 unité Three.js (= 10 cm/unité)

/* Utilitaire : cm → unités Three.js */
const cm = v => v * S;


/* ================================================================
   2. STATE GLOBAL
   Ces variables décrivent l'état courant de l'éditeur.
   ================================================================ */
let profiles  = [];   // tableau des objets profilé { id, profileTypeId, x, y, z, length, rotY, rotX }
let selectedId = null; // id du profilé sélectionné (ou null)
let snapEnabled = true;
let manipMode  = 'move'; // mode actif : 'move' | 'rotY' | 'rotX' | 'snap'

/* Variables Three.js */
let scene, camera, renderer, raycaster, mouse;
let meshMap = {};  // { id -> THREE.Group } — correspondance data ↔ objet 3D

/* Variables d'orbite caméra */
const orbitDefault = { theta: Math.PI / 5, phi: Math.PI / 4.2, dist: 55 };
let orbitCam   = { ...orbitDefault };
let orbitLock  = false;   // true pour les vues orthogonales (top/front/side)
let orbitState = null;    // { startX, startY, theta, phi } pendant le drag

/* Variables de drag 3D (déplacer/rotater un profilé avec la souris) */
let dragProfile = null;   // profilé en cours de déplacement
let dragPlane   = null;   // THREE.Plane sur laquelle le drag se fait
let dragOffset  = new THREE.Vector3(); // décalage entre la souris et le centre

/* Détection clic vs drag */
let pointerDownPos = null;
let pointerMoved   = false;
const CLICK_THRESH = 6; // px

/* Touch */
let touchOrbit    = null;
let lastPinchDist = null;


/* ================================================================
   3. INITIALISATION THREE.JS
   ================================================================ */
function initThree() {
  const vp = document.getElementById('viewport');

  /* --- Scène --- */
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.FogExp2(0x1a1a2e, 0.008);

  /* --- Caméra perspective --- */
  camera = new THREE.PerspectiveCamera(45, vp.clientWidth / vp.clientHeight, 0.1, 500);
  applyOrbitCamera();

  /* --- Renderer WebGL --- */
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  // preserveDrawingBuffer = true permet de faire des screenshots via canvas.toDataURL()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(vp.clientWidth, vp.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  vp.appendChild(renderer.domElement);

  /* --- Lumières --- */
  // Lumière ambiante douce (éclaire tout uniformément)
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  // Lumière directionnelle principale avec ombres
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(30, 60, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 0.5, far: 200, left: -60, right: 60, top: 60, bottom: -60 });
  scene.add(sun);

  // Lumière de remplissage (côté opposé, teinte bleutée)
  const fill = new THREE.DirectionalLight(0x9bbdff, 0.3);
  fill.position.set(-20, 10, -20);
  scene.add(fill);

  // Lumière du bas (remonte les ombres trop dures)
  const rim = new THREE.DirectionalLight(0xffffff, 0.15);
  rim.position.set(0, -10, 0);
  scene.add(rim);

  /* --- Grille de sol --- */
  const grid = new THREE.GridHelper(120, 48, 0x2a2a4a, 0x252540);
  grid.material.opacity = 0.55;
  grid.material.transparent = true;
  scene.add(grid);

  /* --- Plan de sol invisible (pour recevoir les ombres) --- */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.ShadowMaterial({ opacity: 0.2 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /* --- Raycaster (pour la détection de clic sur les maillages) --- */
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  /* --- Événements souris --- */
  renderer.domElement.addEventListener('mousedown', onPointerDown);
  renderer.domElement.addEventListener('mousemove', onPointerMove);
  renderer.domElement.addEventListener('mouseup',   onPointerUp);
  renderer.domElement.addEventListener('wheel',     onWheel,       { passive: false });
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

  /* --- Événements touch (mobile/tablette) --- */
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
  renderer.domElement.addEventListener('touchmove',  onTouchMove,  { passive: false });
  renderer.domElement.addEventListener('touchend',   onTouchEnd);

  /* --- Resize --- */
  window.addEventListener('resize', onResize);

  /* --- Boucle de rendu --- */
  animate();
}

/* Redimensionne le renderer quand la fenêtre change */
function onResize() {
  const vp = document.getElementById('viewport');
  camera.aspect = vp.clientWidth / vp.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(vp.clientWidth, vp.clientHeight);
}

/* Boucle d'animation principale */
function animate() {
  requestAnimationFrame(animate);
  // Rotation automatique lente quand rien n'est sélectionné et pas en drag
  if (!orbitLock && !orbitState && !dragProfile && !selectedId && profiles.length > 0) {
    orbitCam.theta += 0.0004;
    applyOrbitCamera();
  }
  renderer.render(scene, camera);
}


/* ================================================================
   4. CONTRÔLE DE LA CAMÉRA
   ================================================================ */

/* Applique les angles d'orbite à la caméra */
function applyOrbitCamera() {
  const { theta, phi, dist } = orbitCam;
  camera.position.set(
    dist * Math.sin(phi) * Math.sin(theta),
    dist * Math.cos(phi),
    dist * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(0, 5, 0); // regarde vers le centre légèrement en hauteur
}

/* Change la vue caméra selon le bouton cliqué */
function setCameraView(view) {
  orbitLock = (view !== 'persp');
  if (view === 'persp') {
    orbitCam = { ...orbitDefault };
    applyOrbitCamera();
  } else if (view === 'top') {
    camera.position.set(0, 65, 0.001);
    camera.lookAt(0, 0, 0);
  } else if (view === 'front') {
    camera.position.set(0, 10, 65);
    camera.lookAt(0, 10, 0);
  } else if (view === 'side') {
    camera.position.set(65, 10, 0);
    camera.lookAt(0, 10, 0);
  }
}

/* Configure une caméra de rendu off-screen pour la fiche technique */
function makeOffscreenCamera(w, h) {
  const c = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
  return c;
}


/* ================================================================
   5. ÉVÉNEMENTS SOURIS
   ================================================================ */

function onPointerDown(e) {
  if (e.button === 2) return; // ignorer clic droit
  pointerDownPos = { x: e.clientX, y: e.clientY };
  pointerMoved   = false;

  // Essayer de commencer un drag sur un profilé
  const hit = raycastProfiles(e.clientX, e.clientY);
  if (hit && selectedId === hit.id) {
    // Drag du profilé sélectionné
    startProfileDrag(hit.profile, e.clientX, e.clientY);
  } else {
    // Sinon, commencer l'orbite caméra
    if (!orbitLock) {
      orbitState = { startX: e.clientX, startY: e.clientY, theta: orbitCam.theta, phi: orbitCam.phi };
    }
  }
}

function onPointerMove(e) {
  // Mise à jour de la détection de mouvement
  if (pointerDownPos) {
    const dx = e.clientX - pointerDownPos.x, dy = e.clientY - pointerDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESH) pointerMoved = true;
  }

  if (dragProfile) {
    // Mode drag d'un profilé
    updateProfileDrag(e.clientX, e.clientY);
  } else if (orbitState && !orbitLock) {
    // Mode orbite caméra
    const dx = (e.clientX - orbitState.startX) * 0.006;
    const dy = (e.clientY - orbitState.startY) * 0.006;
    orbitCam.theta = orbitState.theta - dx;
    orbitCam.phi   = Math.max(0.08, Math.min(Math.PI / 2.05, orbitState.phi + dy));
    applyOrbitCamera();
  }
}

function onPointerUp(e) {
  const wasDrag = pointerMoved;
  endProfileDrag();
  orbitState  = null;
  pointerDownPos = null;

  // Clic simple (pas un drag) → sélectionner
  if (!wasDrag) {
    handleClick(e.clientX, e.clientY);
  }
}

function onWheel(e) {
  e.preventDefault();
  orbitCam.dist = Math.max(8, Math.min(140, orbitCam.dist + e.deltaY * 0.05));
  if (!orbitLock) applyOrbitCamera();
}


/* ================================================================
   5b. ÉVÉNEMENTS TOUCH
   ================================================================ */
function onTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t = e.touches[0];
    pointerDownPos = { x: t.clientX, y: t.clientY };
    pointerMoved   = false;

    // Tenter drag sur profilé
    const hit = raycastProfiles(t.clientX, t.clientY);
    if (hit && selectedId === hit.id) {
      startProfileDrag(hit.profile, t.clientX, t.clientY);
    } else {
      touchOrbit = { startX: t.clientX, startY: t.clientY, theta: orbitCam.theta, phi: orbitCam.phi };
    }
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastPinchDist = Math.sqrt(dx * dx + dy * dy);
    endProfileDrag();
    touchOrbit = null;
  }
}

function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t = e.touches[0];
    if (pointerDownPos) {
      const dx = t.clientX - pointerDownPos.x, dy = t.clientY - pointerDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESH) pointerMoved = true;
    }
    if (dragProfile) {
      updateProfileDrag(t.clientX, t.clientY);
    } else if (touchOrbit && !orbitLock) {
      const dx = (t.clientX - touchOrbit.startX) * 0.007;
      const dy = (t.clientY - touchOrbit.startY) * 0.007;
      orbitCam.theta = touchOrbit.theta - dx;
      orbitCam.phi   = Math.max(0.08, Math.min(Math.PI / 2.05, touchOrbit.phi + dy));
      applyOrbitCamera();
    }
  } else if (e.touches.length === 2 && lastPinchDist) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const d  = Math.sqrt(dx * dx + dy * dy);
    orbitCam.dist = Math.max(8, Math.min(140, orbitCam.dist - (d - lastPinchDist) * 0.12));
    if (!orbitLock) applyOrbitCamera();
    lastPinchDist = d;
  }
}

function onTouchEnd(e) {
  const wasDrag = pointerMoved;
  endProfileDrag();
  touchOrbit  = null;
  lastPinchDist = null;
  pointerDownPos = null;
  if (!wasDrag && e.changedTouches.length === 1) {
    handleClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }
}


/* ================================================================
   5c. RAYCASTING & CLIC
   Détecte sur quel profilé la souris/doigt est posé.
   ================================================================ */

/* Retourne { profile, mesh } ou null */
function raycastProfiles(cx, cy) {
  const vp   = document.getElementById('viewport');
  const rect = vp.getBoundingClientRect();
  mouse.x = ((cx - rect.left)  / rect.width)  * 2 - 1;
  mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // Collecter tous les maillages cliquables (corps des profilés uniquement, pas les arêtes)
  const meshes = [];
  Object.entries(meshMap).forEach(([id, grp]) => {
    grp.children.forEach(c => { if (c.isMesh) meshes.push(c); });
  });

  const hits = raycaster.intersectObjects(meshes);
  if (!hits.length) return null;

  // Trouver à quel profilé appartient le maillage touché
  const hitMesh = hits[0].object;
  for (const [id, grp] of Object.entries(meshMap)) {
    if (grp.children.includes(hitMesh)) {
      return { profile: profiles.find(p => p.id === id), mesh: hitMesh, point: hits[0].point };
    }
  }
  return null;
}

function handleClick(cx, cy) {
  const hit = raycastProfiles(cx, cy);
  if (hit && hit.profile) {
    selectProfile(hit.profile.id);
  } else {
    selectProfile(null);
  }
}


/* ================================================================
   5d. DRAG 3D DES PROFILÉS
   Permet de déplacer / rotater un profilé en glissant la souris
   sur le canvas 3D.
   ================================================================ */

/* Démarre le drag selon le mode actif */
function startProfileDrag(profile, cx, cy) {
  if (!profile) return;
  dragProfile = profile;

  if (manipMode === 'move') {
    // Crée un plan horizontal à la hauteur du profilé
    dragPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), -cm(profile.y));
    const pt   = getPlanePoint(cx, cy, dragPlane);
    if (pt) dragOffset.set(pt.x - cm(profile.x), 0, pt.z - cm(profile.z));
  }
  // Pour les modes rotation, le drag est traité dans updateProfileDrag
}

/* Mise à jour pendant le drag */
function updateProfileDrag(cx, cy) {
  if (!dragProfile) return;
  const p = profiles.find(x => x.id === dragProfile.id);
  if (!p) return;

  if (manipMode === 'move' && dragPlane) {
    const pt = getPlanePoint(cx, cy, dragPlane);
    if (!pt) return;

    let nx = (pt.x - dragOffset.x) / S; // retour en cm
    let nz = (pt.z - dragOffset.z) / S;

    // Snap grille
    if (snapEnabled) { nx = Math.round(nx / GRID) * GRID; nz = Math.round(nz / GRID) * GRID; }
    nx = Math.max(0, nx); nz = Math.max(-60, nz);

    // Snap connexion (mode move uniquement)
    const snap = getSnapTarget(p, nx, nz);
    if (snap) { nx = snap.x; nz = snap.z; showSnapLabel('🔗 ' + snap.label); }

    p.x = nx; p.z = nz;

  } else if (manipMode === 'rotY') {
    // Rotation horizontale : déplacement X de la souris → rotation autour de Y
    const vp   = document.getElementById('viewport');
    const rect = vp.getBoundingClientRect();
    const dx   = (cx - rect.left) / rect.width; // 0..1
    p.rotY = Math.round(dx * 360 / 15) * 15;   // multiple de 15°

  } else if (manipMode === 'rotX') {
    // Rotation verticale : déplacement Y → rotation autour de X
    // Permet de mettre les profilés à la verticale (0° = horizontal, 90° = vertical)
    const vp   = document.getElementById('viewport');
    const rect = vp.getBoundingClientRect();
    const dy   = (cy - rect.top) / rect.height; // 0..1
    p.rotX = Math.round(dy * 180 / 15) * 15;   // 0°..180°

  } else if (manipMode === 'snap') {
    // Mode connexion : idem move mais force le snap
    const pt = getPlanePoint(cx, cy, dragPlane || new THREE.Plane(new THREE.Vector3(0,1,0), -cm(p.y)));
    if (!pt) return;
    let nx = (pt.x - dragOffset.x) / S, nz = (pt.z - dragOffset.z) / S;
    const snap = getSnapTarget(p, nx, nz);
    if (snap) { nx = snap.x; nz = snap.z; showSnapLabel('✓ Connecté !'); }
    p.x = Math.max(0, nx); p.z = nz;
  }

  updateMesh(p);
  renderProperties();
}

function endProfileDrag() {
  if (dragProfile) renderCost(); // recalcul du coût après déplacement
  dragProfile = null;
  dragPlane   = null;
}

/* Calcule le point d'intersection rayon-plan */
function getPlanePoint(cx, cy, plane) {
  const vp   = document.getElementById('viewport');
  const rect = vp.getBoundingClientRect();
  mouse.x = ((cx - rect.left)  / rect.width)  * 2 - 1;
  mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const target = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, target) ? target : null;
}


/* ================================================================
   6. SNAP / CONNEXION AUTOMATIQUE
   Aimante les extrémités des profilés les unes aux autres.
   ================================================================ */

/* Retourne { x, z, label } si une connexion est trouvée, sinon null */
function getSnapTarget(movingProfile, proposedX, proposedZ) {
  if (!snapEnabled && manipMode !== 'snap') return null;
  const mpt = PROFILE_TYPES.find(t => t.id === movingProfile.profileTypeId);
  if (!mpt) return null;

  const angle   = (movingProfile.rotY || 0) * Math.PI / 180;
  const halfLen = movingProfile.length / 2;

  // Extrémités du profilé en mouvement
  const mEnds = [
    { x: proposedX + halfLen * Math.cos(angle), z: proposedZ - halfLen * Math.sin(angle) },
    { x: proposedX - halfLen * Math.cos(angle), z: proposedZ + halfLen * Math.sin(angle) },
  ];

  let best = null, bestD = SNAP_DIST;

  for (const other of profiles) {
    if (other.id === movingProfile.id) continue;
    const opt      = PROFILE_TYPES.find(t => t.id === other.profileTypeId);
    if (!opt) continue;
    const oAngle   = (other.rotY || 0) * Math.PI / 180;
    const oHalf    = other.length / 2;

    // Extrémités + milieu des côtés du profilé fixe
    const oPoints = [
      { x: other.x + oHalf * Math.cos(oAngle),             z: other.z - oHalf * Math.sin(oAngle) },
      { x: other.x - oHalf * Math.cos(oAngle),             z: other.z + oHalf * Math.sin(oAngle) },
      { x: other.x + (opt.fixedWidth/2)*Math.sin(oAngle),  z: other.z + (opt.fixedWidth/2)*Math.cos(oAngle) },
      { x: other.x - (opt.fixedWidth/2)*Math.sin(oAngle),  z: other.z - (opt.fixedWidth/2)*Math.cos(oAngle) },
    ];

    for (const me of mEnds) {
      for (const oe of oPoints) {
        const d = Math.hypot(me.x - oe.x, me.z - oe.z);
        if (d < bestD) {
          bestD = d;
          // Décaler le centre pour que l'extrémité 'me' coïncide avec 'oe'
          best = {
            x:     proposedX + (oe.x - me.x),
            z:     proposedZ + (oe.z - me.z),
            label: `${d.toFixed(1)} cm`,
          };
        }
      }
    }
  }
  return best;
}

/* Force le snap sur le profilé sélectionné (bouton "Auto-connecter") */
function autoSnap(id) {
  const p = profiles.find(x => x.id === id);
  if (!p) return;
  const snap = getSnapTarget(p, p.x, p.z);
  if (snap) {
    p.x = snap.x; p.z = snap.z;
    updateMesh(p); renderProperties();
    showSnapLabel('✓ Connexion établie !');
    showToast('Profilé connecté !', 'success');
  } else {
    showToast('Aucune connexion proche trouvée', 'error');
  }
}

let snapLabelTimer;
function showSnapLabel(msg) {
  const el = document.getElementById('snap-label');
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(snapLabelTimer);
  snapLabelTimer = setTimeout(() => { el.style.display = 'none'; }, 1800);
}


/* ================================================================
   7. MAILLAGES 3D (création / mise à jour / suppression)
   ================================================================ */

/* Crée un Group Three.js représentant visuellement un profilé */
function buildMesh(p) {
  const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
  if (!pt) return null;
  const grp = new THREE.Group();

  /* Corps principal */
  const geo = new THREE.BoxGeometry(cm(p.length), cm(pt.fixedHeight), cm(pt.fixedWidth));
  const mat = new THREE.MeshStandardMaterial({ color: pt.hex, roughness: 0.42, metalness: 0.1 });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = body.receiveShadow = true;
  grp.add(body);

  /* Arêtes (wireframe discret) */
  const edges    = new THREE.EdgesGeometry(geo);
  const lineMat  = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });
  grp.add(new THREE.LineSegments(edges, lineMat));

  /* Marqueurs d'extrémités (disques blancs = points de connexion) */
  const endGeo = new THREE.CylinderGeometry(cm(Math.min(pt.fixedWidth, pt.fixedHeight) * 0.3), cm(Math.min(pt.fixedWidth, pt.fixedHeight) * 0.3), cm(0.5), 8);
  const endMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, transparent: true, opacity: 0.6 });
  [-1, 1].forEach(side => {
    const end = new THREE.Mesh(endGeo, endMat.clone());
    end.rotation.z = Math.PI / 2; // aligne le cylindre sur l'axe X
    end.position.x = side * cm(p.length / 2 - 0.25);
    grp.add(end);
  });

  /* Position et rotation */
  grp.position.set(cm(p.x), cm(p.y + pt.fixedHeight / 2), cm(p.z));
  grp.rotation.y = (p.rotY || 0) * Math.PI / 180;
  grp.rotation.x = (p.rotX || 0) * Math.PI / 180; // rotation verticale

  grp.userData.profileId = p.id;
  return grp;
}

/* Ajoute un nouveau maillage avec animation de pop-in */
function addMeshToScene(p) {
  const grp = buildMesh(p);
  if (!grp) return;
  meshMap[p.id] = grp;
  scene.add(grp);

  // Animation d'apparition (scale 0→1)
  grp.scale.setScalar(0.01);
  let t = 0;
  const anim = setInterval(() => {
    t = Math.min(1, t + 0.07);
    const s = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    grp.scale.setScalar(s);
    if (t >= 1) clearInterval(anim);
  }, 16);
}

/* Recrée le maillage (après modification des propriétés) */
function updateMesh(p) {
  if (meshMap[p.id]) { scene.remove(meshMap[p.id]); delete meshMap[p.id]; }
  addMeshToScene(p);
  if (selectedId === p.id) applySelectionHighlight();
}

/* Supprime un maillage avec animation de disparition */
function removeMesh(id) {
  const grp = meshMap[id];
  if (!grp) return;
  delete meshMap[id];
  let t = 1;
  const anim = setInterval(() => {
    t = Math.max(0, t - 0.1);
    grp.scale.setScalar(t);
    if (t <= 0) { scene.remove(grp); clearInterval(anim); }
  }, 16);
}

/* Met en évidence le profilé sélectionné (émissivité verte) */
function applySelectionHighlight() {
  // Réinitialise tous les maillages
  Object.values(meshMap).forEach(grp => {
    grp.children.forEach(c => {
      if (c.isMesh && c.material?.emissive) { c.material.emissive.set(0x000000); c.material.emissiveIntensity = 0; }
    });
  });
  if (!selectedId || !meshMap[selectedId]) return;
  meshMap[selectedId].children.forEach(c => {
    if (c.isMesh && c.material?.emissive) { c.material.emissive.set(0x00ff88); c.material.emissiveIntensity = 0.22; }
  });
}


/* ================================================================
   8. SÉLECTION & AJOUT DE PROFILÉS
   ================================================================ */
function selectProfile(id) {
  selectedId = id;
  applySelectionHighlight();
  renderProperties();
  updateToolbar();
  // Affiche la barre de manipulation si un profilé est sélectionné
  document.getElementById('manip-bar').classList.toggle('visible', !!id);
}

function addProfile(profileTypeId) {
  const pt = PROFILE_TYPES.find(t => t.id === profileTypeId);
  if (!pt) return;

  // Placement en quinconce pour éviter la superposition
  const col = profiles.length % 3;
  const row = Math.floor(profiles.length / 3);

  const p = {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    profileTypeId,
    x: 10 + col * (pt.defaultLength * 0.5 + 10), // espacement horizontal
    y: 0,
    z: 5  + row * (pt.fixedWidth + 8),             // espacement profondeur
    length: pt.defaultLength,
    rotY: 0,  // rotation horizontale (autour de Y) en degrés
    rotX: 0,  // rotation verticale (autour de X) en degrés — 90° = vertical
  };

  profiles.push(p);
  addMeshToScene(p);
  selectProfile(p.id);
  renderCost();
  updateHint();
  updateToolbar();
  showToast(`${pt.name} ajouté`, 'success');
}

function deleteProfile(id) {
  profiles = profiles.filter(p => p.id !== id);
  removeMesh(id);
  if (selectedId === id) { selectedId = null; renderProperties(); }
  renderCost(); updateHint(); updateToolbar();
  document.getElementById('manip-bar').classList.remove('visible');
  showToast('Profilé supprimé');
}


/* ================================================================
   9. PANELS : PROPRIÉTÉS & COÛTS
   ================================================================ */

/* Rend le panneau propriétés selon la sélection courante */
function renderProperties(container) {
  const panel = container || document.getElementById('properties-panel');
  const p  = profiles.find(x => x.id === selectedId);
  if (!p) {
    panel.innerHTML = `<p class="sidebar-hint">Cliquez sur un profilé dans le canvas pour le modifier</p>`;
    return;
  }
  const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
  if (!pt) return;

  panel.innerHTML = `
    <!-- Info type -->
    <div class="prop-section">
      <div class="prop-label">${pt.name}</div>
      <div class="prop-grid-2">
        <div class="prop-info"><div class="prop-info-label">Largeur (fixe)</div>   <div class="prop-info-value">${pt.fixedWidth} cm</div></div>
        <div class="prop-info"><div class="prop-info-label">Épaisseur (fixe)</div> <div class="prop-info-value">${pt.fixedHeight} cm</div></div>
      </div>
    </div>

    <!-- Longueur -->
    <div class="prop-section">
      <div class="prop-label">Longueur</div>
      <div class="prop-slider-wrap">
        <div class="prop-slider-label"><span>Longueur</span><span id="lv-${p.id}">${p.length} cm</span></div>
        <input type="range" min="10" max="${pt.maxLength}" value="${p.length}" step="1"
          oninput="document.getElementById('lv-${p.id}').textContent=this.value+' cm';updateProp('length',this.value)" />
        <div style="font-size:12px;color:#9ca3af;margin-top:4px">Max : ${pt.maxLength} cm</div>
      </div>
    </div>

    <!-- Rotation horizontale (axe Y) -->
    <div class="prop-section">
      <div class="prop-label">Rotation horizontale (axe Y)</div>
      <div class="prop-slider-wrap">
        <div class="prop-slider-label"><span>Angle</span><span id="ry-${p.id}">${p.rotY||0}°</span></div>
        <input type="range" min="0" max="360" value="${p.rotY||0}" step="15"
          oninput="document.getElementById('ry-${p.id}').textContent=this.value+'°';updateProp('rotY',this.value)" />
      </div>
    </div>

    <!-- Rotation verticale (axe X) — pour mettre le profilé à la verticale -->
    <div class="prop-section">
      <div class="prop-label">Rotation verticale (axe X)</div>
      <p style="font-size:12px;color:#9ca3af;margin-bottom:8px">0° = horizontal · 90° = vertical debout</p>
      <div class="prop-slider-wrap">
        <div class="prop-slider-label"><span>Inclinaison</span><span id="rx-${p.id}">${p.rotX||0}°</span></div>
        <input type="range" min="0" max="180" value="${p.rotX||0}" step="15"
          oninput="document.getElementById('rx-${p.id}').textContent=this.value+'°';updateProp('rotX',this.value)" />
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
        <button class="btn btn-sm btn-outline" onclick="updateProp('rotX',0)">↔ Plat</button>
        <button class="btn btn-sm btn-outline" onclick="updateProp('rotX',90)">↑ Vertical</button>
        <button class="btn btn-sm btn-outline" onclick="updateProp('rotX',45)">↗ 45°</button>
      </div>
    </div>

    <!-- Position -->
    <div class="prop-section">
      <div class="prop-label">Position (cm)</div>
      <div class="prop-grid-2">
        <div><label style="font-size:12px">X ←→<input type="number" value="${Math.round(p.x)}" oninput="updateProp('x',this.value)" /></label></div>
        <div><label style="font-size:12px">Z ↕<input  type="number" value="${Math.round(p.z)}" oninput="updateProp('z',this.value)" /></label></div>
      </div>
      <div style="margin-top:8px">
        <label style="font-size:12px">Y hauteur<input type="number" value="${Math.round(p.y)}" oninput="updateProp('y',this.value)" /></label>
      </div>
    </div>

    <!-- Connexion rapide -->
    <div class="prop-section" style="background:#f0fdf4;border-radius:10px;padding:12px;border:1px solid #a7f3d0">
      <div class="prop-label" style="color:#065f46">⚡ Connexion rapide</div>
      <p style="font-size:13px;color:#047857;line-height:1.5;margin-bottom:8px">
        Approchez une extrémité à moins de ${SNAP_DIST} cm d'une autre pièce — elle s'aimante automatiquement.
      </p>
      <button class="btn btn-sm btn-success w-full" onclick="autoSnap('${p.id}')">🔗 Auto-connecter maintenant</button>
    </div>

    <!-- Supprimer -->
    <button class="btn btn-danger-soft btn-sm w-full" style="margin-top:8px" onclick="deleteProfile('${p.id}')">
      🗑 Supprimer ce profilé
    </button>`;
}

/* Met à jour une propriété du profilé sélectionné */
function updateProp(key, value) {
  const p  = profiles.find(x => x.id === selectedId);
  if (!p) return;
  const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
  const v  = parseFloat(value);

  if (key === 'length') p.length = Math.max(10, Math.min(pt.maxLength, v));
  else if (key === 'rotY') p.rotY = v;
  else if (key === 'rotX') p.rotX = v;
  else if (key === 'x')    p.x = v;
  else if (key === 'z')    p.z = v;
  else if (key === 'y')    p.y = Math.max(0, v);

  // Snap automatique si on bouge X ou Z
  if ((key === 'x' || key === 'z') && snapEnabled) {
    const snap = getSnapTarget(p, p.x, p.z);
    if (snap) { p.x = snap.x; p.z = snap.z; showSnapLabel('🔗 ' + snap.label); }
  }

  updateMesh(p);
  renderCost();
  // Met à jour l'affichage si le slider rotX a changé (pour les boutons rapides)
  if (key === 'rotX') {
    const el = document.getElementById(`rx-${p.id}`);
    if (el) el.textContent = v + '°';
  }
}

/* Rend l'estimation des coûts */
function renderCost(container) {
  const panel = container || document.getElementById('cost-panel');
  if (!profiles.length) {
    panel.innerHTML = `<p class="sidebar-hint">Ajoutez des profilés pour voir l'estimation</p>`;
    return;
  }
  const { totalCost, totalWeight, details } = calcCostAndWeight();
  panel.innerHTML = `
    <div class="cost-summary">
      <div class="cost-card cost-card-green"><div class="cost-label">💰 Prix Total</div><div class="cost-value">${totalCost.toLocaleString()}<small> FCFA</small></div></div>
      <div class="cost-card cost-card-blue"> <div class="cost-label">⚖ Poids</div>    <div class="cost-value">${totalWeight.toFixed(1)}<small> kg</small></div></div>
    </div>
    <div class="cost-detail">
      <div class="cost-detail-title">Détails par type</div>
      ${details.map(d => `
        <div class="cost-detail-row">
          <div class="cost-row-top"><span style="font-weight:600">${d.name}</span><span>${d.cost.toLocaleString()} FCFA</span></div>
          <div class="cost-row-sub"><span>${d.unitsNeeded} unité${d.unitsNeeded > 1 ? 's' : ''}</span><span>${d.weight.toFixed(2)} kg</span></div>
          <div class="efficiency-bar"><div class="efficiency-fill ${d.efficiency >= 80 ? 'eff-high' : d.efficiency >= 60 ? 'eff-mid' : 'eff-low'}" style="width:${d.efficiency}%"></div></div>
          <div style="text-align:right;font-size:11px;margin-top:2px" class="${d.efficiency >= 80 ? 'eff-text-high' : d.efficiency >= 60 ? 'eff-text-mid' : 'eff-text-low'}">${d.efficiency.toFixed(1)}%</div>
        </div>`).join('')}
    </div>`;
}


/* ================================================================
  10. CALCULS (coût / plan de découpe)
   ================================================================ */
function calcCostAndWeight() {
  const byType = {};
  profiles.forEach(p => {
    if (!byType[p.profileTypeId]) byType[p.profileTypeId] = { segs: [], total: 0 };
    byType[p.profileTypeId].segs.push(p.length);
    byType[p.profileTypeId].total += p.length;
  });
  let totalCost = 0, totalWeight = 0;
  const details = [];
  Object.entries(byType).forEach(([tid, u]) => {
    const pt = PROFILE_TYPES.find(t => t.id === tid); if (!pt) return;
    // Algorithme de bin-packing glouton (trié décroissant)
    const segs = [...u.segs].sort((a, b) => b - a);
    const units = [];
    segs.forEach(s => {
      let ok = false;
      for (const unit of units) {
        if (unit.reduce((a, b) => a + b, 0) + s <= pt.maxLength) { unit.push(s); ok = true; break; }
      }
      if (!ok) units.push([s]);
    });
    const n   = units.length;
    const eff = (u.total / (n * pt.maxLength)) * 100;
    const w   = u.total * (pt.weightPerUnit / pt.maxLength);
    const c   = n * pt.pricePerUnit;
    totalCost += c; totalWeight += w;
    details.push({ name: pt.name, unitsNeeded: n, cost: c, weight: w, efficiency: eff });
  });
  return { totalCost, totalWeight, details };
}

function generateCutPlan() {
  const byType = {};
  profiles.forEach((p, i) => {
    if (!byType[p.profileTypeId]) byType[p.profileTypeId] = [];
    byType[p.profileTypeId].push({ length: p.length, pieceIndex: i + 1 });
  });
  const plan = [];
  Object.entries(byType).forEach(([tid, pieces]) => {
    const pt = PROFILE_TYPES.find(t => t.id === tid); if (!pt) return;
    const sorted = [...pieces].sort((a, b) => b.length - a.length);
    const units = [];
    sorted.forEach(pc => {
      let ok = false;
      for (const u of units) {
        if (u.reduce((s, x) => s + x.length, 0) + pc.length <= pt.maxLength) { u.push(pc); ok = true; break; }
      }
      if (!ok) units.push([pc]);
    });
    units.forEach((unit, ui) => {
      const tot = unit.reduce((s, x) => s + x.length, 0);
      plan.push({ pt, unit, unitIndex: ui + 1, totalUsed: tot, efficiency: (tot / pt.maxLength) * 100 });
    });
  });
  return plan;
}

/* Calcule les dimensions englobantes du projet en cm */
function getProjectBounds() {
  if (!profiles.length) return { W: 0, H: 0, D: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  profiles.forEach(p => {
    const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId);
    if (!pt) return;
    const hw = p.length / 2;
    minX = Math.min(minX, p.x - hw);  maxX = Math.max(maxX, p.x + hw);
    minY = Math.min(minY, p.y);        maxY = Math.max(maxY, p.y + pt.fixedHeight);
    minZ = Math.min(minZ, p.z);        maxZ = Math.max(maxZ, p.z + pt.fixedWidth);
  });
  return { W: Math.round(maxX - minX), H: Math.round(maxY - minY), D: Math.round(maxZ - minZ) };
}


/* ================================================================
  11. FICHE TECHNIQUE AVEC VUES 3D
   ================================================================ */

/* Capture le canvas courant sous une vue donnée et retourne un data URL */
function captureView(camPos, lookAt) {
  // On déplace la caméra principale (le renderer partage la scène)
  const savedPos    = camera.position.clone();
  const savedTarget = new THREE.Vector3(0, 5, 0); // approximation du lookAt courant

  camera.position.copy(camPos);
  camera.lookAt(lookAt);
  renderer.render(scene, camera);
  const dataURL = renderer.domElement.toDataURL('image/png');

  // Restaurer
  camera.position.copy(savedPos);
  camera.lookAt(savedTarget);
  renderer.render(scene, camera);
  return dataURL;
}

/* Génère les instructions de montage à partir des profilés */
function generateAssemblySteps() {
  const bounds  = getProjectBounds();
  const beams   = profiles.filter(p => { const t = PROFILE_TYPES.find(x => x.id === p.profileTypeId); return t?.type === 'beam'; });
  const planks  = profiles.filter(p => { const t = PROFILE_TYPES.find(x => x.id === p.profileTypeId); return t?.type === 'plank'; });
  const verticals = profiles.filter(p => (p.rotX || 0) >= 60); // profilés considérés verticaux

  const steps = [];

  steps.push({
    num: 1,
    title: 'Préparer les pièces',
    text: `Découpez les ${profiles.length} pièce(s) selon le plan de découpe ci-dessous. Numérotez chaque pièce (P1, P2…) immédiatement après la coupe et rangez-les dans l'ordre.`,
  });

  if (beams.length > 0) {
    steps.push({
      num: 2,
      title: 'Assembler la structure porteuse',
      text: `Commencez par les ${beams.length} profilé(s) structurel(s) (${[...new Set(beams.map(b => { const t = PROFILE_TYPES.find(x => x.id === b.profileTypeId); return t?.name; }))].join(', ')}). ${verticals.length > 0 ? `${verticals.length} pièce(s) sont verticales — veillez à les maintenir droites pendant l'assemblage.` : 'Positionnez-les à l\'horizontale.'} Connectez les extrémités bout à bout ou perpendiculairement selon le plan 3D.`,
    });
  }

  if (planks.length > 0) {
    steps.push({
      num: beams.length > 0 ? 3 : 2,
      title: 'Poser les panneaux / planches',
      text: `Posez les ${planks.length} planche(s) sur la structure. Vérifiez l'alignement avec les profilés avant de fixer. Les planches doivent être à fleur des profilés sur les bords visibles.`,
    });
  }

  steps.push({
    num: steps.length + 1,
    title: 'Vérifier les dimensions finales',
    text: `Dimensions attendues : Largeur ${bounds.W} cm · Hauteur ${bounds.H} cm · Profondeur ${bounds.D} cm. Mesurez diagonalement (les deux diagonales doivent être égales) pour vérifier la perpendicularité.`,
  });

  steps.push({
    num: steps.length + 1,
    title: 'Contrôle qualité final',
    text: 'Vérifiez que toutes les connexions sont solidement emboîtées. Contrôlez visuellement que le meuble est stable et ne bascule pas. Signez la fiche pour valider le montage.',
  });

  return steps;
}

function openFiche() {
  if (!profiles.length) { showToast('Ajoutez des profilés d\'abord', 'error'); return; }

  // Capture 3 vues 3D
  const dist  = 55;
  const views = [
    { label: 'Vue perspective', pos: new THREE.Vector3(dist * 0.7, dist * 0.6, dist * 0.7) },
    { label: 'Vue de dessus',   pos: new THREE.Vector3(0, dist, 0.01) },
    { label: 'Vue de face',     pos: new THREE.Vector3(0, 12, dist) },
  ];
  const lookAt = new THREE.Vector3(0, 5, 0);
  const viewImgs = views.map(v => ({ label: v.label, src: captureView(v.pos, lookAt) }));

  const plan     = generateCutPlan();
  const steps    = generateAssemblySteps();
  const bounds   = getProjectBounds();
  const { totalCost, totalWeight } = calcCostAndWeight();
  const COLORS   = ['#10b981','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#ef4444','#f97316'];

  // Tableau des pièces
  const piecesRows = profiles.map((p, i) => {
    const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId); if (!pt) return '';
    const orient = (p.rotX || 0) >= 60 ? '↑ Vertical' : (p.rotX || 0) >= 30 ? '↗ Incliné' : '↔ Horizontal';
    return `<tr>
      <td style="font-weight:800;color:#065f46">P${i + 1}</td>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${pt.color};margin-right:6px;vertical-align:middle"></span>${pt.name}</td>
      <td style="font-family:monospace;font-size:15px;font-weight:800">${p.length} cm</td>
      <td>${pt.fixedWidth} cm</td><td>${pt.fixedHeight} cm</td>
      <td>${orient}</td>
      <td>${pt.type === 'beam' ? 'Profilé' : 'Planche'}</td>
    </tr>`;
  }).join('');

  // Plan de découpe
  const cutHtml = plan.map(e => {
    const { pt, unit, unitIndex, totalUsed, efficiency } = e;
    const segs = unit.map((s, si) => {
      const w = Math.round((s.length / pt.maxLength) * 300);
      return `<div class="cut-segment" style="width:${w}px;background:${COLORS[si % COLORS.length]}" title="P${s.pieceIndex} – ${s.length}cm">${w > 28 ? s.length : ''}</div>`;
    }).join('');
    const wasteW = Math.round(((pt.maxLength - totalUsed) / pt.maxLength) * 300);
    const waste  = wasteW > 4 ? `<div class="cut-waste">${pt.maxLength - totalUsed > 8 ? (pt.maxLength - totalUsed).toFixed(0) + 'cm' : ''}</div>` : '';
    const ec = efficiency >= 80 ? 'eff-text-high' : efficiency >= 60 ? 'eff-text-mid' : 'eff-text-low';
    return `<div class="cut-plan-block">
      <div class="cut-plan-header">
        <span class="cut-plan-name">${pt.name} — Unité #${unitIndex}</span>
        <span class="cut-eff ${ec}">${efficiency >= 80 ? '✓' : '⚠'} ${efficiency.toFixed(0)}% — chute: ${(pt.maxLength - totalUsed).toFixed(0)} cm</span>
      </div>
      <div class="cut-bar-wrap">${segs}${waste}</div>
      <div class="cut-segments-list">${unit.map(s => `<div class="cut-seg-item"><span><b>P${s.pieceIndex}</b></span><span>${s.length} cm</span></div>`).join('')}</div>
    </div>`;
  }).join('');

  // Instructions de montage
  const stepsHtml = `<div class="assembly-steps">${steps.map(s => `
    <div class="assembly-step">
      <div class="step-circle">${s.num}</div>
      <div class="step-text"><h4>${s.title}</h4><p>${s.text}</p></div>
    </div>`).join('')}</div>`;

  // Vues 3D
  const viewsHtml = `<div class="fiche-views">${viewImgs.map(v => `
    <div class="fiche-view-wrap">
      <img src="${v.src}" alt="${v.label}" style="width:100%;height:140px;object-fit:cover;display:block" />
      <div class="fiche-view-label">${v.label}</div>
    </div>`).join('')}</div>`;

  document.getElementById('fiche-content').innerHTML = `
    <!-- Alerte -->
    <div class="fiche-warning">⚠️<div><strong>Pour l'ouvrier / technicien :</strong> Toutes les mesures sont en centimètres (cm). Ne pas modifier les dimensions fixes (largeur/épaisseur). Numéroter chaque pièce après la coupe.</div></div>

    <!-- Résumé -->
    <div class="fiche-summary">
      <div class="fiche-card fiche-card-g"><div class="fiche-card-num">${profiles.length}</div><div class="fiche-card-lbl">Pièces à couper</div></div>
      <div class="fiche-card fiche-card-b"><div class="fiche-card-num">${plan.length}</div>    <div class="fiche-card-lbl">Unités de matière</div></div>
      <div class="fiche-card fiche-card-p"><div class="fiche-card-num">${plan.length ? Math.round(plan.reduce((a,b)=>a+b.efficiency,0)/plan.length) : 0}%</div><div class="fiche-card-lbl">Efficacité découpe</div></div>
    </div>

    <!-- Dimensions globales -->
    <div class="fiche-section-title">Dimensions globales du projet</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      <div style="background:#f0fdf4;border:1.5px solid #a7f3d0;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:#065f46;font-weight:700;text-transform:uppercase;margin-bottom:4px">Largeur</div>
        <div style="font-size:24px;font-weight:900;font-family:monospace;color:#064e3b">${bounds.W} cm</div>
      </div>
      <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:#1d4ed8;font-weight:700;text-transform:uppercase;margin-bottom:4px">Hauteur</div>
        <div style="font-size:24px;font-weight:900;font-family:monospace;color:#1e40af">${bounds.H} cm</div>
      </div>
      <div style="background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:11px;color:#7c3aed;font-weight:700;text-transform:uppercase;margin-bottom:4px">Profondeur</div>
        <div style="font-size:24px;font-weight:900;font-family:monospace;color:#4c1d95">${bounds.D} cm</div>
      </div>
    </div>

    <!-- Vues 3D -->
    <div class="fiche-section-title">Rendu 3D — vues multiples</div>
    ${viewsHtml}

    <!-- Instructions de montage -->
    <div class="fiche-section-title" style="margin-top:16px">Instructions de montage</div>
    ${stepsHtml}

    <!-- Liste des pièces -->
    <div class="fiche-section-title" style="margin-top:16px">Liste des pièces à fabriquer</div>
    <div style="overflow-x:auto">
      <table class="fiche-table">
        <thead><tr><th>N°</th><th>Matériau</th><th>Longueur</th><th>Largeur</th><th>Épais.</th><th>Orientation</th><th>Type</th></tr></thead>
        <tbody>${piecesRows}</tbody>
      </table>
    </div>

    <!-- Plan de découpe -->
    <div class="fiche-section-title" style="margin-top:16px">Plan de découpe optimisé (anti-gaspillage)</div>
    ${cutHtml}`;

  document.getElementById('fiche-modal').style.display = 'flex';
}

/* Télécharge la fiche en HTML (ouvrable dans un navigateur → Ctrl+P → PDF) */
function downloadFiche() {
  const ouvrier = document.getElementById('fiche-ouvrier').value.trim();
  const date    = new Date().toLocaleDateString('fr-FR');
  const plan    = generateCutPlan();
  const steps   = generateAssemblySteps();
  const bounds  = getProjectBounds();
  const { totalCost, totalWeight } = calcCostAndWeight();
  const COLORS  = ['#10b981','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#ef4444'];

  // Captures des vues 3D (intégrées en base64 dans le HTML)
  const lookAt = new THREE.Vector3(0, 5, 0);
  const viewImgs = [
    { label: 'Perspective',  pos: new THREE.Vector3(38, 33, 38), src: captureView(new THREE.Vector3(38, 33, 38), lookAt) },
    { label: 'Vue de dessus',pos: new THREE.Vector3(0, 55, 0.01), src: captureView(new THREE.Vector3(0, 55, 0.01), lookAt) },
    { label: 'Vue de face',  pos: new THREE.Vector3(0, 12, 55), src: captureView(new THREE.Vector3(0, 12, 55), lookAt) },
  ];

  const pRows = profiles.map((p,i) => {
    const pt = PROFILE_TYPES.find(t => t.id === p.profileTypeId); if (!pt) return '';
    const orient = (p.rotX||0) >= 60 ? '↑ Vertical' : (p.rotX||0) >= 30 ? '↗ Incliné' : '↔ Horizontal';
    return `<tr><td style="font-weight:800;color:#065f46">P${i+1}</td><td>${pt.name}</td><td style="font-family:monospace;font-size:17px;font-weight:800">${p.length} cm</td><td>${pt.fixedWidth} cm</td><td>${pt.fixedHeight} cm</td><td>${orient}</td><td>${pt.type==='beam'?'Profilé':'Planche'}</td></tr>`;
  }).join('');

  const cutPl = plan.map(e => {
    const {pt,unit,unitIndex,totalUsed,efficiency} = e;
    return `<div style="margin-bottom:20px;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px"><strong>${pt.name} — Unité #${unitIndex}</strong>
      <span style="color:${efficiency>=80?'#065f46':efficiency>=60?'#92400e':'#7f1d1d'}">${efficiency.toFixed(0)}% — chute: ${(pt.maxLength-totalUsed).toFixed(0)} cm</span></div>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f3f4f6"><th style="padding:6px 10px;text-align:left">Pièce</th><th style="padding:6px 10px;text-align:left">Longueur</th></tr></thead>
      <tbody>${unit.map(s=>`<tr><td style="padding:6px 10px;font-weight:700">P${s.pieceIndex}</td><td style="padding:6px 10px">${s.length} cm</td></tr>`).join('')}</tbody></table></div>`;
  }).join('');

  const stepsHtml = steps.map(s =>
    `<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px">
      <div style="width:32px;height:32px;border-radius:50%;background:#059669;color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0">${s.num}</div>
      <div><h4 style="font-size:14px;font-weight:700;margin-bottom:4px">${s.title}</h4><p style="font-size:13px;color:#4b5563;line-height:1.6">${s.text}</p></div>
    </div>`
  ).join('');

  const viewsHtml = viewImgs.map(v =>
    `<div style="background:#1a1a2e;border-radius:8px;overflow:hidden;position:relative">
      <img src="${v.src}" alt="${v.label}" style="width:100%;height:130px;object-fit:cover;display:block"/>
      <div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.65);color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;white-space:nowrap">${v.label}</div>
    </div>`
  ).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche Technique ReRack – ${date}</title>
<style>
body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:28px;max-width:960px;margin:0 auto}
@media print{.no-print{display:none!important}body{padding:0}}
h2{font-size:15px;color:#065f46;border-bottom:2px solid #065f46;padding-bottom:4px;margin:22px 0 12px}
.logo{font-size:32px;font-weight:900;color:#10b981}
.hdr{display:flex;justify-content:space-between;border-bottom:3px solid #10b981;padding-bottom:14px;margin-bottom:20px}
.warn{background:#fffbeb;border:2px solid #fbbf24;border-radius:8px;padding:12px;margin-bottom:18px;font-size:13px;color:#78350f}
.sum{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
.sc{border-radius:10px;padding:12px;text-align:center;border:1.5px solid}
.sc-g{background:#ecfdf5;border-color:#a7f3d0}.sc-b{background:#eff6ff;border-color:#bfdbfe}.sc-p{background:#f5f3ff;border-color:#ddd6fe}
.sc-n{font-size:28px;font-weight:900}.sc-g .sc-n{color:#064e3b}.sc-b .sc-n{color:#1e40af}.sc-p .sc-n{color:#4c1d95}
.dims{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}
.dim-c{border-radius:10px;padding:12px;text-align:center;border:1.5px solid}
.dim-g{background:#ecfdf5;border-color:#a7f3d0}.dim-b{background:#eff6ff;border-color:#bfdbfe}.dim-p{background:#f5f3ff;border-color:#ddd6fe}
.views{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}
table{width:100%;border-collapse:collapse;margin:8px 0}
th{background:#065f46;color:#fff;padding:7px 10px;text-align:left;font-size:12px}
td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
tr:nth-child(even) td{background:#f9fafb}
.pbtn{display:block;margin:0 auto 20px;padding:12px 28px;background:#065f46;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer}
.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:28px}
.sl{border-top:1px solid #111;padding-top:6px;font-size:12px;color:#6b7280}
.foot{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:12px;font-size:12px;color:#9ca3af;display:flex;justify-content:space-between}
</style></head><body>
<button class="pbtn no-print" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF</button>
<div class="hdr">
  <div><div class="logo">ReRack</div><div style="font-size:12px;color:#555;margin-top:4px">Sunu Plastic Odyssey × École Polytechnique de Thiès</div></div>
  <div style="text-align:right;font-size:12px;color:#555;line-height:2"><strong>FICHE TECHNIQUE DE FABRICATION</strong><br>Date : ${date}${ouvrier?'<br>Ouvrier : '+ouvrier:''}</div>
</div>
<div class="warn">⚠️ <strong>IMPORTANT :</strong> Vérifier chaque mesure avant la coupe. Dimensions en centimètres. Numéroter les pièces (P1, P2…) immédiatement après la coupe. Ne pas modifier largeur/épaisseur (dimensions fixes).</div>
<div class="sum">
  <div class="sc sc-g"><div class="sc-n">${profiles.length}</div><div>Pièces</div></div>
  <div class="sc sc-b"><div class="sc-n">${plan.length}</div><div>Unités matière</div></div>
  <div class="sc sc-p"><div class="sc-n">${totalCost.toLocaleString()} FCFA</div><div>Coût total</div></div>
</div>
<h2>DIMENSIONS GLOBALES DU PROJET</h2>
<div class="dims">
  <div class="dim-c dim-g"><div style="font-size:10px;font-weight:700;color:#065f46;text-transform:uppercase;margin-bottom:4px">Largeur</div><div style="font-size:26px;font-weight:900;font-family:monospace;color:#064e3b">${bounds.W} cm</div></div>
  <div class="dim-c dim-b"><div style="font-size:10px;font-weight:700;color:#1d4ed8;text-transform:uppercase;margin-bottom:4px">Hauteur</div><div style="font-size:26px;font-weight:900;font-family:monospace;color:#1e40af">${bounds.H} cm</div></div>
  <div class="dim-c dim-p"><div style="font-size:10px;font-weight:700;color:#7c3aed;text-transform:uppercase;margin-bottom:4px">Profondeur</div><div style="font-size:26px;font-weight:900;font-family:monospace;color:#4c1d95">${bounds.D} cm</div></div>
</div>
<h2>RENDU 3D — VUES MULTIPLES</h2>
<div class="views">${viewsHtml}</div>
<h2>INSTRUCTIONS DE MONTAGE</h2>${stepsHtml}
<h2>LISTE DES PIÈCES À FABRIQUER</h2>
<table><thead><tr><th>N°</th><th>Matériau</th><th>Longueur</th><th>Largeur</th><th>Épais.</th><th>Orientation</th><th>Type</th></tr></thead><tbody>${pRows}</tbody></table>
<h2>PLAN DE DÉCOUPE OPTIMISÉ</h2>${cutPl}
<div class="sig"><div class="sl">Signature ouvrier</div><div class="sl">Contrôle qualité</div><div class="sl">Date de fabrication</div></div>
<div class="foot"><span>ReRack – Sunu Plastic Odyssey × ÉPT | ${date}</span><span>Ne pas modifier les dimensions</span></div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `fiche-rerack-${Date.now()}.html`; a.click();
  URL.revokeObjectURL(url);
  showToast('Fiche téléchargée ! Ouvrez dans votre navigateur → Ctrl+P → PDF', 'success');
}


/* ================================================================
  12. PARTAGE VERS LA GALERIE (avec photo)
   ================================================================ */
let sharePhotoDataURL = null; // stocke la photo uploadée en base64

function initPhotoUpload() {
  const input = document.getElementById('photo-file');
  const area  = document.getElementById('photo-upload-area');
  if (!input || !area) return;

  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Photo trop grande (max 5 Mo)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = evt => {
      sharePhotoDataURL = evt.target.result;
      area.classList.add('has-photo');
      document.getElementById('photo-preview-wrap').innerHTML =
        `<img src="${sharePhotoDataURL}" alt="Aperçu" />`;
    };
    reader.readAsDataURL(file);
  });
}

function shareToGallery() {
  if (!profiles.length) { showToast('Ajoutez des profilés d\'abord', 'error'); return; }
  sharePhotoDataURL = null;
  // Réinitialise le preview
  const pw = document.getElementById('photo-preview-wrap');
  if (pw) pw.innerHTML = `<div style="font-size:36px">📷</div><div class="photo-upload-label">Cliquez pour ajouter une photo</div><div style="font-size:12px;color:#9ca3af;margin-top:4px">JPG, PNG · max 5 Mo</div>`;
  const area = document.getElementById('photo-upload-area');
  if (area) area.classList.remove('has-photo');
  document.getElementById('share-modal').style.display = 'flex';
}

function confirmShare() {
  const name = document.getElementById('share-name').value.trim();
  if (!name) { showToast('Donnez un nom au projet', 'error'); return; }
  const desc = document.getElementById('share-desc').value.trim();
  const cat  = document.getElementById('share-cat').value;
  const user = getUser();
  const bounds = getProjectBounds();

  // Utilise la photo uploadée ou une capture du canvas 3D comme fallback
  const imageData = sharePhotoDataURL || captureView(
    new THREE.Vector3(38, 33, 38), new THREE.Vector3(0, 5, 0)
  );

  const project = {
    id: `p-${Date.now()}`,
    title: name, description: desc, category: cat,
    author: user ? user.name : 'Anonyme',
    image: imageData,
    profiles, // sauvegarde les données des profilés
    bounds,   // dimensions globales
    likes: 0, comments: 0, views: 0,
    timestamp: new Date().toISOString(),
  };

  const existing = JSON.parse(localStorage.getItem('community-projects') || '[]');
  existing.push(project);
  localStorage.setItem('community-projects', JSON.stringify(existing));

  document.getElementById('share-modal').style.display = 'none';
  document.getElementById('share-name').value = '';
  document.getElementById('share-desc').value = '';
  showToast('Partagé à la galerie ! 🎉', 'success');
}


/* ================================================================
  13. ACTIONS DIVERSES (save / load / clear / export)
   ================================================================ */
function saveProject() {
  localStorage.setItem('rerack-project', JSON.stringify({ profiles, timestamp: Date.now() }));
  showToast('Projet sauvegardé !', 'success');
}

function loadProject() {
  const s = localStorage.getItem('rerack-project');
  if (!s) { showToast('Aucun projet sauvegardé', 'error'); return; }
  const d = JSON.parse(s);
  // Supprime les maillages existants
  profiles.forEach(p => removeMesh(p.id));
  profiles = d.profiles || [];
  // Reconstruit les maillages
  setTimeout(() => { profiles.forEach(p => addMeshToScene(p)); }, 300);
  selectedId = null; updateToolbar(); renderProperties(); renderCost(); updateHint();
  showToast('Projet chargé !', 'success');
}

function clearCanvas() {
  if (!profiles.length) return;
  if (!confirm('Effacer tout le canvas ?')) return;
  profiles.forEach(p => removeMesh(p.id));
  profiles = []; selectedId = null;
  updateToolbar(); renderProperties(); renderCost(); updateHint();
  document.getElementById('manip-bar').classList.remove('visible');
  showToast('Canvas effacé');
}

function exportJSON() {
  const blob = new Blob([JSON.stringify({ profiles, timestamp: Date.now() }, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `rerack-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('JSON exporté !', 'success');
}


/* ================================================================
  14. UI : TOOLBAR, HINT, DRAWER MOBILE
   ================================================================ */
function updateToolbar() {
  document.getElementById('profile-count').textContent = `${profiles.length} profilé${profiles.length !== 1 ? 's' : ''}`;
  const del    = document.getElementById('btn-delete-sel');
  const badge  = document.getElementById('selected-badge');
  const p      = profiles.find(x => x.id === selectedId);
  const pt     = p && PROFILE_TYPES.find(t => t.id === p.profileTypeId);
  if (selectedId && p) {
    del.style.display = badge.style.display = '';
    badge.textContent = pt ? pt.name : '1 sélectionné';
  } else {
    del.style.display = badge.style.display = 'none';
  }
}

function updateHint() {
  const el = document.getElementById('canvas-hint');
  if (el) el.style.opacity = profiles.length === 0 ? '1' : '0';
}

/* Rend la liste des profilés (partagée entre sidebar et drawer) */
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
  const el = document.getElementById('profile-list');
  if (el) el.innerHTML = html;
  window._profileListHTML = html; // cache pour le drawer
}

/* Ouvre le drawer mobile avec le contenu demandé */
function openDrawer(title, contentHTML) {
  document.getElementById('drawer-title').textContent  = title;
  document.getElementById('drawer-content').innerHTML  = contentHTML;
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('open');
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('open');
  document.querySelectorAll('.mbb-btn').forEach(b => b.classList.remove('active'));
}


/* ================================================================
  15. INITIALISATION GÉNÉRALE (DOMContentLoaded)
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  /* Lance Three.js */
  initThree();

  /* Peuple les panneaux */
  renderProfileList();
  renderProperties();
  renderCost();
  updateToolbar();
  updateHint();
  initPhotoUpload();

  /* Ombre header au scroll */
  window.addEventListener('scroll', () => {
    document.getElementById('header').classList.toggle('scrolled', window.scrollY > 10);
  });

  /* === Boutons de vue === */
  document.getElementById('view-btns').addEventListener('click', e => {
    const btn = e.target.closest('.view-btn');
    if (!btn) return;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setCameraView(btn.dataset.view);
  });

  /* === Modes de manipulation === */
  document.getElementById('manip-bar').addEventListener('click', e => {
    const btn = e.target.closest('.manip-btn');
    if (!btn) return;
    document.querySelectorAll('.manip-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    manipMode = btn.dataset.mode;
    // En mode snap, reconfigure le plan de drag
    if (manipMode === 'snap' && selectedId) {
      const p = profiles.find(x => x.id === selectedId);
      if (p) dragPlane = new THREE.Plane(new THREE.Vector3(0,1,0), -cm(p.y));
    }
  });

  /* === Toggle grille === */
  document.getElementById('snap-toggle').addEventListener('change', e => { snapEnabled = e.target.checked; });

  /* === Actions sidebar === */
  document.getElementById('btn-save').addEventListener('click', saveProject);
  document.getElementById('btn-load').addEventListener('click', loadProject);
  document.getElementById('btn-clear').addEventListener('click', clearCanvas);
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-share').addEventListener('click', shareToGallery);
  document.getElementById('btn-fiche').addEventListener('click', openFiche);
  document.getElementById('btn-delete-sel').addEventListener('click', () => { if (selectedId) deleteProfile(selectedId); });

  /* === Modals === */
  // Partage
  document.getElementById('close-share').addEventListener('click',  () => document.getElementById('share-modal').style.display = 'none');
  document.getElementById('cancel-share').addEventListener('click', () => document.getElementById('share-modal').style.display = 'none');
  document.getElementById('confirm-share').addEventListener('click', confirmShare);
  // Fiche
  document.getElementById('close-fiche').addEventListener('click',       () => document.getElementById('fiche-modal').style.display = 'none');
  document.getElementById('btn-download-fiche').addEventListener('click', downloadFiche);
  document.getElementById('btn-print-fiche').addEventListener('click',    () => window.print());
  // Fermeture overlay
  ['share-modal','fiche-modal'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.style.display = 'none'; });
  });

  /* === Drawer mobile === */
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);
  document.getElementById('drawer-close').addEventListener('click',   closeDrawer);

  document.getElementById('mbb-profiles').addEventListener('click', () => {
    openDrawer('Profilés disponibles', `<p class="sidebar-hint" style="margin-bottom:12px">Cliquez pour ajouter</p><div class="profile-list">${window._profileListHTML || ''}</div>`);
    document.getElementById('mbb-profiles').classList.add('active');
  });
  document.getElementById('mbb-props').addEventListener('click', () => {
    const div = document.createElement('div'); renderProperties(div);
    openDrawer('Propriétés', div.innerHTML);
    document.getElementById('mbb-props').classList.add('active');
  });
  document.getElementById('mbb-cost').addEventListener('click', () => {
    const div = document.createElement('div'); renderCost(div);
    openDrawer('Estimation du projet', div.innerHTML);
    document.getElementById('mbb-cost').classList.add('active');
  });
  document.getElementById('mbb-fiche').addEventListener('click', openFiche);
});
