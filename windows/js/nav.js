// Moteur de navigation : accrochage au trajet, progression, manœuvres, annonces, sortie de route, arrivée.
import { snapToLine, pointAlong, headingAhead, spokenDistance, dist, angleDiff, clamp } from './geo.js';

export class NavEngine {
  constructor(route, { onVoice, onReroute, onArrive } = {}) {
    this.onVoice = onVoice || (() => {});
    this.onReroute = onReroute || (() => {});
    this.onArrive = onArrive || (() => {});
    this.setRoute(route);
  }

  setRoute(route) {
    this.route = route;
    this.along = 0;
    this.segIdx = 0;
    this.offCount = 0;
    this.offSince = 0;
    this.arrived = false;
    this.announced = new Map(); // index manœuvre -> stades annoncés
    this.state = null;
    this.rerouting = false;
    this.lastRerouteAt = 0;
    this.firstFix = true;
  }

  nextManeuverIndex(along) {
    const ms = this.route.maneuvers;
    for (let i = 0; i < ms.length; i++) if (ms[i].along > along + 3) return i;
    return ms.length - 1;
  }

  remainingTime(along, mi) {
    const ms = this.route.maneuvers;
    let t = 0;
    for (let i = mi; i < ms.length; i++) t += ms[i].time || 0;
    // part restante de la manœuvre en cours
    const cur = ms[mi - 1];
    if (cur && cur.length > 0) {
      const frac = clamp((ms[mi].along - along) / cur.length, 0, 1);
      t += (cur.time || 0) * frac;
    }
    return t;
  }

  limitAt(idx) {
    const l = this.route.limits;
    if (!l) return 0;
    return l[Math.min(idx, l.length - 1)] || 0;
  }

  update(fix) {
    const r = this.route;
    const window = Math.max(400, (fix.speed || 0) * 40);
    const back = Math.max(0, this.segIdx - 4);
    let s = snapToLine(fix.coord, r.coords, r.cum, back, window + 200);
    if (this.firstFix && s.d > 60) {
      const g = snapToLine(fix.coord, r.coords, r.cum, 0, Infinity);
      if (g.d < s.d) s = g;
    }
    const tol = Math.max(35, Math.min(80, (fix.accuracy || 15) * 1.6));
    const now = fix.t || Date.now();

    // Cap de la route vs cap réel : si on roule à contresens du tracé, c'est une sortie de route.
    let wrongWay = false;
    if (fix.heading != null && fix.speed > 4) {
      const rh = headingAhead(r.coords, r.cum, s.along, 15);
      wrongWay = Math.abs(angleDiff(rh, fix.heading)) > 120;
    }

    if ((s.d > tol || wrongWay) && !this.firstFix) {
      this.offCount++;
      if (!this.offSince) this.offSince = now;
    } else {
      this.offCount = 0; this.offSince = 0;
    }
    this.firstFix = false;

    if (this.offCount >= 3 && now - this.offSince > 2500 && now - this.lastRerouteAt > 8000 && !this.arrived) {
      this.lastRerouteAt = now;
      this.offCount = 0; this.offSince = 0;
      this.onReroute(fix);
    }

    const onRoute = s.d <= tol && !wrongWay;
    if (onRoute) {
      // Pas de retour en arrière brusque (bruit GPS)
      if (s.along > this.along - 15) { this.along = Math.max(this.along, s.along); this.segIdx = s.idx; }
    }

    const along = this.along;
    const mi = this.nextManeuverIndex(along);
    const m = r.maneuvers[mi];
    const toNext = Math.max(0, m.along - along);
    const remaining = Math.max(0, r.length - along);
    const remTime = this.remainingTime(along, mi);
    const after = r.maneuvers[mi + 1];
    const snapped = onRoute ? pointAlong(r.coords, r.cum, along).p : fix.coord;
    const roadHeading = headingAhead(r.coords, r.cum, along, 14);

    this.state = {
      along, mi, maneuver: m, toNext, remaining, remTime,
      after: after && after.along - m.along < 120 ? after : null,
      snapped, roadHeading, onRoute, offDistance: s.d,
      limit: this.limitAt(this.segIdx),
      progress: r.length ? along / r.length : 0,
    };

    this.voice(fix.speed || 0);

    if (!this.arrived && (remaining < 25 || (remaining < 60 && dist(fix.coord, r.coords[r.coords.length - 1]) < 35))) {
      this.arrived = true;
      this.onArrive();
    }
    return this.state;
  }

