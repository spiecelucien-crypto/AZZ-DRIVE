// Données locales (restent sur l'appareil) : réglages, véhicule, favoris, récents, proches.
const KEY = 'azzdrive.v1';

const DEFAULTS = {
  onboarded: false,
  name: '',
  car: { model: 'citadine', color: '#0d0f13', plate: 'AZZ-DRIVE', nick: 'Ma voiture' },
  mapStyle: 'auto', // auto | nuit | jour | satellite
  voice: true,
  voiceRate: 1.0,
  showLimits: true,
  limitTolerance: 5,
  avoidTolls: false,
  avoidHighways: false,
  autoShare: false,
  camera: 'chase', // chase | overview
  simSpeed: 1,
  spotifyClientId: '',
  favorites: { home: null, work: null },
  recents: [],
  contacts: [],
  reportsEnabled: true,
  lastPos: null,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...d, car: { ...DEFAULTS.car, ...(d.car || {}) }, favorites: { ...DEFAULTS.favorites, ...(d.favorites || {}) } };
  } catch { return structuredClone(DEFAULTS); }
}

const listeners = new Set();
export const store = {
  data: load(),
  get(k) { return this.data[k]; },
  set(k, v) { this.data[k] = v; this.save(); listeners.forEach((f) => f(k, v)); },
  patch(k, obj) { this.set(k, { ...this.data[k], ...obj }); },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {} },
  on(f) { listeners.add(f); return () => listeners.delete(f); },
  addRecent(place) {
    const list = (this.data.recents || []).filter((p) => !(Math.abs(p.coord[0] - place.coord[0]) < 1e-4 && Math.abs(p.coord[1] - place.coord[1]) < 1e-4));
    list.unshift({ title: place.title, subtitle: place.subtitle || '', coord: place.coord, t: Date.now() });
    this.set('recents', list.slice(0, 12));
  },
  reset() { localStorage.removeItem(KEY); this.data = structuredClone(DEFAULTS); },
};
