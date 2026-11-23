// Position : GPS réel (watchPosition) ou conduite simulée le long du trajet.
import { pointAlong, headingAhead, bearing, dist, clamp, angleDiff } from './geo.js';

export class GPS {
  constructor(onFix, onError) {
    this.onFix = onFix; this.onError = onError || (() => {});
    this.watch = null; this.last = null;
  }
  start() {
    if (!('geolocation' in navigator)) { this.onError(new Error('Géolocalisation indisponible')); return; }
    if (this.watch != null) return;
    this.watch = navigator.geolocation.watchPosition((p) => {
      const c = [p.coords.longitude, p.coords.latitude];
      let heading = p.coords.heading;
      let speed = p.coords.speed;
      const t = p.timestamp || Date.now();
      if (this.last) {
        const d = dist(this.last.coord, c);
        const dt = (t - this.last.t) / 1000;
        if ((speed == null || isNaN(speed)) && dt > 0) speed = d / dt;
        if ((heading == null || isNaN(heading)) && d > 3) heading = bearing(this.last.coord, c);
      }
      if (heading != null && isNaN(heading)) heading = null;
      const fix = { coord: c, speed: Math.max(0, speed || 0), heading: heading ?? this.last?.heading ?? null, accuracy: p.coords.accuracy, t, real: true };
      this.last = fix;
      this.onFix(fix);
    }, (e) => this.onError(e), { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  }
  stop() { if (this.watch != null) navigator.geolocation.clearWatch(this.watch); this.watch = null; }
}

// Simulateur : avance sur le tracé à une vitesse réaliste (limitations, ralentit dans les virages).
export class Simulator {
  constructor(route, onFix, { multiplier = 1, getLimit } = {}) {
    this.route = route; this.onFix = onFix; this.multiplier = multiplier; this.getLimit = getLimit || (() => 0);
    this.along = 0; this.speed = 0; this.timer = null; this.lastT = 0;
  }
  setRoute(route, along = 0) { this.route = route; this.along = along; }
  start() {
    if (this.timer) return;
    this.lastT = performance.now();
    this.timer = setInterval(() => this.tick(), 250);
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  tick() {
    const now = performance.now();
    const dt = Math.min(0.5, (now - this.lastT) / 1000) * this.multiplier;
    this.lastT = now;
    const r = this.route;
    if (!r) return;
    const idx = pointAlong(r.coords, r.cum, this.along).idx;
    let target = (this.getLimit(idx) || 50) / 3.6 * 0.95;
    // ralentir avant un virage
    const h1 = headingAhead(r.coords, r.cum, this.along, 5);
    for (const ahead of [25, 50, 90]) {
      const h2 = headingAhead(r.coords, r.cum, this.along + ahead, 5);
      const turn = Math.abs(angleDiff(h1, h2));
      if (turn > 50) target = Math.min(target, clamp(4 + ahead * 0.18, 5, 14));
      else if (turn > 25) target = Math.min(target, clamp(8 + ahead * 0.2, 9, 20));
    }
    const remaining = r.length - this.along;
    if (remaining < 60) target = Math.min(target, Math.max(2, remaining / 6));
    const acc = target > this.speed ? 2.2 : -3.5;
    this.speed = clamp(this.speed + acc * dt, Math.min(this.speed, target), Math.max(this.speed, target));
    this.speed = Math.max(0, this.speed);
    this.along = Math.min(r.length, this.along + this.speed * dt);
    const p = pointAlong(r.coords, r.cum, this.along).p;
    const heading = headingAhead(r.coords, r.cum, this.along, 8);
    this.onFix({ coord: p, speed: this.speed, heading, accuracy: 5, t: Date.now(), real: false });
    if (remaining <= 1) this.stop();
  }
}
