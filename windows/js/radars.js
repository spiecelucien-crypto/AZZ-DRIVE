// Radars fixes : base embarquée (OpenStreetMap, highway=speed_camera) + compléments Overpass
// autour de la position, mis en cache localement. Index en grille pour des recherches en O(1)
// et projection sur le trajet pour un compte à rebours précis, sans à-coups.
import * as G from './geo.js';

const CELL = 0.05; // ~5 km
const OVERPASS = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const CACHE_KEY = 'azz.radars.v1';
const CACHE_TTL = 7 * 864e5;

const key = (lon, lat) => `${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`;

export class Radars {
  constructor() {
    this.grid = new Map();
    this.ids = new Set();
    this.count = 0;
    this.fetched = new Map(); // zone Overpass (0,5°) -> horodatage
    this.listeners = new Set();
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      for (const [z, v] of Object.entries(c)) if (Date.now() - v.t < CACHE_TTL) { this.fetched.set(z, v.t); v.p.forEach((p) => this.add(p)); }
    } catch {}
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); }

  add([lon, lat, max = 0, dir = -1]) {
    const id = `${lon.toFixed(4)},${lat.toFixed(4)}`;
    if (this.ids.has(id)) return;
    this.ids.add(id);
    const k = key(lon, lat);
    let cell = this.grid.get(k);
    if (!cell) this.grid.set(k, (cell = []));
    cell.push({ id, c: [lon, lat], max, dir });
    this.count++;
  }

  async loadStatic(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      const d = await r.json();
      for (const pts of Object.values(d)) pts.forEach((p) => this.add(p));
      this.staticLoaded = true;
      this.emit();
    } catch {}
  }

  // Complète la base autour d'un point (zones hors Benelux/France/Suisse ou radars récents).
  async watch(coord) {
    const z = `${Math.floor(coord[0] / 0.5)}:${Math.floor(coord[1] / 0.5)}`;
    if (this.fetched.has(z) || this.pending) return;
    this.pending = true;
    try {
      const [zx, zy] = z.split(':').map(Number);
      const s = zy * 0.5, w = zx * 0.5, n = s + 0.5, e = w + 0.5;
      const q = `[out:json][timeout:25];(node["highway"="speed_camera"](${s},${w},${n},${e}););out;`;
      let data = null;
      for (const ep of OVERPASS) {
        try {
          const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
          const r = await fetch(ep, { method: 'POST', body: new URLSearchParams({ data: q }), signal: ctl.signal });
          clearTimeout(t);
          if (r.ok) { data = await r.json(); break; }
        } catch {}
      }
      if (!data) return;
      const pts = data.elements.map((el) => [round5(el.lon), round5(el.lat), parseMax(el.tags?.maxspeed), parseDir(el.tags?.direction)]);
      pts.forEach((p) => this.add(p));
      this.fetched.set(z, Date.now());
      try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        c[z] = { t: Date.now(), p: pts };
        localStorage.setItem(CACHE_KEY, JSON.stringify(c));
      } catch {}
      this.emit();
    } finally { this.pending = false; }
  }

  near(coord, radius) {
    const out = [];
    const dLat = radius / 110540, dLon = radius / (111320 * Math.cos((coord[1] * Math.PI) / 180));
    const x0 = Math.floor((coord[0] - dLon) / CELL), x1 = Math.floor((coord[0] + dLon) / CELL);
    const y0 = Math.floor((coord[1] - dLat) / CELL), y1 = Math.floor((coord[1] + dLat) / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const cell = this.grid.get(`${x}:${y}`);
      if (cell) for (const r of cell) { const d = G.dist(coord, r.c); if (d <= radius) out.push({ ...r, d }); }
    }
    return out;
  }

  // Radars sur le trajet, devant soi. Respecte le sens de contrôle quand il est connu.
  onRoute(route, along, pos, maxAhead = 2500) {
    if (!route) return [];
    const out = [];
    const start = G.pointAlong(route.coords, route.cum, along).idx;
    for (const r of this.near(pos, maxAhead + 150)) {
      const s = G.snapToLine(r.c, route.coords, route.cum, Math.max(0, start - 1), maxAhead + 200);
      if (s.d > 28) continue;
      const ahead = s.along - along;
      if (ahead < -20 || ahead > maxAhead) continue;
      if (r.dir >= 0) {
        const h = G.headingAhead(route.coords, route.cum, s.along, 10);
        if (Math.abs(G.angleDiff(h, r.dir)) > 70) continue;
      }
      out.push({ ...r, ahead });
    }
    return out.sort((a, b) => a.ahead - b.ahead);
  }

  // Sans itinéraire : radars dans un cône de ±30° devant le véhicule.
  inCone(pos, heading, maxAhead = 1200) {
    const out = [];
    for (const r of this.near(pos, maxAhead)) {
      if (r.d < 15) continue;
      const b = G.bearing(pos, r.c);
      if (Math.abs(G.angleDiff(b, heading)) > 30) continue;
      if (r.dir >= 0 && Math.abs(G.angleDiff(heading, r.dir)) > 70) continue;
      out.push({ ...r, ahead: r.d });
    }
    return out.sort((a, b) => a.ahead - b.ahead);
  }

  geojson(center, radius = 30000) {
    return { type: 'FeatureCollection', features: this.near(center, radius).map((r) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: r.c }, properties: { max: r.max || 0 } })) };
  }
}

const round5 = (v) => Math.round(v * 1e5) / 1e5;
function parseMax(s) { const n = parseInt(String(s || '').split(/\s/)[0], 10); return Number.isFinite(n) ? n : 0; }
function parseDir(s) {
  if (s == null || s === '') return -1;
  const n = parseFloat(s);
  if (Number.isFinite(n)) return n;
  return { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }[String(s).toUpperCase()] ?? -1;
}

// Bip court et doux (WebAudio), deux tons. Le contexte est déverrouillé au premier geste.
let actx = null;
export function unlockAudio() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {}
}
export function beep(urgent = false) {
  if (!actx) return;
  const t0 = actx.currentTime;
  const tones = urgent ? [[1046, 0], [1046, 0.18], [1046, 0.36]] : [[880, 0], [1175, 0.16]];
  for (const [f, dt] of tones) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + dt);
    g.gain.linearRampToValueAtTime(0.22, t0 + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.14);
    o.connect(g).connect(actx.destination);
    o.start(t0 + dt); o.stop(t0 + dt + 0.16);
  }
}
