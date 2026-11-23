// Localisation précise : filtre de Kalman (position + vitesse), rejet des points aberrants,
// cap fiable (cap GPS en roulant, boussole à l'arrêt) et accrochage aux routes visibles.
import { bearing, dist, angleDiff, projectOnSegment, clamp } from './geo.js';

const R_LAT = 110540;
function mul(A, B) { const n = A.length, m = B[0].length, k = B.length; const C = []; for (let i = 0; i < n; i++) { C.push(new Array(m).fill(0)); for (let j = 0; j < m; j++) { let v = 0; for (let t = 0; t < k; t++) v += A[i][t] * B[t][j]; C[i][j] = v; } } return C; }
function transpose(A) { return A[0].map((_, j) => A.map((r) => r[j])); }
const kx = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

// Filtre de Kalman 2D à vitesse constante, dans un repère local en mètres (est, nord).
export class Kalman2D {
  constructor() { this.reset(); }
  reset() { this.x = null; this.P = null; this.t = 0; this.origin = null; }
  toLocal(c) { return [(c[0] - this.origin[0]) * kx(this.origin[1]), (c[1] - this.origin[1]) * R_LAT]; }
  toGeo(x, y) { return [this.origin[0] + x / kx(this.origin[1]), this.origin[1] + y / R_LAT]; }

  init(c, acc, t, vel) {
    this.origin = c.slice();
    this.x = [0, 0, vel ? vel[0] : 0, vel ? vel[1] : 0];
    const pv = vel ? 4 : 25;
    this.P = [[acc * acc, 0, 0, 0], [0, acc * acc, 0, 0], [0, 0, pv, 0], [0, 0, 0, pv]];
    this.t = t;
  }

  predict(t, accelNoise = 2.5) {
    const dt = clamp((t - this.t) / 1000, 0, 10);
    this.t = t;
    if (dt <= 0) return;
    const x = this.x;
    x[0] += x[2] * dt; x[1] += x[3] * dt;
    const F = [[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]];
    const FP = mul(F, this.P);
    const P = mul(FP, transpose(F));
    const q = accelNoise * accelNoise;
    const dt2 = dt * dt, dt3 = (dt2 * dt) / 2, dt4 = (dt2 * dt2) / 4;
    for (let i = 0; i < 2; i++) { P[i][i] += q * dt4; P[i][i + 2] += q * dt3; P[i + 2][i] += q * dt3; P[i + 2][i + 2] += q * dt2; }
    this.P = P;
  }

  // Mise à jour scalaire séquentielle (observations indépendantes) : simple et stable.
  updateScalar(k, z, r) {
    const P = this.P, x = this.x;
    const s = P[k][k] + r;
    const y = z - x[k];
    const K = [P[0][k] / s, P[1][k] / s, P[2][k] / s, P[3][k] / s];
    for (let i = 0; i < 4; i++) x[i] += K[i] * y;
    const row = [P[k][0], P[k][1], P[k][2], P[k][3]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) P[i][j] -= K[i] * row[j];
    return y * y / s;
  }

  // Distance de Mahalanobis de la mesure (pour rejeter les sauts)
  gate(c, acc) {
    const [zx, zy] = this.toLocal(c);
    const dx = zx - this.x[0], dy = zy - this.x[1];
    const sx = this.P[0][0] + acc * acc, sy = this.P[1][1] + acc * acc;
    return dx * dx / sx + dy * dy / sy;
  }

  update(c, acc, vel, velAcc) {
    const [zx, zy] = this.toLocal(c);
    const r = acc * acc;
    this.updateScalar(0, zx, r);
    this.updateScalar(1, zy, r);
    if (vel) { const rv = velAcc * velAcc; this.updateScalar(2, vel[0], rv); this.updateScalar(3, vel[1], rv); }
  }

  get coord() { return this.toGeo(this.x[0], this.x[1]); }
  get speed() { return Math.hypot(this.x[2], this.x[3]); }
  get heading() { return (Math.atan2(this.x[2], this.x[3]) * 180 / Math.PI + 360) % 360; }
  get posAcc() { return Math.sqrt((this.P[0][0] + this.P[1][1]) / 2); }
}

// Boussole de l'appareil (utile à l'arrêt, quand le cap GPS n'a pas de sens)
export class Compass {
  constructor() { this.heading = null; this.t = 0; this.enabled = false; this.onEvt = this.onEvt.bind(this); }
  async enable() {
    if (this.enabled) return true;
    try {
      const D = window.DeviceOrientationEvent;
      if (D && typeof D.requestPermission === 'function') {
        const r = await D.requestPermission();
        if (r !== 'granted') return false;
      }
      window.addEventListener('deviceorientationabsolute', this.onEvt, true);
      window.addEventListener('deviceorientation', this.onEvt, true);
      this.enabled = true;
      return true;
    } catch { return false; }
  }
  onEvt(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
    else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
    if (h == null) return;
    // correction de l'orientation de l'écran (paysage)
    const so = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    h = (h + so + 360) % 360;
    this.heading = this.heading == null ? h : (this.heading + angleDiff(this.heading, h) * 0.25 + 360) % 360;
    this.t = Date.now();
  }
  get fresh() { return this.heading != null && Date.now() - this.t < 2000; }
}

