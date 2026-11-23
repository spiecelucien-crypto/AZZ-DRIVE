// Services en ligne gratuits, sans clé : Photon (adresses), Valhalla FOSSGIS (itinéraires FR + limitations), OSRM (secours).
import { decodePolyline, cumulative, dist, bearing } from './geo.js';

const PHOTON = 'https://photon.komoot.io';
const VALHALLA = ['https://valhalla1.openstreetmap.de', 'https://valhalla2.openstreetmap.de'];
const OSRM = 'https://router.project-osrm.org';

async function fetchJSON(url, opts = {}, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: opts.signal || ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ---------- Recherche d'adresses ----------
function placeLabel(p) {
  const pr = p.properties || {};
  const street = [pr.street, pr.housenumber].filter(Boolean).join(' ');
  const title = pr.name || street || pr.city || 'Lieu';
  const parts = [];
  if (pr.name && street) parts.push(street);
  const city = [pr.postcode, pr.city || pr.town || pr.village || pr.district].filter(Boolean).join(' ');
  if (city && city !== title) parts.push(city);
  if (pr.country && pr.country !== 'Belgique' && pr.country !== 'België') parts.push(pr.country);
  return { title, subtitle: parts.join(', '), kind: pr.osm_value || pr.type || '' };
}

export async function geocode(q, near, signal) {
  const u = new URL(PHOTON + '/api/');
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '7');
  u.searchParams.set('lang', 'fr');
  if (near) { u.searchParams.set('lat', near[1].toFixed(5)); u.searchParams.set('lon', near[0].toFixed(5)); }
  const d = await fetchJSON(u, { signal });
  return (d.features || []).map((f) => ({ ...placeLabel(f), coord: f.geometry.coordinates, id: `${f.properties.osm_type}${f.properties.osm_id}` }));
}

export async function reverse(coord) {
  try {
    const d = await fetchJSON(`${PHOTON}/reverse?lat=${coord[1]}&lon=${coord[0]}&lang=fr&limit=1`, {}, 8000);
    const f = d.features && d.features[0];
    if (!f) return null;
    return { ...placeLabel(f), coord };
  } catch { return null; }
}

// ---------- Itinéraires ----------
const VTYPE = {
  1: 'depart', 2: 'depart', 3: 'depart', 4: 'arrive', 5: 'arrive', 6: 'arrive',
  7: 'straight', 8: 'straight', 9: 'slight-right', 10: 'right', 11: 'sharp-right', 12: 'uturn', 13: 'uturn',
  14: 'sharp-left', 15: 'left', 16: 'slight-left', 17: 'straight', 18: 'slight-right', 19: 'slight-left',
  20: 'exit-right', 21: 'exit-left', 22: 'straight', 23: 'slight-right', 24: 'slight-left', 25: 'merge',
  26: 'roundabout', 27: 'roundabout', 28: 'ferry', 29: 'ferry', 37: 'merge', 38: 'merge',
};

function normalizeValhalla(trip, idx) {
  const leg = trip.legs[0];
  const coords = decodePolyline(leg.shape, 6);
  const cum = cumulative(coords);
  const maneuvers = leg.maneuvers.map((m) => ({
    kind: VTYPE[m.type] || 'straight',
    type: m.type,
    text: (m.instruction || '').replace(/\.$/, ''),
    verbal: m.verbal_pre_transition_instruction || m.instruction || '',
    verbalShort: m.verbal_transition_alert_instruction || '',
    street: (m.street_names && m.street_names[0]) || (m.begin_street_names && m.begin_street_names[0]) || '',
    exit: m.roundabout_exit_count || 0,
    along: cum[Math.min(m.begin_shape_index, cum.length - 1)],
    idx: m.begin_shape_index,
    time: m.time,
    length: m.length * 1000,
    toll: !!m.toll, highway: !!m.highway,
  }));
  return {
    id: 'r' + idx,
    provider: 'valhalla',
    coords, cum,
    length: cum[cum.length - 1],
    duration: trip.summary.time,
    hasToll: !!trip.summary.has_toll,
    hasHighway: !!trip.summary.has_highway,
    hasFerry: !!trip.summary.has_ferry,
    maneuvers,
    shape: leg.shape,
    limits: null,
  };
}

const OSRM_MOD = {
  'uturn': 'uturn', 'sharp right': 'sharp-right', 'right': 'right', 'slight right': 'slight-right', 'straight': 'straight',
  'slight left': 'slight-left', 'left': 'left', 'sharp left': 'sharp-left',
};
const FR_MOD = {
  'uturn': 'Faites demi-tour', 'sharp-right': 'Tournez franchement à droite', 'right': 'Tournez à droite', 'slight-right': 'Serrez à droite',
  'straight': 'Continuez tout droit', 'slight-left': 'Serrez à gauche', 'left': 'Tournez à gauche', 'sharp-left': 'Tournez franchement à gauche',
};

