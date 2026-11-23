// Outils géographiques : distances, caps, polylignes, projection sur un trajet.
export const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function dist(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function angleDiff(a, b) {
  let d = ((b - a + 540) % 360) - 180;
  return d;
}

export function lerpAngle(a, b, t) {
  return (a + angleDiff(a, b) * t + 360) % 360;
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Décodage polyligne Google/Valhalla (precision 5 ou 6) -> [[lon, lat], ...]
export function decodePolyline(str, precision = 6) {
  let index = 0, lat = 0, lon = 0;
  const coords = [];
  const factor = Math.pow(10, precision);
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lon / factor, lat / factor]);
  }
  return coords;
}

export function encodePolyline(coords, precision = 5) {
  const factor = Math.pow(10, precision);
  let out = '', pLat = 0, pLon = 0;
  const enc = (v) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of coords) {
    const iLat = Math.round(lat * factor), iLon = Math.round(lon * factor);
    out += enc(iLat - pLat) + enc(iLon - pLon);
    pLat = iLat; pLon = iLon;
  }
  return out;
}

// Simplification Douglas-Peucker (en degrés approximés en mètres).
export function simplify(coords, tolMeters = 8) {
  if (coords.length < 3) return coords.slice();
  const lat0 = rad(coords[0][1]);
  const kx = 111320 * Math.cos(lat0), ky = 110540;
  const P = coords.map(([x, y]) => [x * kx, y * ky]);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = P[s], [bx, by] = P[e];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
    for (let i = s + 1; i < e; i++) {
      const t = clamp(((P[i][0] - ax) * dx + (P[i][1] - ay) * dy) / L, 0, 1);
      const d = Math.hypot(P[i][0] - (ax + t * dx), P[i][1] - (ay + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolMeters && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return coords.filter((_, i) => keep[i]);
}

export function cumulative(coords) {
  const c = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i++) c[i] = c[i - 1] + dist(coords[i - 1], coords[i]);
  return c;
}

// Projection d'un point sur un segment (plan local), retourne {t, d, p}
export function projectOnSegment(p, a, b) {
  const lat0 = rad(p[1]);
  const kx = 111320 * Math.cos(lat0), ky = 110540;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? -(ax * dx + ay * dy) / L : 0;
  t = clamp(t, 0, 1);
  const px = ax + t * dx, py = ay + t * dy;
  return { t, d: Math.hypot(px, py), p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
}

// Recherche du point le plus proche sur la polyligne, dans une fenêtre autour d'un index.
export function snapToLine(p, coords, cum, fromIdx = 0, window = Infinity) {
  let best = { d: Infinity, idx: 0, t: 0, p: coords[0], along: 0 };
  const start = Math.max(0, fromIdx);
  for (let i = start; i < coords.length - 1; i++) {
    if (cum[i] - cum[start] > window) break;
    const r = projectOnSegment(p, coords[i], coords[i + 1]);
    if (r.d < best.d) {
      best = { d: r.d, idx: i, t: r.t, p: r.p, along: cum[i] + (cum[i + 1] - cum[i]) * r.t };
    }
  }
  return best;
}

// Point situé à une distance donnée le long de la ligne.
export function pointAlong(coords, cum, along) {
  if (along <= 0) return { p: coords[0], idx: 0, h: bearing(coords[0], coords[1] || coords[0]) };
  const total = cum[cum.length - 1];
  if (along >= total) {
    const n = coords.length;
    return { p: coords[n - 1], idx: n - 2, h: bearing(coords[n - 2] || coords[n - 1], coords[n - 1]) };
  }
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= along) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1e-9;
  const t = (along - cum[lo]) / seg;
  const a = coords[lo], b = coords[hi];
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], idx: lo, h: bearing(a, b) };
}

// Cap lissé : direction vers un point situé quelques mètres plus loin.
export function headingAhead(coords, cum, along, ahead = 12) {
  const a = pointAlong(coords, cum, along).p;
  const b = pointAlong(coords, cum, along + ahead).p;
  if (dist(a, b) < 0.5) return pointAlong(coords, cum, along).h;
  return bearing(a, b);
}

export function bbox(coords) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of coords) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [[w, s], [e, n]];
}

// Formats français
export function fmtDistance(m) {
  if (m == null || !isFinite(m)) return '–';
  if (m < 950) {
    const r = m < 100 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 50) * 50;
    return `${r} m`;
  }
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

export function fmtDistanceParts(m) {
  const s = fmtDistance(m);
  const [v, u] = s.split(' ');
  return { value: v, unit: u };
}

export function fmtDuration(sec) {
  if (sec == null || !isFinite(sec)) return '–';
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function fmtClock(date) {
  return date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}

// Distance prononcée pour la voix
export function spokenDistance(m) {
  if (m >= 950) {
    const km = Math.round(m / 100) / 10;
    if (Math.abs(km - Math.round(km)) < 0.05) return `${Math.round(km)} kilomètre${Math.round(km) > 1 ? 's' : ''}`;
    return `${String(km).replace('.', ',')} kilomètres`;
  }
  const r = m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50;
  return `${r} mètres`;
}

export function metersPerPixel(lat, zoom) {
  return (40075016.686 * Math.cos(rad(lat))) / (512 * Math.pow(2, zoom));
}

export function uid(n = 16) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(a, (x) => abc[x % abc.length]).join('');
}