// GPS filtré. Émet des fixes lissés : { coord, speed, heading, accuracy, rawAccuracy, t, real, quality }
export class GPS {
  constructor(onFix, onError) {
    this.onFix = onFix; this.onError = onError || (() => {});
    this.watch = null; this.kf = new Kalman2D(); this.last = null; this.lastRaw = null;
    this.rejects = 0; this.compass = new Compass(); this.courseHeading = null;
    this.snapper = null; // fonction (coord, heading, speed, acc) -> {coord, heading} | null
  }
  start() {
    if (!('geolocation' in navigator)) { this.onError(new Error('Géolocalisation indisponible')); return; }
    if (this.watch != null) return;
    this.watch = navigator.geolocation.watchPosition((p) => this.ingest(p), (e) => this.onError(e), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }
  stop() { if (this.watch != null) navigator.geolocation.clearWatch(this.watch); this.watch = null; }

  ingest(p) {
    const c = [p.coords.longitude, p.coords.latitude];
    const acc = Math.max(3, p.coords.accuracy || 30);
    const t = p.timestamp || Date.now();
    let spd = p.coords.speed, hdg = p.coords.heading;
    if (spd == null || isNaN(spd) || spd < 0) spd = null;
    if (hdg == null || isNaN(hdg) || hdg < 0) hdg = null;
    if (this.lastRaw && t <= this.lastRaw.t) return; // doublon
    // Point très imprécis alors qu'on avait une bonne position récente : ignoré (Wi-Fi, antenne)
    if (this.last && acc > 120 && this.last.rawAccuracy < 40 && t - this.last.t < 15000) return;

    const kf = this.kf;
    let vel = null;
    if (spd != null && hdg != null && spd > 1) {
      const r = (hdg * Math.PI) / 180;
      vel = [Math.sin(r) * spd, Math.cos(r) * spd];
    }
    if (!kf.x || (this.last && t - this.last.t > 30000)) {
      kf.init(c, acc, t, vel);
    } else {
      kf.predict(t, spd != null && spd > 15 ? 3.5 : 2.5);
      const g = kf.gate(c, acc);
      // Saut impossible (> 4 sigma) : rejeté, sauf si ça se répète (on s'est vraiment déplacé)
      if (g > 16 && this.rejects < 3) { this.rejects++; this.emitPredicted(t); return; }
      if (g > 16) kf.init(c, acc, t, vel);
      else kf.update(c, acc, vel, spd != null && spd > 1 ? 0.6 + spd * 0.04 : 2);
      this.rejects = 0;
    }
    this.lastRaw = { coord: c, t, acc };

    // Vitesse : celle du GPS (Doppler, très fiable), sinon celle du filtre
    const speed = spd != null ? spd : kf.speed;
    // Cap : cap GPS en roulant ; filtre si pas de cap ; boussole à l'arrêt
    let heading = null;
    if (hdg != null && speed > 1.4) heading = hdg;
    else if (speed > 2) heading = kf.heading;
    else if (this.compass.fresh) heading = this.compass.heading;
    else heading = this.last ? this.last.heading : null;
    if (heading != null && speed > 1.4) this.courseHeading = heading;

    let coord = kf.coord;
    let snapped = false;
    if (this.snapper && speed > 2.5 && kf.posAcc < 25) {
      const s = this.snapper(coord, heading, speed, kf.posAcc);
      if (s) { coord = s.coord; if (s.heading != null && speed > 3) heading = s.heading; snapped = true; }
    }
    const fix = { coord, speed: Math.max(0, speed), heading, accuracy: kf.posAcc, rawAccuracy: acc, t, real: true, snapped, quality: quality(acc) };
    this.last = fix;
    this.onFix(fix);
  }

  // Mesure rejetée : on avance la position prédite pour ne pas figer la voiture
  emitPredicted(t) {
    if (!this.last) return;
    const fix = { ...this.last, coord: this.kf.coord, t, accuracy: this.kf.posAcc };
    this.last = fix;
    this.onFix(fix);
  }
}

export function quality(acc) { return acc <= 12 ? 'excellent' : acc <= 30 ? 'bon' : acc <= 60 ? 'moyen' : 'faible'; }

// Accrochage aux routes réellement affichées sur la carte (hors navigation) : la voiture reste sur la chaussée.
const ROADS = /motorway|trunk|primary|secondary|tertiary|minor|street|service|residential|unclassified|living_street|link|road/;
export function makeRoadSnapper(map) {
  return (coord, heading, speed, acc) => {
    if (!map || !map.isStyleLoaded()) return null;
    const pt = map.project(coord);
    const r = 40;
    let feats;
    try { feats = map.queryRenderedFeatures([[pt.x - r, pt.y - r], [pt.x + r, pt.y + r]]); } catch { return null; }
    const maxD = clamp(acc * 1.2, 8, 22);
    let best = null;
    for (const f of feats) {
      if (f.sourceLayer !== 'transportation' || f.layer.type !== 'line') continue;
      const cls = (f.properties && (f.properties.class || '')) + '';
      if (!ROADS.test(cls) || /path|track|rail|ferry|cycle|foot|pedestrian|steps|bridleway/.test(cls)) continue;
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
      for (const line of lines) for (let i = 0; i < line.length - 1; i++) {
        const pr = projectOnSegment(coord, line[i], line[i + 1]);
        if (pr.d > maxD) continue;
        const segH = bearing(line[i], line[i + 1]);
        let dh = 0, h = segH;
        if (heading != null) {
          const d1 = Math.abs(angleDiff(segH, heading)), d2 = Math.abs(angleDiff((segH + 180) % 360, heading));
          dh = Math.min(d1, d2); h = d1 <= d2 ? segH : (segH + 180) % 360;
          if (dh > 35) continue;
        }
        const score = pr.d + dh * 0.25;
        if (!best || score < best.score) best = { score, coord: pr.p, heading: h, d: pr.d };
      }
    }
    return best;
  };
}

export { dist };
