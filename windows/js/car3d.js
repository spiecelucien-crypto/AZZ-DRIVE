// Véhicules 3D procéduraux (Three.js) : carrosserie vernie, vitrage teinté, jantes, feux, plaque.
// Repère du modèle : mètres, Y vers le haut, avant du véhicule vers -Z.
import * as THREE from 'three';
import { resolveSpec } from './vehicles.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

export const MODELS = {
  citadine: { name: 'Citadine', desc: 'Compacte 5 portes', L: 4.05, W: 1.80, H: 1.44, wheelR: 0.33, wheelBase: 2.56, sill: 0.30, nose: 0.66, belt: 0.92, wsBase: -0.92, roofF: -0.30, roofR: 1.30, rgBase: 1.80, tail: 0.98, rearDrop: 0.04, tumble: 0.14 },
  berline: { name: 'Berline', desc: 'Grande routière', L: 4.75, W: 1.86, H: 1.42, wheelR: 0.34, wheelBase: 2.86, sill: 0.30, nose: 0.62, belt: 0.90, wsBase: -1.02, roofF: -0.18, roofR: 1.20, rgBase: 1.78, tail: 0.96, rearDrop: 0.0, tumble: 0.16, trunk: true },
  suv: { name: 'SUV', desc: 'Haut et robuste', L: 4.55, W: 1.92, H: 1.70, wheelR: 0.38, wheelBase: 2.72, sill: 0.42, nose: 0.86, belt: 1.12, wsBase: -1.08, roofF: -0.38, roofR: 1.58, rgBase: 2.06, tail: 1.18, rearDrop: 0.03, tumble: 0.12, rails: true, cladding: true },
  sportive: { name: 'Sportive', desc: 'Coupé bas et large', L: 4.45, W: 1.94, H: 1.26, wheelR: 0.35, wheelBase: 2.62, sill: 0.24, nose: 0.52, belt: 0.82, wsBase: -0.62, roofF: 0.08, roofR: 0.92, rgBase: 1.95, tail: 0.92, rearDrop: 0.0, tumble: 0.22, spoiler: true, sport: true, rim: 'multi' },
  break: { name: 'Break', desc: 'Familiale à grand coffre', L: 4.70, W: 1.83, H: 1.48, wheelR: 0.33, wheelBase: 2.80, sill: 0.30, nose: 0.64, belt: 0.92, wsBase: -1.02, roofF: -0.22, roofR: 1.78, rgBase: 2.12, tail: 1.06, rearDrop: 0.06, tumble: 0.14 },
  utilitaire: { name: 'Utilitaire', desc: 'Fourgon de livraison', L: 5.10, W: 2.00, H: 2.15, wheelR: 0.36, wheelBase: 3.30, sill: 0.40, nose: 0.95, belt: 1.16, wsBase: -1.62, roofF: -1.05, roofR: 2.50, rgBase: 2.55, tail: 2.10, rearDrop: 0.0, tumble: 0.04, van: true },
};

export const COLORS = [
  { id: 'noir', name: 'Noir', hex: '#0d0f13' },
  { id: 'blanc', name: 'Blanc nacré', hex: '#e9ebee' },
  { id: 'gris', name: 'Gris titane', hex: '#5b6068' },
  { id: 'argent', name: 'Argent', hex: '#a9aeb5' },
  { id: 'rouge', name: 'Rouge', hex: '#b3121b' },
  { id: 'bleu', name: 'Bleu nuit', hex: '#163a8a' },
  { id: 'vert', name: 'Vert anglais', hex: '#1f4d3a' },
  { id: 'jaune', name: 'Jaune', hex: '#e8b30d' },
  { id: 'orange', name: 'Orange', hex: '#e2621b' },
  { id: 'violet', name: 'Violet', hex: '#4b2a7b' },
];

let envCache = new WeakMap();
export function environmentFor(renderer, kind = 'room') {
  const key = kind;
  let per = envCache.get(renderer);
  if (!per) { per = {}; envCache.set(renderer, per); }
  if (per[key]) return per[key];
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(kind === 'room' ? new RoomEnvironment() : skyScene(kind), 0.04).texture;
  pmrem.dispose();
  per[key] = tex;
  return tex;
}

// Environnement « ciel » pour la carte : ciel sombre au zénith (le toit reste de la couleur de la peinture),
// horizon clair et quelques bandes lumineuses latérales pour des reflets de carrosserie crédibles.
function skyScene(kind) {
  const scene = new THREE.Scene();
  const night = kind === 'night';
  const top = new THREE.Color(night ? 0x0b1220 : 0x34465e);
  const hor = new THREE.Color(night ? 0x5a6a84 : 0xc8d4e2);
  const bot = new THREE.Color(night ? 0x07090d : 0x2a2c30);
  const geo = new THREE.SphereGeometry(10, 48, 24);
  const cols = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.55)) : hor.clone().lerp(bot, Math.pow(-y, 0.35));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const strip = new THREE.MeshBasicMaterial({ color: night ? 0xd0dcf5 : 0xffffff });
  for (const [x, z, ry] of [[-8, 0, Math.PI / 2], [8, 0, -Math.PI / 2], [0, -8, 0], [0, 8, Math.PI]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.9), strip);
    m.position.set(x, 1.6, z); m.rotation.y = ry;
    scene.add(m);
  }
  return scene;
}

function plateTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f7f4'; g.beginPath(); g.roundRect(0, 0, 512, 112, 14); g.fill();
  g.fillStyle = '#163ea8'; g.beginPath(); g.roundRect(0, 0, 70, 112, [14, 0, 0, 14]); g.fill();
  g.fillStyle = '#ffd200';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.arc(35 + Math.cos(a) * 18, 40 + Math.sin(a) * 18, 3, 0, 7); g.fill(); }
  g.fillStyle = '#fff'; g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('B', 35, 98);
  g.fillStyle = '#a3172b'; g.font = 'bold 74px system-ui, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((text || 'AZZ-DRIVE').toUpperCase().slice(0, 10), 290, 60);
  g.strokeStyle = '#1b1b1b'; g.lineWidth = 4; g.beginPath(); g.roundRect(2, 2, 508, 108, 12); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const shared = {};
function sharedTextures() {
  if (!shared.shadow) {
    shared.shadow = radialTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)');
    shared.glowRed = radialTexture('rgba(255,40,40,0.9)', 'rgba(255,0,0,0)');
    shared.glowWhite = radialTexture('rgba(255,244,214,0.85)', 'rgba(255,240,200,0)');
  }
  return shared;
}

function extrudeProfile(shape, width, bevel = 0.06) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, steps: 14, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 18 });
  // Profil dessiné dans le plan (z, y) : x de la forme = z du véhicule. On fait pivoter pour extruder selon X.
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  // Rotation : x de la forme -> z du véhicule (avant à -L/2, donc vers -Z), extrusion -> axe X.
  geo.rotateY(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

// Arrondit la voiture vue du dessus : coins avant/arrière en arc et faces avant/arrière légèrement bombées.
function roundPlan(geo, zFront, zRear, halfW, rF, rR, bow = 0.06, zone = 0.7) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ax = Math.abs(x);
    const curve = (r) => { const u = Math.min(1, Math.max(0, (ax - (halfW - r)) / r)); return r * (1 - Math.sqrt(1 - u * u)) + bow * (ax / halfW) * (ax / halfW); };
    const dF = z - zFront, dR = zRear - z;
    if (dF < zone) pos.setZ(i, z + curve(rF) * (1 - Math.max(0, dF) / zone));
    else if (dR < zone) pos.setZ(i, z - curve(rR) * (1 - Math.max(0, dR) / zone));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function taper(geo, y0, y1, amount) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > y0) {
      const k = Math.min(1, (y - y0) / (y1 - y0));
      pos.setX(i, pos.getX(i) * (1 - amount * k));
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function bodyShape(p) {
  const { L, wheelR, wheelBase, sill, nose, belt, wsBase, rgBase, tail } = p;
  const f = -L / 2, r = L / 2;
  const zF = -wheelBase / 2 - 0.02 + (p.van ? -0.25 : 0), zR = wheelBase / 2 + (p.van ? -0.1 : 0);
  const arch = wheelR + 0.07;
  const s = new THREE.Shape();
  s.moveTo(f + 0.10, sill + 0.02);
  s.quadraticCurveTo(f - 0.02, sill + 0.05, f, sill + 0.22);
  s.lineTo(f + 0.01, nose - 0.12);
  s.quadraticCurveTo(f + 0.03, nose, f + 0.22, nose + 0.02);
  // capot
  const hoodEnd = Math.min(wsBase, rgBase - 0.4);
  s.quadraticCurveTo((f + hoodEnd) / 2, belt - 0.02, hoodEnd, belt);
  // ligne de caisse jusqu'au hayon / coffre
  s.lineTo(Math.min(rgBase, r - 0.15), p.trunk ? belt + 0.02 : belt + 0.01);
  if (p.trunk) {
    s.quadraticCurveTo(r - 0.25, tail + 0.02, r - 0.06, tail - 0.04);
  } else {
    s.lineTo(r - 0.08, tail);
  }
  s.quadraticCurveTo(r + 0.01, tail - 0.06, r, tail - 0.25);
  s.lineTo(r - 0.01, sill + 0.22);
  s.quadraticCurveTo(r - 0.02, sill + 0.02, r - 0.14, sill + 0.02);
  // passage de roue arrière
  s.lineTo(zR + arch, sill + 0.02);
  s.absarc(zR, wheelR, arch, 0, Math.PI, false);
  s.lineTo(zF + arch, sill + 0.02);
  s.absarc(zF, wheelR, arch, 0, Math.PI, false);
  s.lineTo(f + 0.10, sill + 0.02);
  return { shape: s, zF, zR };
}

function cabinShape(p, inset = 0) {
  const { belt, H, wsBase, roofF, roofR, rgBase } = p;
  const s = new THREE.Shape();
  const top = H - inset;
  s.moveTo(wsBase + inset * 1.5, belt - 0.02);
  s.lineTo(roofF - 0.05, top - 0.04);
  s.quadraticCurveTo(roofF + 0.05, top, roofF + 0.25, top);
  s.lineTo(roofR - 0.2, top - p.rearDrop);
  s.quadraticCurveTo(roofR + 0.02, top - p.rearDrop, roofR + 0.08, top - p.rearDrop - 0.07);
  s.lineTo(rgBase - inset * 1.5, belt + (p.trunk ? 0.02 : 0.0));
  s.lineTo(wsBase + inset * 1.5, belt - 0.02);
  return s;
}

function makeWheel(p, mats) {
  const g = new THREE.Group();
  const r = p.wheelR, w = p.van ? 0.24 : p.sport ? 0.28 : 0.25;
  const style = p.rim || (p.van ? 'van' : '5');
  // Pneu au profil arrondi (tour)
  const prof = [];
  const rimR = r * 0.7;
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    const bulge = Math.sin(a);
    prof.push(new THREE.Vector2(rimR + (r - rimR) * (0.55 + 0.45 * bulge), -w / 2 + (w * i) / 16 * 1.0 - Math.cos(a) * 0.0));
  }
  prof.unshift(new THREE.Vector2(rimR, -w / 2)); prof.push(new THREE.Vector2(rimR, w / 2));
  const tireGeo = new THREE.LatheGeometry(prof, 40);
  tireGeo.rotateZ(Math.PI / 2);
  g.add(new THREE.Mesh(tireGeo, mats.tire));
  // Disque et étrier de frein (visibles entre les branches)
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.03, 28), mats.disc);
  disc.rotation.z = Math.PI / 2; disc.position.x = -0.02; g.add(disc);
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), mats.caliper);
  cal.position.set(0.0, rimR * 0.55, -rimR * 0.35); g.add(cal);
  g.userData.caliper = cal;
  // Jante : fond creux + branches doubles
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, w * 0.7, 32, 1, true), mats.rimDark);
  barrel.rotation.z = Math.PI / 2; g.add(barrel);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR - 0.008, 0.012, 8, 40), mats.rim);
  lip.rotation.y = Math.PI / 2; lip.position.x = w * 0.33; g.add(lip);
  const spokes = style === 'van' ? 6 : style === 'multi' ? 10 : style === 'y' ? 10 : style === 'aero' ? 5 : 5;
  const face = new THREE.Group();
  if (style === 'aero') {
    // Jante aérodynamique (voitures électriques) : flasque presque plein
    const plate = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.96, 36), mats.rimDark);
    plate.rotation.y = Math.PI / 2; plate.position.x = w * 0.28; face.add(plate);
  }
  for (let i = 0; i < spokes; i++) {
    const thin = style === 'multi' || style === 'y';
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.035, rimR * (style === 'aero' ? 0.6 : 0.92), thin ? 0.035 : 0.065), mats.rim);
    sp.geometry.translate(0, rimR * 0.46, 0);
    // jantes en Y : branches groupées par paires
    sp.rotation.x = (i / spokes) * Math.PI * 2 + (style === 'y' ? (i % 2 ? -0.16 : 0.16) : 0);
    sp.rotation.order = 'XYZ';
    sp.position.x = w * 0.3;
    // légère concavité : branches inclinées vers l'intérieur
    sp.geometry.rotateZ(-0.12);
    face.add(sp);
  }
  g.add(face);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.04, 20), mats.rim);
  hub.rotation.z = Math.PI / 2; hub.position.x = w * 0.3; g.add(hub);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), mats.chrome);
  cap.rotation.y = Math.PI / 2; cap.position.x = w * 0.3 + 0.021; g.add(cap);
  return g;
}

