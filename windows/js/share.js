// Partage du trajet en direct (côté conducteur) + signalements communautaires.
import { live, ROOT } from './live.js';
import { uid, simplify, encodePolyline, dist } from './geo.js';
import { REPORT_TYPES } from './icons.js';

export function appBase() {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.pathname = u.pathname.replace(/[^/]*$/, '');
  return u.toString();
}

export class TripShare {
  constructor() {
    this.id = null;
    this.viewers = new Map();
    this.reactions = [];
    this.listeners = new Set();
    this.lastPub = 0;
    this.unsubs = [];
    this.demo = false;
  }
  on(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit(ev) { this.listeners.forEach((f) => f(ev, this)); }
  get active() { return !!this.id; }
  get link() { return this.id ? `${appBase()}suivre.html?t=${this.id}` : ''; }
  activeViewers() {
    const now = Date.now();
    return [...this.viewers.values()].filter((v) => now - v.t < 75000);
  }

  async start({ name, dest, car, route }) {
    if (this.id) return this.link;
    this.id = uid(14);
    this.base = `${ROOT}/trip/${this.id}`;
    this.info = { name: name || 'Un proche', dest: dest ? { title: dest.title, coord: dest.coord } : null, car, startedAt: Date.now(), status: 'en route' };
    this.setRoute(route);
    this.unsubs.push(await live.subscribe(`${this.base}/viewer/+`, (t, d) => {
      if (!d) return;
      const isNew = !this.viewers.has(d.id);
      this.viewers.set(d.id, { id: d.id, name: d.name || 'Proche', t: Date.now() });
      this.emit({ type: 'viewers', isNew, viewer: d });
    }));
    this.unsubs.push(await live.subscribe(`${this.base}/react`, (t, d) => {
      if (!d || !d.text) return;
      this.reactions.unshift({ ...d, t: Date.now() });
      this.reactions = this.reactions.slice(0, 20);
      this.emit({ type: 'reaction', reaction: d });
    }));
    this.emit({ type: 'started' });
    return this.link;
  }

  setRoute(route) {
    if (!this.id || this.demo) return;
    if (!route) { live.publish(`${this.base}/info`, this.info, { retain: true }).catch(() => {}); return; }
    const simple = simplify(route.coords, 12);
    const step = Math.max(1, Math.ceil(simple.length / 400));
    const pts = simple.filter((_, i) => i % step === 0 || i === simple.length - 1);
    this.info.route = encodePolyline(pts, 5);
    this.info.length = route.length;
    live.publish(`${this.base}/info`, this.info, { retain: true }).catch(() => {});
  }

  update(state) {
    if (!this.id || this.demo) return;
    const now = Date.now();
    if (now - this.lastPub < 2000 && !state.force) return;
    this.lastPub = now;
    const msg = { c: [Number(state.coord[0].toFixed(6)), Number(state.coord[1].toFixed(6))], h: Math.round(state.heading || 0), v: Math.round((state.speed || 0) * 3.6), rem: Math.round(state.remaining || 0), remT: Math.round(state.remTime || 0), eta: state.eta || null, t: now, status: state.status || 'en route' };
    live.publish(`${this.base}/pos`, msg, { retain: true }).catch(() => {});
  }

  async stop(status = 'terminé') {
    if (!this.id) return;
    if (this.demo) { this.id = null; this.demo = false; this.viewers.clear(); this.reactions = []; this.emit({ type: 'stopped' }); return; }
    this.info.status = status;
    try { await live.publish(`${this.base}/info`, this.info, { retain: true }); } catch {}
    try { await live.publish(`${this.base}/pos`, { status, t: Date.now() }, { retain: true }); } catch {}
    this.unsubs.forEach((u) => u()); this.unsubs = [];
    this.id = null; this.viewers.clear(); this.reactions = [];
    this.emit({ type: 'stopped' });
  }

  startDemo() {
    this.id = 'demo';
    this.demo = true;
    const now = Date.now();
    this.viewers.set('m', { id: 'm', name: 'Maman', t: now + 1e9 });
    this.viewers.set('s', { id: 's', name: 'Sarah', t: now + 1e9 });
    this.emit({ type: 'started' });
  }
}

// ---------- Signalements communautaires ----------
export function tileOf(c) { return `${Math.floor(c[1] * 20)}_${Math.floor(c[0] * 20)}`; }

export class Reports {
  constructor() {
    this.items = new Map();
    this.subs = new Map();
    this.listeners = new Set();
    this.alerted = new Set();
  }
  on(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit() { this.listeners.forEach((f) => f(this.list())); }
  list() {
    const now = Date.now();
    return [...this.items.values()].filter((r) => now - r.t < (REPORT_TYPES[r.type]?.ttl || 60) * 60000);
  }

  // S'abonne aux zones (≈5 km) autour de la position
  async watch(c) {
    const [ty, tx] = tileOf(c).split('_').map(Number);
    const wanted = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) wanted.add(`${ty + dy}_${tx + dx}`);
    for (const [k, un] of this.subs) if (!wanted.has(k)) { un(); this.subs.delete(k); }
    for (const k of wanted) {
      if (this.subs.has(k)) continue;
      this.subs.set(k, () => {});
      const un = await live.subscribe(`${ROOT}/reports/${k}/+`, (topic, d) => {
        const id = topic.split('/').pop();
        if (!d) { this.items.delete(id); this.emit(); return; }
        const ttl = (REPORT_TYPES[d.type]?.ttl || 60) * 60000;
        if (Date.now() - d.t > ttl) { this.items.delete(id); live.publish(topic, null, { retain: true }).catch(() => {}); this.emit(); return; }
        this.items.set(id, { ...d, id, topic });
        this.emit();
      });
      this.subs.set(k, un);
    }
  }

  async add(type, c, heading, by) {
    const id = uid(10);
    const d = { type, c: [Number(c[0].toFixed(6)), Number(c[1].toFixed(6))], h: Math.round(heading || 0), t: Date.now(), by: by || '' };
    const topic = `${ROOT}/reports/${tileOf(c)}/${id}`;
    this.items.set(id, { ...d, id, topic, mine: true });
    this.emit();
    await live.publish(topic, d, { retain: true });
    return id;
  }

  async remove(id) {
    const r = this.items.get(id);
    if (!r) return;
    this.items.delete(id); this.emit();
    await live.publish(r.topic, null, { retain: true }).catch(() => {});
  }

  // Signalements devant soi sur le trajet
  ahead(route, along, maxAhead = 1500) {
    if (!route) return [];
    const out = [];
    for (const r of this.list()) {
      // recherche grossière du point du trajet le plus proche
      let best = Infinity, bestAlong = 0;
      for (let i = 0; i < route.coords.length; i += 2) {
        const d = dist(r.c, route.coords[i]);
        if (d < best) { best = d; bestAlong = route.cum[i]; }
      }
      const ahead = bestAlong - along;
      if (best < 45 && ahead > 0 && ahead < maxAhead) out.push({ ...r, ahead });
    }
    return out.sort((a, b) => a.ahead - b.ahead);
  }
}
