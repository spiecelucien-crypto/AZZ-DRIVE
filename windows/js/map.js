// Carte 3D MapLibre : styles Nuit / Jour / Satellite 3D, bâtiments en relief, ciel, tracés et voiture 3D.
import * as maplibregl from '../vendor/maplibre-gl.mjs';
import { CarLayer } from './car3d.js';
import { metersPerPixel, clamp, lerp, lerpAngle, angleDiff, bbox } from './geo.js';

window.maplibregl = maplibregl;
const OFM = 'https://tiles.openfreemap.org/styles/liberty';
const EMPTY = { type: 'FeatureCollection', features: [] };
let baseStylePromise = null;
function baseStyle() {
  if (!baseStylePromise) baseStylePromise = fetch(OFM).then((r) => r.json());
  return baseStylePromise;
}

const ROAD_NIGHT = {
  motorway: '#5b6b8a', trunk: '#506080', primary: '#47566f', secondary: '#3e4b61', tertiary: '#374355', minor: '#2f3a4b', service: '#283242',
};

function roadClassColor(night) {
  const c = night ? ROAD_NIGHT : null;
  if (!c) return null;
  return ['match', ['get', 'class'], 'motorway', c.motorway, 'trunk', c.trunk, 'primary', c.primary, 'secondary', c.secondary, 'tertiary', c.tertiary, ['minor', 'street'], c.minor, c.service];
}

function nightify(style) {
  const s = structuredClone(style);
  for (const l of s.layers) {
    const p = (l.paint = l.paint || {});
    const sl = l['source-layer'] || '';
    const id = l.id;
    if (l.type === 'background') p['background-color'] = '#0c1322';
    else if (l.type === 'fill') {
      if (sl === 'water') p['fill-color'] = '#0a2236';
      else if (sl === 'building') { p['fill-color'] = '#1a2233'; p['fill-outline-color'] = '#232d42'; }
      else if (/park|wood|grass|forest|landcover/.test(id) || sl === 'park' || sl === 'landcover') { p['fill-color'] = '#0f1e1d'; }
      else if (sl === 'transportation') p['fill-color'] = '#2a3445';
      else if (sl === 'aeroway') p['fill-color'] = '#141c2b';
      else p['fill-color'] = '#0f1828';
      delete p['fill-pattern'];
    } else if (l.type === 'line') {
      if (sl === 'transportation') {
        if (/casing/.test(id)) p['line-color'] = '#070b13';
        else if (/rail/.test(id)) p['line-color'] = '#2a3142';
        else if (/path|pedestrian|cycle|steps|track/.test(id)) p['line-color'] = '#243044';
        else p['line-color'] = roadClassColor(true);
      } else if (sl === 'waterway') p['line-color'] = '#0d2a44';
      else if (sl === 'boundary') p['line-color'] = '#3b4660';
      else if (sl === 'aeroway') p['line-color'] = '#1f2838';
      else p['line-color'] = '#253044';
      delete p['line-pattern'];
    } else if (l.type === 'fill-extrusion') {
      p['fill-extrusion-color'] = ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#1b2437', 30, '#26314a', 120, '#344161'];
      p['fill-extrusion-opacity'] = 0.95;
      p['fill-extrusion-vertical-gradient'] = true;
    } else if (l.type === 'symbol') {
      if (l.layout && (l.layout['text-field'] || l.layout['text-font'])) {
        p['text-color'] = /highway|road|transportation/.test(id) ? '#aeb9cc' : sl === 'water_name' ? '#5f86b0' : '#c9d3e0';
        p['text-halo-color'] = '#0b1220';
        p['text-halo-width'] = 1.2;
      }
      if (/poi/.test(id)) p['icon-opacity'] = 0.75;
    } else if (l.type === 'hillshade' || l.type === 'raster') {
      l.layout = { ...(l.layout || {}), visibility: 'none' };
    }
  }
  s.sky = { 'sky-color': '#0a1430', 'horizon-color': '#3b4a86', 'fog-color': '#121b33', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.55, 'atmosphere-blend': 0 };
  s.light = { anchor: 'viewport', color: '#b8c6ff', intensity: 0.35, position: [1.5, 200, 40] };
  return s;
}

function dayify(style) {
  const s = structuredClone(style);
  for (const l of s.layers) {
    if (l.type === 'fill-extrusion') {
      l.paint['fill-extrusion-color'] = ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#e6e1d8', 40, '#d9d3c8', 150, '#cfc8bb'];
      l.paint['fill-extrusion-opacity'] = 0.92;
      l.paint['fill-extrusion-vertical-gradient'] = true;
    }
  }
  s.sky = { 'sky-color': '#5c9ae6', 'horizon-color': '#dbe8f7', 'fog-color': '#eef3f9', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.6, 'atmosphere-blend': 0 };
  s.light = { anchor: 'viewport', color: '#ffffff', intensity: 0.3, position: [1.5, 210, 30] };
  return s;
}