export function buildCar({ model = 'citadine', vid = '', color = '#0d0f13', plate = 'AZZ-DRIVE' } = {}) {
  const p = resolveSpec(MODELS, { model, vid });
  const root = new THREE.Group();
  root.name = 'car';
  const body = new THREE.Group();
  root.add(body);

  const paintColor = new THREE.Color(color);
  const mats = {
    paint: new THREE.MeshPhysicalMaterial({ color: paintColor, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0e14, metalness: 0.2, roughness: 0.1, envMapIntensity: 0.35, clearcoat: 0.6 }),
    // vitres teintées légèrement transparentes : on devine l'intérieur
    cabinGlass: new THREE.MeshPhysicalMaterial({ color: 0x101820, metalness: 0.1, roughness: 0.06, envMapIntensity: 0.55, clearcoat: 1, transparent: true, opacity: 0.8, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.75, metalness: 0.1 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.95, roughness: 0.22 }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x8d939b, metalness: 0.9, roughness: 0.3 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.12 }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    tailDim: new THREE.MeshStandardMaterial({ color: 0x5a0508, emissive: 0x9a0a10, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.2 }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff6e2 }),
    seam: new THREE.MeshBasicMaterial({ color: 0x050607 }),
    disc: new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.8, roughness: 0.45 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xc8202a, metalness: 0.3, roughness: 0.4 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x1a0a0c, metalness: 0.1, roughness: 0.08, clearcoat: 1, envMapIntensity: 0.9 }),
    plate: new THREE.MeshBasicMaterial({ map: plateTexture(plate) }),
  };
  mats.roof = new THREE.MeshPhysicalMaterial({ color: p.roofBlack ? new THREE.Color(0x0b0c0f) : paintColor, metalness: 0.25, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.12 });
  // Le contour extrudé est gonflé par le biseau (0,08 m) : les pièces arrière/avant sont posées sur la vraie surface.
  const RZ = p.L / 2 + 0.08, FZ = -p.L / 2 - 0.08;

  // Carrosserie basse
  const { shape, zF, zR } = bodyShape(p);
  const bodyMesh = new THREE.Mesh(extrudeProfile(shape, p.W, 0.08), mats.paint);
  taper(bodyMesh.geometry, p.belt - 0.25, p.belt + 0.05, 0.035);
  const rF = p.van ? 0.22 : 0.42, rR = p.van ? 0.16 : 0.32, bow = p.van ? 0.03 : 0.07, halfW = p.W / 2 + 0.08;
  roundPlan(bodyMesh.geometry, FZ, RZ, halfW, rF, rR, bow);
  // Recul de la surface avant/arrière à une abscisse x (pour poser feux, plaque, boucliers dessus)
  const endOff = (x, r) => { const ax = Math.min(Math.abs(x), halfW); const u = Math.min(1, Math.max(0, (ax - (halfW - r)) / r)); return r * (1 - Math.sqrt(1 - u * u)) + bow * (ax / halfW) * (ax / halfW); };
  // Cintre une pièce (centrée en x) pour suivre la face arrière (dir = 1) ou avant (dir = -1)
  const bend = (mesh, dir, r) => { const g = mesh.geometry; const ps = g.attributes.position; for (let i = 0; i < ps.count; i++) ps.setZ(i, ps.getZ(i) - dir * endOff(ps.getX(i) + mesh.position.x, r)); ps.needsUpdate = true; g.computeVertexNormals(); };
  const seg = (w, h, d) => new THREE.BoxGeometry(w, h, d, 16, 1, 1);
  body.add(bodyMesh);

  // Habitacle vitré + toit peint
  const cab = new THREE.Mesh(extrudeProfile(cabinShape(p), p.W * 0.9, 0.06), mats.cabinGlass);
  cab.renderOrder = 2;
  // Intérieur : planche de bord, sièges et appuie-tête (visibles à travers les vitres)
  if (!p.van) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.82, 0.12, 0.35), mats.interior);
    dash.position.set(0, p.belt + 0.02, p.wsBase + 0.32); body.add(dash);
    const rows = p.sport ? [p.wsBase + 1.15] : [p.wsBase + 1.05, p.wsBase + 1.95];
    rows.forEach((z, row) => {
      if (z > p.rgBase - 0.2) return;
      for (const side of row === 0 ? [-1, 1] : [-1, 0, 1]) {
        const x = side * p.W * (row === 0 ? 0.22 : 0.27);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.1), mats.interior);
        back.position.set(x, p.belt + 0.08, z); back.rotation.x = 0.18; body.add(back);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.09), mats.interior);
        head.position.set(x, Math.min(p.H - 0.16, p.belt + 0.44), z + 0.06); head.rotation.x = 0.1; body.add(head);
      }
    });
  }
  taper(cab.geometry, p.belt, p.H, p.tumble);
  roundPlan(cab.geometry, p.wsBase - 0.1, p.rgBase + 0.1, p.W * 0.45, 0.3, 0.26, 0.04, 0.9);
  body.add(cab);
  const roofShape = new THREE.Shape();
  const rf = p.roofF + 0.18, rr = p.roofR - 0.12;
  // Le vitrage est gonflé par son biseau (0,06 m) : le toit peint est posé juste au-dessus.
  roofShape.moveTo(rf - 0.08, p.H + 0.0);
  roofShape.lineTo(rr + 0.06, p.H + 0.0 - p.rearDrop);
  roofShape.lineTo(rr + 0.02, p.H + 0.05 - p.rearDrop);
  roofShape.lineTo(rf - 0.04, p.H + 0.05);
  const roof = new THREE.Mesh(extrudeProfile(roofShape, p.W * 0.9 * (1 - p.tumble) + 0.08, 0.025), mats.roof);
  body.add(roof);

  // Montants (B) peints
  const bz = (p.roofF + p.roofR) / 2 - (p.van ? 0.9 : 0.1);
  for (const side of [-1, 1]) {
    const halfAtBelt = (p.W * 0.9) / 2;
    const halfAtRoof = halfAtBelt * (1 - p.tumble);
    const h = p.H - p.belt;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.12), mats.trim);
    pillar.position.set(side * (halfAtBelt + halfAtRoof) / 2 + side * 0.012, p.belt + h / 2 - 0.02, bz);
    pillar.rotation.z = side * Math.atan((halfAtBelt - halfAtRoof) / h);
    body.add(pillar);
    // rétroviseur
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), p.roofBlack ? mats.roof : mats.paint);
    mirror.scale.set(1.0, 0.62, 0.55);
    mirror.position.set(side * (p.W / 2 + 0.07), p.belt + 0.08, p.wsBase + 0.24);
    body.add(mirror);
    const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.05), mats.trim);
    mirrorArm.position.set(side * (p.W / 2 - 0.02), p.belt + 0.04, p.wsBase + 0.24);
    body.add(mirrorArm);
  }

  // Jonc chromé sous les vitres, joints de portes et poignées
  for (const side of [-1, 1]) {
    const x = side * (p.W * 0.45 + 0.055);
    const len = p.rgBase - p.wsBase - 0.3;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, len), mats.chrome);
    strip.position.set(x, p.belt + 0.005, (p.wsBase + p.rgBase) / 2); body.add(strip);
    const xs = side * (p.W / 2 + 0.072);
    const doors = p.van ? [p.wsBase + 0.95] : p.sport ? [bz + 0.25] : [bz - 0.02, bz + 0.98];
    const zs = [p.wsBase + 0.05, ...doors];
    for (const z of zs) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.006, p.belt - p.sill - 0.12, 0.008), mats.seam);
      seam.position.set(xs * 0.995, (p.belt + p.sill) / 2 + 0.03, z); body.add(seam);
    }
    for (let i = 0; i < zs.length - 1; i++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.15), mats.chrome);
      h.position.set(xs, p.belt - 0.1, zs[i + 1] - 0.22); body.add(h);
    }
  }

  // Bas de caisse / bouclier noirs
  const rearBumper = new THREE.Mesh(seg(p.W * 0.96, 0.18, 0.12), mats.trim);
  rearBumper.position.set(0, p.sill + 0.09, RZ - 0.03);
  bend(rearBumper, 1, rR);
  body.add(rearBumper);
  // Diffuseur et sorties d'échappement
  const diff = new THREE.Mesh(seg(p.W * 0.6, 0.06, 0.2), mats.trim);
  diff.position.set(0, p.sill + 0.0, RZ - 0.08); bend(diff, 1, rR); body.add(diff);
  if (!p.van && !p.ev) for (const side of (p.sport ? [-1, 1] : [-1])) {
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 20, 1, true), mats.chrome);
    ex.rotation.x = Math.PI / 2; ex.position.set(side * p.W * 0.3, p.sill + 0.03, RZ - endOff(side * p.W * 0.3, rR) + 0.02); body.add(ex);
    const exIn = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), mats.tire);
    exIn.position.set(side * p.W * 0.3, p.sill + 0.03, RZ - endOff(side * p.W * 0.3, rR) + 0.0); body.add(exIn);
  }
  const frontLip = new THREE.Mesh(seg(p.W * 0.92, 0.12, 0.12), mats.trim);
  frontLip.position.set(0, p.sill + 0.07, FZ + 0.03);
  bend(frontLip, -1, rF);
  body.add(frontLip);
  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, (zR - zF) - (p.wheelR + 0.08) * 2), mats.trim);
    skirt.position.set(side * (p.W / 2 - 0.01), p.sill + 0.07, (zF + zR) / 2);
    body.add(skirt);
  }
  if (p.cladding) {
    for (const z of [zF, zR]) for (const side of [-1, 1]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(p.wheelR + 0.08, 0.05, 6, 20, Math.PI), mats.trim);
      arc.rotation.y = Math.PI / 2;
      arc.position.set(side * (p.W / 2 - 0.0), p.wheelR, z);
      body.add(arc);
    }
  }

  // Calandre
  const gy = p.nose - 0.24;
  const addF = (mesh, x, y, dz = 0.01) => { mesh.position.set(x, y, FZ + dz); bend(mesh, -1, rF); body.add(mesh); return mesh; };
  if (p.grille === 'kidney') {
    // double calandre verticale cerclée de chrome
    for (const side of [-1, 1]) {
      addF(new THREE.Mesh(seg(0.27, 0.24, 0.05), mats.chrome), side * 0.16, gy + 0.02, 0.0);
      addF(new THREE.Mesh(seg(0.23, 0.2, 0.05), mats.trim), side * 0.16, gy + 0.02, -0.008);
    }
  } else if (p.grille === 'frame') {
    // grande calandre trapézoïdale
    addF(new THREE.Mesh(seg(p.W * 0.5, 0.34, 0.05), mats.chrome), 0, gy - 0.06, 0.0);
    addF(new THREE.Mesh(seg(p.W * 0.47, 0.31, 0.05), mats.trim), 0, gy - 0.06, -0.008);
  } else if (p.grille === 'star') {
    addF(new THREE.Mesh(seg(p.W * 0.52, 0.22, 0.05), mats.trim), 0, gy, 0.01);
    addF(new THREE.Mesh(seg(p.W * 0.5, 0.025, 0.05), mats.chrome), 0, gy, 0.0);
    const emb = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), mats.chrome);
    emb.rotation.y = Math.PI; emb.position.set(0, gy, FZ - 0.03 + endOff(0, rF)); body.add(emb);
  } else if (p.grille === 'closed') {
    // électrique : face avant pleine, simple fente basse
    addF(new THREE.Mesh(seg(p.W * 0.5, 0.05, 0.05), mats.trim), 0, gy + 0.06, 0.012);
  } else {
    addF(new THREE.Mesh(seg(p.W * 0.56, 0.18, 0.05), mats.trim), 0, gy, 0.01);
  }
  if (!p.van) addF(new THREE.Mesh(seg(p.W * (p.ev ? 0.55 : 0.7), p.ev ? 0.08 : 0.12, 0.05), mats.trim), 0, p.sill + 0.2, 0.01);

  // Feux arrière : deux blocs + bandeau lumineux
  const tailY = Math.min(p.tail - 0.16, p.belt + 0.02);
  const tails = [];
  const rear = p.rear || 'split';
  const addR = (mesh, x, y, dz = 0.004) => { mesh.position.set(x, y, RZ + dz); bend(mesh, 1, rR); body.add(mesh); return mesh; };
  if (rear === 'bar') {
    // bandeau lumineux sur toute la largeur
    addR(new THREE.Mesh(seg(p.W * 0.94, 0.12, 0.05), mats.lens), 0, tailY + 0.01, -0.005);
    tails.push(addR(new THREE.Mesh(seg(p.W * 0.9, 0.035, 0.05), mats.tail), 0, tailY + 0.02));
  }
  for (const side of [-1, 1]) {
    if (rear === 'vertical') {
      // feux verticaux le long du montant arrière
      // posés sur la caisse, de sous le feu jusqu'à la ligne de vitre
      const vx = side * (p.W / 2 - 0.12), y0 = tailY - 0.2, y1 = Math.min(p.tail, p.belt) - 0.03, vh = Math.max(0.2, y1 - y0);
      const vz = RZ - endOff(vx, rR);
      const vl = new THREE.Mesh(new THREE.BoxGeometry(0.12, vh, 0.05), mats.lens);
      vl.position.set(vx, y0 + vh / 2, vz - 0.005); body.add(vl);
      const vt = new THREE.Mesh(new THREE.BoxGeometry(0.04, vh - 0.05, 0.05), mats.tail);
      vt.position.set(vx, y0 + vh / 2, vz + 0.006); body.add(vt); tails.push(vt);
      const hz = new THREE.Mesh(seg(0.22, 0.035, 0.05), mats.tail);
      tails.push(addR(hz, side * (p.W / 2 - 0.22), tailY - 0.03));
      continue;
    }
    if (rear === 'claw' || rear === 'tri') {
      // trois griffes lumineuses par côté
      const cx = side * (p.W / 2 - 0.26);
      addR(new THREE.Mesh(seg(0.42, 0.18, 0.05), mats.lens), cx, tailY, -0.005);
      for (let i = -1; i <= 1; i++) {
        const cl = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.13, 0.05), mats.tail);
        const x = cx + i * 0.1;
        cl.position.set(x, tailY, RZ - endOff(x, rR) + 0.006);
        if (rear === 'claw') cl.rotation.z = side * 0.35;
        body.add(cl); tails.push(cl);
      }
      continue;
    }
    if (rear === 'round') {
      // feux ronds
      for (const k of [0, 1]) {
        const x = side * (p.W / 2 - 0.2 - k * 0.2);
        const z = RZ - endOff(x, rR) + 0.012;
        const ring = new THREE.Mesh(new THREE.CircleGeometry(0.085, 24), mats.lens); ring.position.set(x, tailY, z - 0.002); body.add(ring);
        const led = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.07, 24), mats.tail); led.position.set(x, tailY, z); body.add(led); tails.push(led);
      }
      continue;
    }
    if (rear === 'bar') {
      const tl = new THREE.Mesh(seg(0.34, 0.06, 0.05), mats.tail);
      tails.push(addR(tl, side * (p.W / 2 - 0.22), tailY + 0.0, 0.006));
      continue;
    }
    // Bloc principal cintré : verre fumé + LED
    const lens = new THREE.Mesh(seg(0.5, 0.16, 0.05), mats.lens);
    lens.position.set(side * (p.W / 2 - 0.22), tailY, RZ - 0.005);
    bend(lens, 1, rR); body.add(lens);
    const tl = new THREE.Mesh(seg(0.42, 0.05, 0.05), mats.tail);
    tl.position.set(side * (p.W / 2 - 0.24), tailY + 0.03, RZ + 0.004);
    bend(tl, 1, rR); body.add(tl); tails.push(tl);
    const tl2 = new THREE.Mesh(seg(0.3, 0.03, 0.05), mats.tail);
    tl2.position.set(side * (p.W / 2 - 0.3), tailY - 0.04, RZ + 0.004);
    bend(tl2, 1, rR); body.add(tl2); tails.push(tl2);
    // Catadioptre bas
    const refl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), mats.tailDim);
    refl.position.set(side * (p.W / 2 - 0.2), p.sill + 0.12, RZ - endOff(p.W / 2 - 0.2, rR) + 0.02);
    body.add(refl);
  }
  const bar = new THREE.Mesh(seg(p.W * 0.52, 0.028, 0.04), mats.tail);
  bar.position.set(0, tailY + 0.03, RZ - 0.004);
  bend(bar, 1, rR);
  bar.visible = rear === 'split';
  // Troisième feu stop en haut de la lunette
  const cms = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.025, 0.03), mats.tail);
  cms.position.set(0, (p.van ? p.tail : p.H) - 0.04, p.van ? RZ - 0.01 : p.roofR + 0.06); body.add(cms); tails.push(cms);
  body.add(bar); tails.push(bar);

  // Plaque
  const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.124), mats.plate);
  plateMesh.position.set(0, p.sill + 0.34, RZ + 0.012 - endOff(0.28, rR));
  body.add(plateMesh);
  const plateF = plateMesh.clone();
  plateF.position.set(0, p.sill + 0.2, FZ - 0.012 + endOff(0.28, rF));
  plateF.rotation.y = Math.PI;
  body.add(plateF);

  // Phares : plans orientés vers l'avant (invisibles depuis l'arrière)
  for (const side of [-1, 1]) {
    const hx = side * (p.W / 2 - 0.27);
    if (p.front === 'round') {
      const z = FZ + endOff(hx, rF) - 0.012;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 8, 28), mats.chrome);
      ring.position.set(hx, p.nose - 0.1, z); body.add(ring);
      const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.1, 28), mats.glass);
      lensF.rotation.y = Math.PI; lensF.position.set(hx, p.nose - 0.1, z + 0.004); body.add(lensF);
      const drlR = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.092, 28), mats.head);
      drlR.rotation.y = Math.PI; drlR.position.set(hx, p.nose - 0.1, z - 0.002); body.add(drlR);
      continue;
    }
    if (p.front === 'fang') {
      // « crocs » lumineux verticaux sous les phares
      const fang = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.03), mats.head);
      const fx = hx + side * 0.12;
      fang.position.set(fx, p.nose - 0.28, FZ + endOff(fx, rF) - 0.01); fang.rotation.z = -side * 0.25; body.add(fang);
    }
    const housing = new THREE.Mesh(seg(0.46, 0.14, 0.05), mats.glass);
    housing.position.set(hx, p.nose - 0.08, FZ + 0.0); bend(housing, -1, rF); body.add(housing);
    const drl = new THREE.Mesh(seg(0.42, 0.025, 0.05), mats.head);
    drl.position.set(hx, p.nose - 0.03, FZ - 0.006); bend(drl, -1, rF); body.add(drl);
    const proj = new THREE.Mesh(new THREE.CircleGeometry(0.04, 18), mats.head);
    proj.rotation.y = Math.PI; proj.position.set(hx - side * 0.08, p.nose - 0.1, FZ - 0.03 + endOff(hx - side * 0.08, rF)); body.add(proj);
  }
  // Accessoires
  if (p.rails) {
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, (p.roofR - p.roofF) * 0.85), mats.trim);
      rail.position.set(side * (p.W * 0.9 * (1 - p.tumble)) / 2 * 0.88, p.H + 0.04, (p.roofF + p.roofR) / 2);
      body.add(rail);
    }
  }
  if (p.ev && p.grille === 'closed') {
    // bandeau lumineux avant des voitures électriques
    const lb = new THREE.Mesh(seg(p.W * 0.5, 0.018, 0.04), mats.head);
    lb.position.set(0, p.nose - 0.03, FZ - 0.004); bend(lb, -1, rF); body.add(lb);
  }
  if (p.spoiler) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(p.W * 0.82, 0.03, 0.22), mats.trim);
    wing.position.set(0, p.tail + 0.1, p.L / 2 - 0.16);
    body.add(wing);
    for (const side of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.06), mats.trim);
      st.position.set(side * p.W * 0.3, p.tail + 0.04, p.L / 2 - 0.14);
      body.add(st);
    }
  }
  if (p.van) {
    // Portes arrière peintes avec deux vitres
    const ph = p.H - p.belt + 0.05;
    const panel = new THREE.Mesh(seg(p.W * 0.93, ph, 0.06), mats.paint);
    panel.position.set(0, p.belt + ph / 2 - 0.02, RZ - 0.04); bend(panel, 1, rR); body.add(panel);
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(seg(p.W * 0.36, ph * 0.5, 0.02), mats.glass);
      win.position.set(side * p.W * 0.215, p.belt + ph * 0.55, RZ - 0.005); bend(win, 1, rR); body.add(win);
    }
    // portes arrière : séparation verticale
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.015, p.tail - p.sill - 0.35, 0.02), mats.trim);
    seam.position.set(0, (p.tail + p.sill) / 2 + 0.1, RZ + 0.005);
    body.add(seam);
  }

  // Roues
  const wheels = [];
  for (const z of [zF, zR]) for (const side of [-1, 1]) {
    const w = makeWheel(p, mats);
    const pivot = new THREE.Group();
    pivot.position.set(side * (p.W / 2 - 0.16), p.wheelR, z);
    if (side < 0) w.rotation.y = Math.PI;
    pivot.add(w);
    // l'étrier ne tourne pas avec la roue
    const cal = w.userData.caliper; w.remove(cal); pivot.add(cal);
    root.add(pivot);
    wheels.push({ pivot, wheel: w, front: z === zF, side });
  }

  // Ombre portée + halos au sol
  const tx = sharedTextures();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(p.W * 1.55, p.L * 1.3), new THREE.MeshBasicMaterial({ map: tx.shadow, transparent: true, depthWrite: false, opacity: 0.85 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; shadow.renderOrder = -1;
  root.add(shadow);
  // Ombre de contact serrée sous la caisse (ancre la voiture au sol)
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(p.W * 1.08, p.L * 0.98), new THREE.MeshBasicMaterial({ map: tx.shadow, transparent: true, depthWrite: false, opacity: 0.95 }));
  ao.rotation.x = -Math.PI / 2; ao.position.y = 0.015; ao.renderOrder = -1;
  root.add(ao);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(p.W * 1.6, 1.9), new THREE.MeshBasicMaterial({ map: tx.glowRed, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.02, p.L / 2 + 0.45);
  root.add(glow);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(p.W * 2.0, 6.5), new THREE.MeshBasicMaterial({ map: tx.glowWhite, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.0 }));
  beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.02, -p.L / 2 - 3.2);
  root.add(beam);

  root.userData = { spec: p, wheels, body, tails, mats, glow, beam, spin: 0 };
  return root;
}