  voice(speed) {
    const st = this.state;
    if (!st || this.arrived) return;
    const { mi, maneuver: m, toNext } = st;
    if (m.kind === 'depart' || m.kind === 'straight') return;
    const done = this.announced.get(mi) || new Set();
    const v = Math.max(speed, 8);
    const nowDist = Math.max(30, v * 4.5);
    const midDist = clamp(v * 18, 180, 900);
    const farDist = v > 22 ? 2000 : v > 14 ? 1000 : 0;
    const instr = lowerFirst(shortText(m));
    const then = st.after && st.after.kind !== 'arrive' && st.after.kind !== 'straight' ? `, puis ${lowerFirst(stripDot(shortText(st.after)))}` : '';

    if (m.kind === 'arrive') {
      if (!done.has('mid') && toNext <= midDist && toNext > nowDist) {
        done.add('mid'); this.onVoice(`Dans ${spokenDistance(toNext)}, vous serez arrivé à destination`);
      }
    } else if (!done.has('now') && toNext <= nowDist) {
      done.add('now'); done.add('mid'); done.add('far');
      this.onVoice(capFirst(shortText(m)) + then);
    } else if (!done.has('mid') && toNext <= midDist && toNext > nowDist * 1.6) {
      done.add('mid'); done.add('far');
      this.onVoice(`Dans ${spokenDistance(toNext)}, ${instr}`);
    } else if (farDist && !done.has('far') && toNext <= farDist && toNext > midDist * 1.5) {
      done.add('far');
      this.onVoice(`Dans ${spokenDistance(toNext)}, ${instr}`);
    }
    this.announced.set(mi, done);
  }

  firstInstruction() {
    const ms = this.route.maneuvers;
    const m0 = ms[0];
    return stripDot(m0 ? m0.verbal || m0.text : 'Partez');
  }
}

function stripDot(s) { return (s || '').trim().replace(/\.$/, ''); }
function lowerFirst(s) { return s ? s[0].toLowerCase() + s.slice(1) : s; }
function capFirst(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function shortText(m) {
  const t = stripDot(m.verbal || m.text);
  // garde la première phrase
  return t.split(/\.\s/)[0];
}

// Libellés courts pour la carte de manœuvre
export const KIND_LABEL = {
  'depart': 'Partez', 'arrive': 'Arrivée', 'straight': 'Continuez tout droit', 'slight-right': 'Serrez à droite', 'right': 'Tournez à droite',
  'sharp-right': 'Virage serré à droite', 'uturn': 'Faites demi-tour', 'sharp-left': 'Virage serré à gauche', 'left': 'Tournez à gauche',
  'slight-left': 'Serrez à gauche', 'exit-right': 'Sortie à droite', 'exit-left': 'Sortie à gauche', 'merge': 'Insérez-vous',
  'roundabout': 'Rond-point', 'ferry': 'Ferry',
};

export function maneuverTitle(m) {
  if (!m) return '';
  if (m.kind === 'roundabout' && m.exit) return `${m.exit}${m.exit === 1 ? 're' : 'e'} sortie au rond-point`;
  return KIND_LABEL[m.kind] || 'Continuez';
}

export function maneuverStreet(m) {
  if (!m) return '';
  if (m.kind === 'arrive') return 'Destination';
  return m.street || '';
}
