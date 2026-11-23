// Service worker AZZ DRIVE : ouverture instantanée et fonctionnement de base hors ligne.
const V = 'azz-v4';
const TILES = 'azz-tiles';
const MAX_TILES = 2500;
let puts = 0;
// Limite la taille du cache des tuiles (supprime les plus anciennes)
async function trim(c) { const keys = await c.keys(); if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES + 300).map((k) => c.delete(k))); }
const SHELL = ['./', 'index.html', 'suivre.html', 'css/app.css', 'manifest.webmanifest',
  'js/main.js', 'js/suivre.js', 'js/geo.js', 'js/api.js', 'js/nav.js', 'js/sim.js', 'js/store.js', 'js/voice.js', 'js/icons.js', 'js/map.js', 'js/car3d.js', 'js/spotify.js', 'js/live.js', 'js/share.js', 'js/locate.js', 'js/vehicles.js', 'js/radars.js', 'data/radars.json',
  'vendor/maplibre-gl.mjs', 'vendor/maplibre-gl-worker.mjs', 'vendor/maplibre-gl.css', 'vendor/three.module.js', 'vendor/three.core.js', 'vendor/RoomEnvironment.js', 'vendor/mqtt.esm.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== TILES && k.startsWith('azz-')).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Tuiles de carte : cache d'abord (rapide, économise les données)
  if (url.hostname === 'tiles.openfreemap.org' || url.hostname.endsWith('arcgisonline.com')) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && !/styles\//.test(url.pathname)) { c.put(req, res.clone()); if (++puts % 100 === 0) trim(c); }
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Application : réseau d'abord (toujours la dernière version), cache en secours hors ligne
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((r) => r || caches.match('index.html'))));
});