// Animation : roues, braquage, roulis, freinage, mode nuit
export function animateCar(car, { speed = 0, turnRate = 0, braking = false, night = false, dt = 0.016 }) {
  const u = car.userData;
  u.spin = (u.spin + (speed * dt) / u.spec.wheelR) % (Math.PI * 2);
  const steer = THREE.MathUtils.clamp(turnRate * 0.9, -0.45, 0.45);
  for (const w of u.wheels) {
    w.wheel.rotation.x = w.side < 0 ? u.spin : -u.spin;
    w.pivot.rotation.y = w.front ? -steer : 0;
  }
  const roll = THREE.MathUtils.clamp(turnRate * speed * 0.004, -0.035, 0.035);
  u.body.rotation.z += (roll - u.body.rotation.z) * 0.12;
  const pitch = braking ? 0.012 : 0;
  u.body.rotation.x += (pitch - u.body.rotation.x) * 0.1;
  const tailColor = braking ? 0xff3b3b : night ? 0xff2020 : 0xd41a1a;
  for (const t of u.tails) t.material.color.setHex(tailColor);
  u.glow.material.opacity = braking ? 0.95 : night ? 0.6 : 0.3;
  u.beam.material.opacity = night ? 0.3 : 0;
}

export function disposeCar(car) {
  car.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const m = o.material;
      if (m.map && m.map !== shared.shadow && m.map !== shared.glowRed && m.map !== shared.glowWhite) m.map.dispose();
      m.dispose();
    }
  });
}