function normalizeOSRM(route, idx) {
  const coords = route.geometry.coordinates;
  const cum = cumulative(coords);
  const steps = route.legs[0].steps;
  let acc = 0;
  const maneuvers = steps.map((s, i) => {
    const mod = OSRM_MOD[s.maneuver.modifier] || 'straight';
    let kind = mod, text;
    const street = s.name || s.ref || '';
    if (s.maneuver.type === 'depart') { kind = 'depart'; text = street ? `Partez sur ${street}` : 'Partez'; }
    else if (s.maneuver.type === 'arrive') { kind = 'arrive'; text = 'Vous êtes arrivé à destination'; }
    else if (s.maneuver.type === 'roundabout' || s.maneuver.type === 'rotary') { kind = 'roundabout'; text = `Au rond-point, prenez la ${s.maneuver.exit || 1}e sortie${street ? ' vers ' + street : ''}`; }
    else if (s.maneuver.type === 'off ramp') { kind = mod.includes('left') ? 'exit-left' : 'exit-right'; text = `Prenez la sortie${street ? ' vers ' + street : ''}`; }
    else { text = FR_MOD[mod] + (street ? ` sur ${street}` : ''); }
    const along = acc;
    acc += s.distance;
    return { kind, type: s.maneuver.type, text, verbal: text, verbalShort: '', street, exit: s.maneuver.exit || 0, along, idx: 0, time: s.duration, length: s.distance };
  });
  return { id: 'o' + idx, provider: 'osrm', coords, cum, length: cum[cum.length - 1], duration: route.duration, hasToll: false, hasHighway: false, maneuvers, shape: null, limits: null };
}

export async function route(from, to, opts = {}) {
  const body = {
    locations: [
      { lat: from[1], lon: from[0], ...(opts.heading != null ? { heading: Math.round(opts.heading), heading_tolerance: 60 } : {}) },
      { lat: to[1], lon: to[0] },
    ],
    costing: 'auto',
    costing_options: { auto: { use_tolls: opts.avoidTolls ? 0 : 0.5, use_highways: opts.avoidHighways ? 0 : 1, use_ferry: 0.3 } },
    alternates: opts.alternates ?? 2,
    language: 'fr-FR',
    units: 'kilometers',
    directions_options: { language: 'fr-FR', units: 'kilometers' },
  };
  for (const host of VALHALLA) {
    try {
      const d = await fetchJSON(host + '/route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 15000);
      const trips = [d.trip, ...((d.alternates || []).map((a) => a.trip))].filter(Boolean);
      const routes = trips.map(normalizeValhalla);
      routes.forEach((r) => { r.host = host; });
      return routes;
    } catch (e) { console.warn('Valhalla', host, e.message); }
  }
  // Secours OSRM
  const u = `${OSRM}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=true&alternatives=${opts.alternates === 0 ? 'false' : 'true'}`;
  const d = await fetchJSON(u, {}, 15000);
  if (d.code !== 'Ok') throw new Error(d.message || 'Itinéraire introuvable');
  return d.routes.map(normalizeOSRM);
}

// Limitations de vitesse le long du trajet (OpenStreetMap via Valhalla) : tableau par segment.
export async function speedLimits(r) {
  if (!r.shape) return null;
  const body = {
    encoded_polyline: r.shape,
    shape_match: 'edge_walk',
    costing: 'auto',
    filters: { attributes: ['edge.speed_limit', 'edge.begin_shape_index', 'edge.end_shape_index', 'edge.road_class'], action: 'include' },
  };
  try {
    const d = await fetchJSON((r.host || VALHALLA[0]) + '/trace_attributes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 15000);
    const arr = new Int16Array(Math.max(1, r.coords.length - 1));
    for (const e of d.edges || []) {
      const lim = typeof e.speed_limit === 'number' && e.speed_limit > 0 && e.speed_limit < 200 ? e.speed_limit : 0;
      for (let i = e.begin_shape_index; i < e.end_shape_index && i < arr.length; i++) arr[i] = lim;
    }
    return arr;
  } catch (e) { console.warn('limites', e.message); return null; }
}

export function routeSummaryLabel(r) {
  const tags = [];
  if (r.hasHighway) tags.push('Autoroute');
  if (r.hasToll) tags.push('Péage');
  if (r.hasFerry) tags.push('Ferry');
  return tags;
}

// Nom principal d'un trajet (route la plus longue empruntée)
export function mainRoad(r) {
  const by = new Map();
  for (const m of r.maneuvers) if (m.street) by.set(m.street, (by.get(m.street) || 0) + m.length);
  let best = '', bl = 0;
  for (const [k, v] of by) if (v > bl) { best = k; bl = v; }
  return best;
}

export { dist, bearing };