function satellite(style) {
  const s = structuredClone(style);
  s.sources.esri = {
    type: 'raster', tileSize: 256, maxzoom: 19,
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics',
  };
  const keep = [];
  keep.push({ id: 'sat-bg', type: 'background', paint: { 'background-color': '#1d2420' } });
  keep.push({ id: 'sat', type: 'raster', source: 'esri', paint: { 'raster-saturation': -0.05, 'raster-contrast': 0.08, 'raster-brightness-max': 0.92 } });
  for (const l of s.layers) {
    if (l.type === 'fill-extrusion') {
      keep.push({ ...l, paint: { ...l.paint, 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#cfc9bf', 60, '#bdb6aa'], 'fill-extrusion-opacity': 0.82, 'fill-extrusion-vertical-gradient': true } });
    } else if (l.type === 'symbol' && /highway-name|road_shield|place|label_city|label_town|label_village|label_other|poi_transit/.test(l.id)) {
      const p = { ...(l.paint || {}) };
      if (l.layout && l.layout['text-field']) { p['text-color'] = '#ffffff'; p['text-halo-color'] = 'rgba(0,0,0,0.85)'; p['text-halo-width'] = 1.6; }
      keep.push({ ...l, paint: p });
    } else if (l.type === 'line' && l['source-layer'] === 'transportation' && /motorway|trunk|primary/.test(l.id) && !/casing|tunnel|bridge/.test(l.id)) {
      keep.push({ ...l, paint: { ...l.paint, 'line-color': 'rgba(255,214,120,0.35)', 'line-opacity': 0.6 } });
    }
  }
  s.layers = keep;
  s.sky = { 'sky-color': '#4d84c9', 'horizon-color': '#c9d9ea', 'fog-color': '#d6e1ec', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.5, 'atmosphere-blend': 0 };
  s.light = { anchor: 'viewport', color: '#ffffff', intensity: 0.3, position: [1.5, 210, 30] };
  return s;
}

export function resolveStyleMode(mode) {
  if (mode !== 'auto') return mode;
  const h = new Date().getHours();
  return h >= 19 || h < 7 ? 'nuit' : 'jour';
}

export class MapView {
  constructor(container, { mode = 'nuit', center = [4.4025, 51.2194], zoom = 15 } = {}) {
    this.container = container;
    this.mode = mode;
    this.carLayer = new CarLayer();
    this.routeData = { type: 'FeatureCollection', features: [] };
    this.progress = 0;
    this.ready = this.init(center, zoom);
  }

  async styleFor(mode) {
    const base = await baseStyle();
    if (mode === 'satellite') return satellite(base);
    if (mode === 'jour') return dayify(base);
    return nightify(base);
  }

  async init(center, zoom) {
    const style = await this.styleFor(this.mode);
    this.map = new maplibregl.Map({
      container: this.container, style, center, zoom, pitch: 55, bearing: 0, maxPitch: 85,
      attributionControl: { compact: true },
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      canvasContextAttributes: { antialias: true, powerPreference: 'high-performance' },
      fadeDuration: 150,
    });
    this.map.on('style.load', () => this.installLayers());
    this.map.on('styleimagemissing', (e) => { if (!this.map.hasImage(e.id)) this.map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); });
    await new Promise((res) => this.map.once('load', res));
    return this.map;
  }

  installLayers() {
    const m = this.map;
    this.carLayer.night = this.mode === 'nuit';
    if (!m.getSource('routes')) m.addSource('routes', { type: 'geojson', data: this.routeData, lineMetrics: true });
    // Le tracé passe sous les noms de rues et icônes (lisibilité), au-dessus des routes.
    const firstSymbol = m.getStyle().layers.find((l) => l.type === 'symbol');
    const before = firstSymbol ? firstSymbol.id : undefined;
    this.ensureImages();
    if (!m.getSource('maneuver')) m.addSource('maneuver', { type: 'geojson', data: this.maneuverData || EMPTY });
    if (!m.getLayer('route-alt-casing')) {
      m.addLayer({ id: 'route-alt-casing', type: 'line', source: 'routes', filter: ['!=', ['get', 'active'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0a3a46', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 12, 19, 26], 'line-opacity': 0.8 } }, before);
      m.addLayer({ id: 'route-alt', type: 'line', source: 'routes', filter: ['!=', ['get', 'active'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#5aa9b8', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 16, 8, 19, 18], 'line-opacity': 0.75 } }, before);
      m.addLayer({ id: 'route-glow', type: 'line', source: 'routes', filter: ['==', ['get', 'active'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#27d7e8', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 14, 16, 30, 19, 70], 'line-blur': ['interpolate', ['linear'], ['zoom'], 10, 8, 16, 18, 19, 40], 'line-opacity': this.mode === 'nuit' ? 0.35 : 0.18 } }, before);
      m.addLayer({ id: 'route-casing', type: 'line', source: 'routes', filter: ['==', ['get', 'active'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#05323c', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 8, 16, 16, 19, 36] } }, before);
      m.addLayer({ id: 'route-line', type: 'line', source: 'routes', filter: ['==', ['get', 'active'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 11, 19, 28], 'line-gradient': this.gradient() } }, before);
      // Chevrons de direction le long du trajet
      m.addLayer({ id: 'route-arrows', type: 'symbol', source: 'routes', filter: ['==', ['get', 'active'], true], minzoom: 14,
        layout: { 'symbol-placement': 'line', 'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 14, 60, 18, 110], 'icon-image': 'azz-chevron', 'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 17, 0.95, 19, 1.7], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
        paint: { 'icon-opacity': 0.9 } }, before);
      // Flèche de la prochaine manœuvre peinte sur la chaussée
      m.addLayer({ id: 'man-casing', type: 'line', source: 'maneuver', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#063640', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 7, 17, 13, 19, 30] } }, before);
      m.addLayer({ id: 'man-line', type: 'line', source: 'maneuver', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 4, 17, 8, 19, 20] } }, before);
      m.addLayer({ id: 'man-head', type: 'symbol', source: 'maneuver', filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'icon-image': 'azz-head', 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.4, 17, 0.75, 19, 1.7], 'icon-rotate': ['get', 'b'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } }, before);
    }
    if (!m.getLayer(this.carLayer.id)) m.addLayer(this.carLayer);
    this.onStyle && this.onStyle();
  }

  ensureImages() {
    const m = this.map;
    const mk = (id, w, h, draw) => {
      if (m.hasImage(id)) return;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); draw(g, w, h);
      m.addImage(id, g.getImageData(0, 0, w, h), { pixelRatio: 2 });
    };
    // chevron pointant dans le sens de la ligne (vers la droite de l'image)
    mk('azz-chevron', 48, 48, (g) => { g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(16, 10); g.lineTo(32, 24); g.lineTo(16, 38); g.stroke(); });
    // tête de flèche (pointe vers le haut de l'image = cap)
    mk('azz-head', 96, 96, (g) => { g.fillStyle = '#063640'; g.beginPath(); g.moveTo(48, 4); g.lineTo(92, 70); g.lineTo(4, 70); g.closePath(); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(48, 14); g.lineTo(80, 64); g.lineTo(16, 64); g.closePath(); g.fill(); });
  }

  // Segment de la prochaine manœuvre (coordonnées) + cap final pour la pointe
  setManeuver(coords) {
    if (!coords || coords.length < 2) this.maneuverData = EMPTY;
    else {
      const a = coords[coords.length - 2], b = coords[coords.length - 1];
      const br = (Math.atan2((b[0] - a[0]) * Math.cos((b[1] * Math.PI) / 180), b[1] - a[1]) * 180) / Math.PI;
      this.maneuverData = { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
        { type: 'Feature', properties: { b: br }, geometry: { type: 'Point', coordinates: b } },
      ] };
    }
    const src = this.map && this.map.getSource('maneuver');
    if (src) src.setData(this.maneuverData);
  }

  gradient() {
    const p = clamp(this.progress, 0, 0.9999);
    if (p <= 0.0001) return ['interpolate', ['linear'], ['line-progress'], 0, '#27d7e8', 1, '#2fe0ef'];
    return ['step', ['line-progress'], 'rgba(130,140,160,0.55)', p, '#27d7e8'];
  }

  setProgress(p) {
    this.progress = p;
    if (this.map && this.map.getLayer('route-line')) this.map.setPaintProperty('route-line', 'line-gradient', this.gradient());
  }

  async setMode(mode) {
    if (mode === this.mode && this.map) return;
    this.mode = mode;
    await this.ready;
    const style = await this.styleFor(mode);
    this.map.setStyle(style, { diff: false });
  }

  setRoutes(routes, activeId) {
    this.routeData = {
      type: 'FeatureCollection',
      features: routes.map((r) => ({ type: 'Feature', properties: { id: r.id, active: r.id === activeId }, geometry: { type: 'LineString', coordinates: r.coords } }))
        .sort((a, b) => (a.properties.active ? 1 : 0) - (b.properties.active ? 1 : 0)),
    };
    const src = this.map && this.map.getSource('routes');
    if (src) src.setData(this.routeData);
  }

  clearRoutes() { this.setRoutes([], null); this.setProgress(0); this.setManeuver(null); }

  fitRoutes(routes, padding) {
    const all = routes.flatMap((r) => r.coords);
    if (!all.length) return;
    const b = bbox(all);
    this.map.fitBounds(b, { padding, pitch: 35, bearing: 0, duration: 900, maxZoom: 16.5 });
  }

  setCar(spec) { this.carLayer.setSpec(spec); this.map && this.map.triggerRepaint(); }

  // Taille d'affichage de la voiture : constante à l'écran (comme dans les apps de navigation)
  carScale(lat, zoom, targetPx) {
    const mpp = metersPerPixel(lat, zoom);
    const L = (this.carLayer.car && this.carLayer.car.userData.spec.L) || 4.2;
    return clamp((targetPx * mpp) / L, 1, 40);
  }

  setCarPose(lngLat, heading, targetPx, anim) {
    if (!this.map) return;
    const z = this.map.getZoom();
    this.carLayer.pose = { lngLat, heading, scale: this.carScale(lngLat[1], z, targetPx) };
    if (anim) this.carLayer.anim = anim;
    this.map.triggerRepaint();
  }

  hideCar() { this.carLayer.pose = null; this.map && this.map.triggerRepaint(); }
}

export { maplibregl };