// Aperçu « garage » : scène studio qui tourne lentement
export class Garage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.environment = environmentFor(this.renderer);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 6, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc6ff, 1.0); rim.position.set(-5, 3, -4); this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x202024, 0.6));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.55, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.66, 96), new THREE.MeshBasicMaterial({ color: 0x27d7e8, transparent: true, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004;
    this.scene.add(ring);
    this.angle = 0.7;
    this.running = false;
    this.drag = null;
    canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, a: this.angle }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (this.drag) this.angle = this.drag.a + (e.clientX - this.drag.x) * 0.01; });
    canvas.addEventListener('pointerup', () => { this.drag = null; });
    this.loop = this.loop.bind(this);
  }
  setCar(spec) {
    if (this.car) { this.scene.remove(this.car); disposeCar(this.car); }
    this.car = buildCar(spec);
    this.car.userData.glow.visible = false;
    this.car.userData.beam.visible = false;
    this.scene.add(this.car);
    const L = this.car.userData.spec.L;
    this.dist = L * 1.55 + 2.2;
  }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  start() { if (!this.running) { this.running = true; this.resize(); requestAnimationFrame(this.loop); } }
  stop() { this.running = false; }
  destroy() { this.running = false; try { if (this.car) disposeCar(this.car); this.renderer.dispose(); this.renderer.forceContextLoss(); } catch {} }
  loop() {
    if (!this.running) return;
    if (!this.drag) this.angle += 0.004;
    const d = this.dist || 8;
    this.camera.position.set(Math.sin(this.angle) * d, 1.7, Math.cos(this.angle) * d);
    this.camera.lookAt(0, 0.62, 0);
    if (this.car) animateCar(this.car, { speed: 0, dt: 0.016 });
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }
}

// Couche personnalisée MapLibre : la voiture rendue dans la scène de la carte
export class CarLayer {
  constructor() {
    this.id = 'azz-car';
    this.type = 'custom';
    this.renderingMode = '3d';
    this.pose = null; // {lngLat, heading, scale}
    this.spec = null;
    this.night = false;
    this.anim = { speed: 0, turnRate: 0, braking: false };
    this.lastT = performance.now();
  }
  setSpec(spec) {
    this.spec = spec;
    if (this.scene) this.rebuild();
  }
  rebuild() {
    if (this.car) { this.scene.remove(this.car); disposeCar(this.car); }
    this.car = buildCar(this.spec || {});
    this.scene.add(this.car);
  }
  onAdd(map, gl) {
    this.map = map;
    if (!this.renderer || this.gl !== gl) {
      this.gl = gl;
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      this.scene = new THREE.Scene();
      this.scene.environment = environmentFor(this.renderer, this.night ? 'night' : 'day');
      this.envKind = this.night ? 'night' : 'day';
      this.camera = new THREE.Camera();
      this.hemi = new THREE.HemisphereLight(0xdde6ff, 0x30302c, 0.9);
      this.scene.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
      this.sun.position.set(-3, 8, 5);
      this.scene.add(this.sun);
      this.back = new THREE.DirectionalLight(0xbcd2ff, 0.5);
      this.back.position.set(2, 4, 8);
      this.scene.add(this.back);
      this.rebuild();
    }
  }
  render(gl, args) {
    if (!this.pose || !this.car || !window.maplibregl) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const { lngLat, heading, scale } = this.pose;
    const mc = window.maplibregl.MercatorCoordinate.fromLngLat(lngLat, 0);
    const s = mc.meterInMercatorCoordinateUnits() * (scale || 1);
    this.car.rotation.y = THREE.MathUtils.degToRad(-heading);
    animateCar(this.car, { ...this.anim, night: this.night, dt });
    this.hemi.intensity = this.night ? 0.55 : 0.95;
    this.sun.intensity = this.night ? 0.7 : 1.7;
    const kind = this.night ? 'night' : 'day';
    if (this.envKind !== kind) { this.envKind = kind; this.scene.environment = environmentFor(this.renderer, kind); }
    this.scene.environmentIntensity = this.night ? 0.9 : 1.0;

    const m = new THREE.Matrix4().fromArray((args.defaultProjectionData && args.defaultProjectionData.mainMatrix) || args.modelViewProjectionMatrix);
    const l = new THREE.Matrix4()
      .makeTranslation(mc.x, mc.y, mc.z)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    const mvp = m.multiply(l);
    // Position de la caméra dans le repère du modèle (pour des reflets corrects)
    const inv = mvp.clone().invert();
    const eye = new THREE.Vector4(0, 0, -1, 0).applyMatrix4(inv);
    let eyePos = new THREE.Vector3(0, 30, 30);
    if (Math.abs(eye.w) > 1e-12) eyePos = new THREE.Vector3(eye.x / eye.w, eye.y / eye.w, eye.z / eye.w);
    if (!isFinite(eyePos.x) || eyePos.length() > 1e6) eyePos.set(0, 30, 30);
    // Éclairage lié à la caméra : la face visible reste bien éclairée et le toit ne « brûle » pas.
    const ed = eyePos.clone().setY(0).normalize();
    const side = new THREE.Vector3(-ed.z, 0, ed.x);
    this.sun.position.set(ed.x * 4 + side.x * 2, 9, ed.z * 4 + side.z * 2);
    this.back.position.set(side.x * 6 - ed.x * 2, 2.5, side.z * 6 - ed.z * 2);
    this.camera.projectionMatrix.copy(mvp).multiply(new THREE.Matrix4().makeTranslation(eyePos.x, eyePos.y, eyePos.z));
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.matrixWorld.makeTranslation(eyePos.x, eyePos.y, eyePos.z);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
