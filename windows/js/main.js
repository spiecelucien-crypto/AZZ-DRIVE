// AZZ DRIVE — application de navigation 3D (web app installable sur iPhone, Android et Windows).
import { store } from './store.js';
import { MapView, resolveStyleMode, maplibregl } from './map.js';
import { geocode, reverse, route as fetchRoute, speedLimits, routeSummaryLabel, mainRoad } from './api.js';
import { NavEngine, maneuverTitle, maneuverStreet } from './nav.js';
import { GPS, Simulator } from './sim.js';
import { Voice } from './voice.js';
import { Spotify, redirectUri } from './spotify.js';
import { TripShare, Reports, appBase } from './share.js';
import { live } from './live.js';
import { icon, maneuverIcon, REPORT_TYPES } from './icons.js';
import { MODELS, COLORS, Garage } from './car3d.js';
import * as G from './geo.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo');
const DEFAULT_CENTER = [4.4025, 51.2194]; // Anvers
const LOGO = '<svg class="logo-mark" viewBox="0 0 34 30" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"><path d="M17 2 3 28l14-7 14 7Z"/></svg>';

const S = {
  screen: 'explore', pos: null, dest: null, routes: [], activeId: null, nav: null, sim: null, gps: null,
  follow: true, cam: store.get('camera'), disp: { coord: null, heading: 0, along: 0 }, fixPerf: 0, speed: 0,
  prevSpeed: 0, braking: false, tab: 'nav', arrived: false, searchMode: 'go', lastReportWatch: null,
  rerouting: false, lastOverWarn: 0, alertedReports: new Set(), wakeLock: null, userMovedAt: 0,
};

const share = new TripShare();
const reports = new Reports();
let mapView, map, garage;
const markers = { dest: null, reports: new Map() };

// ---------------------------------------------------------------- Mise en page
function layout() {
  const w = innerWidth, h = innerHeight;
  const land = (w > h && h < 700) || w >= 900;
  document.body.classList.toggle('land', land);
  document.body.classList.toggle('port', !land);
  document.body.classList.toggle('wide', w >= 900 && h >= 600);
}
addEventListener('resize', () => { layout(); if (S.screen === 'drive') renderDrive(); });

function show(name) {
  S.screen = name;
  for (const id of ['explore', 'search', 'preview', 'drive']) $('#' + id).classList.toggle('hidden', id !== name);
  document.body.classList.toggle('drive', name === 'drive');
}

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function greeting() {
  const h = new Date().getHours();
  const n = store.get('name');
  const g = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  return n ? `${g} ${esc(n)}` : 'Où allez-vous ?';
}

const STYLE_ICON = { auto: 'auto', nuit: 'moon', jour: 'sun', satellite: 'globe' };
const STYLE_LABEL = { auto: 'Auto', nuit: 'Nuit', jour: 'Jour', satellite: 'Satellite 3D' };

// ---------------------------------------------------------------- Explorer
function renderExplore() {
  const fav = store.get('favorites');
  const rec = store.get('recents').slice(0, 6);
  const car = store.get('car');
  const chip = (ic, title, sub, attrs) => `<button class="qd" ${attrs}><span class="qi">${icon(ic, 20)}</span><span><b>${esc(title)}</b><span>${esc(sub)}</span></span></button>`;
  $('#explore').innerHTML = `
    <div class="ex-top">
      <button class="searchbar card" id="exSearch">${LOGO}<span><b>Où allez-vous ?</b></span></button>
      <button class="roundbtn" id="exSettings" aria-label="Réglages">${icon('settings')}</button>
    </div>
    <div class="ex-right">
      <button class="roundbtn" id="exStyle" aria-label="Style de carte : ${STYLE_LABEL[store.get('mapStyle')]}">${icon(STYLE_ICON[store.get('mapStyle')])}</button>
      <button class="roundbtn" id="exLocate" aria-label="Me localiser">${icon('locate')}</button>
    </div>
    <div class="ex-speed hidden" id="exSpeed"><div class="speedpill card"><div class="sp-speed"><b class="num" id="exSpeedV">0</b><span>km/h</span></div></div></div>
    <div class="ex-sheet card">
      <h2>${greeting()}</h2>
      <div class="quick">
        ${chip('home', 'Maison', fav.home ? fav.home.title : 'Définir', `data-fav="home"`)}
        ${chip('work', 'Travail', fav.work ? fav.work.title : 'Définir', `data-fav="work"`)}
        ${rec.map((r, i) => chip('clock', r.title, r.subtitle || '', `data-rec="${i}"`)).join('')}
      </div>
      <div class="ex-actions">
        <button class="act" id="exGarage">${icon('car')}<span>${esc(car.nick || 'Ma voiture')}</span></button>
        <button class="act orange" id="exReport">${icon('alert')}<span>Signaler</span></button>
        <button class="act" id="exPeople">${icon('users')}<span>Mes proches</span></button>
      </div>
    </div>`;
  $('#exSearch').onclick = () => openSearch('go');
  $('#exSettings').onclick = openSettings;
  $('#exGarage').onclick = openGarage;
  $('#exReport').onclick = openReport;
  $('#exPeople').onclick = openContacts;
  $('#exLocate').onclick = () => { S.follow = true; if (!S.pos) startGPS(true); else flyToPos(); };
  $('#exStyle').onclick = cycleStyle;
  $$('[data-fav]').forEach((b) => b.onclick = () => {
    const k = b.dataset.fav;
    const f = store.get('favorites')[k];
    if (f) goPreview(f); else openSearch(k === 'home' ? 'setHome' : 'setWork');
  });
  $$('[data-rec]').forEach((b) => b.onclick = () => goPreview(store.get('recents')[+b.dataset.rec]));
}

function cycleStyle() {
  const order = ['auto', 'nuit', 'jour', 'satellite'];
  const next = order[(order.indexOf(store.get('mapStyle')) + 1) % order.length];
  store.set('mapStyle', next);
  applyStyle();
  toast(`Carte : ${STYLE_LABEL[next]}`);
  if (S.screen === 'explore') renderExplore();
}
function applyStyle() { mapView.setMode(resolveStyleMode(store.get('mapStyle'))); }

function flyToPos() {
  if (!S.pos) return;
  map.easeTo({ center: S.pos.coord, zoom: 16.4, pitch: 55, duration: 800, padding: explorePadding() });
}

function explorePadding() {
  const land = document.body.classList.contains('land');
  return land ? { left: Math.min(440, innerWidth * 0.48), top: 60, right: 60, bottom: 20 } : { top: 80, bottom: 240, left: 0, right: 0 };
}

// ---------------------------------------------------------------- Recherche
let searchAbort = null, searchTimer = null;
function openSearch(mode = 'go') {
  S.searchMode = mode;
  const title = mode === 'setHome' ? 'Adresse de la maison' : mode === 'setWork' ? 'Adresse du travail' : 'Où allez-vous ?';
  $('#search').innerHTML = `
    <div class="s-head">
      <button class="roundbtn" id="sBack" aria-label="Retour">${icon('back')}</button>
      <label class="s-input">${icon('search', 20)}<input id="sInput" type="search" enterkeyhint="search" autocomplete="off" placeholder="${title}"></label>
    </div>
    <div class="s-list" id="sList"></div>`;
  show('search');
  $('#sBack').onclick = () => { show(S.dest && S.routes.length ? 'preview' : 'explore'); };
  const input = $('#sInput');
  input.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(input.value), 260); };
  input.onkeydown = (e) => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(input.value); } };
  renderSearchHome();
  setTimeout(() => input.focus(), 60);
}

function placeRow(p, i, ic = 'pin') {
  const d = S.pos && p.coord ? G.fmtDistance(G.dist(S.pos.coord, p.coord)) : '';
  return `<button class="s-item" data-i="${i}"><span class="si">${icon(ic, 20)}</span><span style="min-width:0"><b>${esc(p.title)}</b><span>${esc(p.subtitle || '')}</span></span><span class="sd">${d}</span></button>`;
}

function renderSearchHome() {
  const fav = store.get('favorites');
  const rec = store.get('recents');
  const items = [];
  let html = '';
  if (S.searchMode === 'go') {
    html += `<div class="s-sec">Favoris</div>`;
    for (const k of ['home', 'work']) {
      const f = fav[k];
      items.push(f ? f : { title: k === 'home' ? 'Maison' : 'Travail', subtitle: 'Définir l\'adresse', set: k });
      html += placeRow(f ? { ...f, title: (k === 'home' ? 'Maison · ' : 'Travail · ') + f.title } : items[items.length - 1], items.length - 1, k === 'home' ? 'home' : 'work');
    }
  }
  if (rec.length) {
    html += `<div class="s-sec">Récents</div>`;
    rec.forEach((r) => { items.push(r); html += placeRow(r, items.length - 1, 'clock'); });
  }
  if (!items.length) html = `<div class="s-empty">Tapez une adresse, un lieu, une ville…</div>`;
  $('#sList').innerHTML = html;
  bindResults(items);
}

async function runSearch(q) {
  q = q.trim();
  if (q.length < 2) return renderSearchHome();
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  $('#sList').innerHTML = `<div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
  try {
    const near = S.pos ? S.pos.coord : map.getCenter().toArray();
    const res = await geocode(q, near, searchAbort.signal);
    if (!res.length) { $('#sList').innerHTML = `<div class="s-empty">Aucun résultat pour « ${esc(q)} ».</div>`; return; }
    $('#sList').innerHTML = `<div class="s-sec">Résultats</div>` + res.map((p, i) => placeRow(p, i)).join('');
    bindResults(res);
  } catch (e) {
    if (e.name === 'AbortError') return;
    $('#sList').innerHTML = `<div class="s-empty">Recherche impossible pour le moment. Vérifiez la connexion.</div>`;
  }
}

function bindResults(items) {
  $$('#sList .s-item').forEach((b) => b.onclick = () => {
    const p = items[+b.dataset.i];
    if (p.set) { openSearch(p.set === 'home' ? 'setHome' : 'setWork'); return; }
    if (S.searchMode === 'setHome' || S.searchMode === 'setWork') {
      const k = S.searchMode === 'setHome' ? 'home' : 'work';
      store.patch('favorites', { [k]: { title: p.title, subtitle: p.subtitle, coord: p.coord } });
      toast(k === 'home' ? 'Maison enregistrée' : 'Travail enregistré');
      renderExplore(); show('explore');
      return;
    }
    goPreview(p);
  });
}

// ---------------------------------------------------------------- Aperçu des itinéraires
async function goPreview(place) {
  S.dest = place;
  S.routes = [];
  store.addRecent(place);
  show('preview');
  renderPreview(true);
  setDestMarker(place.coord);
  let from = S.pos ? S.pos.coord : null;
  if (!from) {
    from = store.get('lastPos') || map.getCenter().toArray();
    toast('Position GPS inconnue : départ depuis la dernière position connue');
  }
  try {
    const rs = await fetchRoute(from, place.coord, { avoidTolls: store.get('avoidTolls'), avoidHighways: store.get('avoidHighways'), heading: S.pos?.speed > 3 ? S.pos.heading : null });
    if (S.dest !== place) return;
    S.routes = rs;
    S.activeId = rs[0].id;
    S.origin = from;
    mapView.setRoutes(rs, S.activeId);
    mapView.setProgress(0);
    renderPreview(false);
    fitPreview();
    if (!S.pos) mapView.setCarPose(from, G.bearing(from, rs[0].coords[1] || from), carPx(), null);
  } catch (e) {
    console.error(e);
    renderPreview(false, 'Impossible de calculer l\'itinéraire. Vérifiez la connexion et réessayez.');
  }
}

function fitPreview() {
  const land = document.body.classList.contains('land');
  const pad = land ? { left: Math.min(460, innerWidth * 0.5), right: 60, top: 70, bottom: 40 } : { top: 110, bottom: Math.min(420, innerHeight * 0.5), left: 40, right: 40 };
  S.follow = false;
  mapView.fitRoutes(S.routes, pad);
}

function renderPreview(loading, error) {
  const p = S.dest;
  const now = Date.now();
  const routesHtml = loading ? '<div class="skel"></div><div class="skel"></div>' : error ? `<div class="pv-loading">${esc(error)}</div>` : S.routes.map((r) => {
    const eta = G.fmtClock(new Date(now + r.duration * 1000));
    const road = mainRoad(r);
    const tags = routeSummaryLabel(r).map((t) => `<span class="tag">${t}</span>`).join('');
    return `<button class="rt ${r.id === S.activeId ? 'on' : ''}" data-id="${r.id}"><div class="rt-time num">${G.fmtDuration(r.duration)}</div><div class="rt-meta"><b>${road ? 'Par ' + esc(road) : 'Itinéraire'}</b><span class="num">${G.fmtDistance(r.length)} · arrivée ${eta}</span>${tags}</div></button>`;
  }).join('');
  $('#preview').innerHTML = `
    <div class="pv-top">
      <button class="roundbtn" id="pvBack" aria-label="Retour">${icon('back')}</button>
      <div class="pv-dest card"><b>${esc(p.title)}</b><span>${esc(p.subtitle || '')}</span></div>
    </div>
    <div class="pv-sheet card">
      <div class="routes">${routesHtml}</div>
      <div class="pv-opts">
        <button class="chip ${store.get('avoidTolls') ? 'on' : ''}" id="oTolls">Éviter les péages</button>
        <button class="chip ${store.get('avoidHighways') ? 'on' : ''}" id="oHw">Éviter les autoroutes</button>
        <button class="chip ${store.get('autoShare') ? 'on' : ''}" id="oShare">${icon('users', 18)}Prévenir mes proches</button>
      </div>
      <div class="pv-go">
        <button class="btn primary" id="pvStart" ${loading || error ? 'disabled' : ''}>${icon('nav', 20)}Démarrer</button>
        <button class="btn secondary" id="pvSim" ${loading || error ? 'disabled' : ''} aria-label="Simuler le trajet">${icon('sim', 20)}Simuler</button>
      </div>
    </div>`;
  $('#pvBack').onclick = cancelPreview;
  $$('.rt').forEach((b) => b.onclick = () => selectRoute(b.dataset.id));
  $('#oTolls').onclick = () => { store.set('avoidTolls', !store.get('avoidTolls')); goPreview(S.dest); };
  $('#oHw').onclick = () => { store.set('avoidHighways', !store.get('avoidHighways')); goPreview(S.dest); };
  $('#oShare').onclick = (e) => { store.set('autoShare', !store.get('autoShare')); e.currentTarget.classList.toggle('on', store.get('autoShare')); };
  $('#pvStart').onclick = () => startNav(false);
  $('#pvSim').onclick = () => startNav(true);
}

function selectRoute(id) {
  S.activeId = id;
  mapView.setRoutes(S.routes, id);
  $$('.rt').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
}

function cancelPreview() {
  S.dest = null; S.routes = [];
  mapView.clearRoutes();
  setDestMarker(null);
  show('explore'); renderExplore();
  S.follow = true;
  if (S.pos) flyToPos();
}

function setDestMarker(coord) {
  if (markers.dest) { markers.dest.remove(); markers.dest = null; }
  if (!coord) return;
  const el = document.createElement('div');
  el.className = 'dest-mk';
  el.innerHTML = `<svg width="40" height="52" viewBox="0 0 40 52"><path d="M20 51s17-15.6 17-30A17 17 0 0 0 3 21c0 14.4 17 30 17 30Z" fill="#27d7e8" stroke="#05323c" stroke-width="2"/><path d="M14 30V12M14 12h12l-3 4 3 4H14" fill="none" stroke="#04161a" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  markers.dest = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(coord).addTo(map);
}

// ---------------------------------------------------------------- Navigation
async function startNav(simulate) {
  const r = S.routes.find((x) => x.id === S.activeId);
  if (!r) return;
  Voice.unlock();
  Voice.setEnabled(store.get('voice'));
  S.arrived = false; S.follow = true; S.tab = 'nav'; S.cam = store.get('camera');
  S.routes = [r];
  mapView.setRoutes([r], r.id);
  S.nav = new NavEngine(r, { onVoice: (t) => Voice.say(t), onReroute: reroute, onArrive: arrive });
  S.disp.along = 0;
  S.alertedReports.clear();
  show('drive');
  renderDrive();
  requestWakeLock();
  if (!r.limits) speedLimits(r).then((l) => { if (l) r.limits = l; });
  Voice.say(`C'est parti. ${S.nav.firstInstruction()}.`, { priority: true });
  if (simulate) {
    S.simulating = true;
    S.sim = new Simulator(r, onFix, { multiplier: store.get('simSpeed'), getLimit: (i) => (r.limits ? r.limits[Math.min(i, r.limits.length - 1)] : 0) });
    S.sim.start();
  } else {
    S.simulating = false;
    startGPS(false);
  }
  if (Spotify.state.connected && !Spotify.state.demo) Spotify.startPolling();
  if (store.get('autoShare') && !share.active) { await startShare(); openShare(); }
  else if (share.active) share.setRoute(r);
}

async function reroute(fix) {
  if (S.rerouting || !S.dest) return;
  S.rerouting = true;
  showBanner('route', 'Recalcul de l\'itinéraire…');
  Voice.say('Recalcul de l\'itinéraire');
  try {
    const rs = await fetchRoute(fix.coord, S.dest.coord, { alternates: 0, heading: fix.heading, avoidTolls: store.get('avoidTolls'), avoidHighways: store.get('avoidHighways') });
    const r = rs[0];
    S.routes = [r]; S.activeId = r.id;
    S.nav.setRoute(r);
    S.disp.along = 0;
    mapView.setRoutes([r], r.id);
    if (share.active) share.setRoute(r);
    speedLimits(r).then((l) => { if (l) r.limits = l; });
    showBanner('route', `Nouvel itinéraire · ${G.fmtDuration(r.duration)}`, 3000);
  } catch (e) {
    showBanner('alert', 'Recalcul impossible, nouvel essai bientôt', 3000);
  } finally { S.rerouting = false; }
}

function arrive() {
  S.arrived = true;
  Voice.say('Vous êtes arrivé à destination', { priority: true });
  if (share.active) share.update({ coord: S.pos?.coord || S.dest.coord, heading: S.disp.heading, speed: 0, remaining: 0, remTime: 0, status: 'arrivé', force: true });
  if (share.active) setTimeout(() => share.stop('arrivé'), 1500);
  if (S.sim) { S.sim.stop(); }
  const el = document.createElement('div');
  el.className = 'arrive card';
  el.id = 'arriveCard';
  el.innerHTML = `<div class="flag">${icon('flag', 30)}</div><h3>Vous êtes arrivé</h3><p>${esc(S.dest?.title || '')} · ${G.fmtClock(new Date())}</p><button class="btn primary block" id="arrDone">Terminer</button>`;
  $('#drive').appendChild(el);
  $('#arrDone').onclick = endNav;
}

function endNav() {
  if (S.sim) S.sim.stop();
  S.sim = null; S.simulating = false; S.nav = null; S.arrived = false;
  if (share.active) share.stop('terminé');
  Spotify.stopPolling();
  speechSynthesis && speechSynthesis.cancel();
  releaseWakeLock();
  mapView.clearRoutes();
  setDestMarker(null);
  S.routes = []; S.dest = null;
  closeSheet();
  show('explore'); renderExplore();
  S.follow = true;
  if (S.pos) { mapView.setCarPose(S.pos.coord, S.disp.heading, carPx(), null); flyToPos(); }
  startGPS(false);
}

function onFix(fix) {
  const now = performance.now();
  const dt = S.fixPerf ? (now - S.fixPerf) / 1000 : 1;
  S.prevSpeed = S.speed;
  S.speed = fix.speed || 0;
  S.braking = dt > 0 && (S.prevSpeed - S.speed) / dt > 1.2 && S.speed > 0.5 || (S.speed < 0.3 && S.prevSpeed > 0.3);
  S.fixPerf = now;
  S.pos = fix;
  if (fix.real) store.data.lastPos = fix.coord;
  if (!S.disp.coord) { S.disp.coord = fix.coord.slice(); S.disp.heading = fix.heading || 0; }
  if (S.nav && !S.arrived) {
    const st = S.nav.update(fix);
    if (share.active) share.update({ coord: st.snapped, heading: S.disp.heading, speed: S.speed, remaining: st.remaining, remTime: st.remTime, eta: Date.now() + st.remTime * 1000 });
    checkReportsAhead(st);
    checkSpeeding(st);
  }
  if (!S.lastReportWatch || G.dist(S.lastReportWatch, fix.coord) > 2500) {
    S.lastReportWatch = fix.coord;
    if (store.get('reportsEnabled')) reports.watch(fix.coord).catch(() => {});
  }
  if (S.screen === 'explore') {
    const sp = $('#exSpeed');
    if (sp) { sp.classList.toggle('hidden', S.speed < 2); $('#exSpeedV').textContent = Math.round(S.speed * 3.6); }
  }
}

function checkSpeeding(st) {
  if (!store.get('showLimits') || !st.limit) return;
  const kmh = S.speed * 3.6;
  if (kmh > st.limit + store.get('limitTolerance') && Date.now() - S.lastOverWarn > 60000) {
    S.lastOverWarn = Date.now();
    Voice.say(`Attention, limitation à ${st.limit}`);
  }
}

function checkReportsAhead(st) {
  if (!store.get('reportsEnabled')) return;
  const ahead = reports.ahead(S.nav.route, st.along, 900);
  const r = ahead[0];
  if (r && !S.alertedReports.has(r.id) && r.ahead < 700) {
    S.alertedReports.add(r.id);
    const t = REPORT_TYPES[r.type];
    Voice.say(`${t.label} signalé à ${G.spokenDistance(r.ahead)}`);
    showBanner(r.type, `${t.label} signalé · ${G.fmtDistance(r.ahead)}`, 6000);
  }
}

let bannerTimer;
function showBanner(kind, text, ms = 0) {
  let b = $('#banner');
  if (!b) { b = document.createElement('div'); b.id = 'banner'; b.className = 'banner card'; $('#drive').appendChild(b); }
  const rt = REPORT_TYPES[kind];
  b.className = 'banner card' + (rt || kind === 'alert' ? ' alert' : '');
  b.innerHTML = `<span class="bi" style="background:${rt ? rt.color : kind === 'alert' ? '#ff9f0a' : '#0fb7c9'}">${icon(rt ? rt.icon : kind === 'alert' ? 'alert' : 'route', 20)}</span><span>${esc(text)}</span>`;
  b.classList.remove('hidden');
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
}

// ---------------------------------------------------------------- HUD de conduite
function renderDrive() {
  if (S.screen !== 'drive') return;
  const arrived = $('#arriveCard');
  $('#drive').innerHTML = `
    <div class="topbar">
      <div class="logo">${LOGO.replace('class="logo-mark"', 'style="color:#fff;width:34px;height:30px"')}AZZ DRIVE</div>
      <nav class="tabs card" aria-label="Onglets">
        <button class="tab ${S.tab === 'nav' ? 'on' : ''}" data-tab="nav">${icon('nav', 18)}Navigation</button>
        <button class="tab ${S.tab === 'music' ? 'on' : ''}" data-tab="music">${icon('music', 18)}Musique</button>
        <button class="tab ${S.tab === 'trip' ? 'on' : ''}" data-tab="trip">${icon('users', 18)}Trajet</button>
      </nav>
      <div class="tb-right"><button id="dMute" aria-label="Voix">${icon(store.get('voice') ? 'volume' : 'mute', 24)}</button><span class="clock num" id="dClock">${G.fmtClock(new Date())}</span></div>
    </div>
    <div class="mcard card" id="mcard">
      <div class="m-row">
        <div class="m-arrow" id="mArrow"></div>
        <div class="m-text"><div class="m-dist num" id="mDist">–</div><div class="m-title" id="mTitle"></div><div class="m-street" id="mStreet"></div></div>
      </div>
      <div class="m-stats num">
        <div>${icon('clock', 20)}<span id="mTime">–</span></div>
        <div>${icon('flag', 20)}<span id="mRem">–</span></div>
        <div class="eta"><span id="mEta">–</span></div>
      </div>
      <div class="m-progress"><i id="mProg"></i></div>
    </div>
    <div class="m-then card hidden" id="mThen"></div>
    <div class="rcol">
      <div class="spcard card" id="spCard"></div>
      <button class="tripcard card" id="tripCard"></button>
    </div>
    <button class="roundbtn lg reportfab" id="dReport2" aria-label="Signaler">${icon('alert', 26)}</button>
    <div class="bottom">
      <div class="b-left">
        <button class="roundbtn lg" id="dCam" aria-label="Caméra"></button>
        <button class="roundbtn lg reportbtn" id="dReport" aria-label="Signaler">${icon('alert', 26)}</button>
      </div>
      <div class="speedpill card" id="speedPill">
        <div class="sp-speed"><b class="num" id="dSpeed">0</b><span>km/h</span></div>
        <div class="vsep" id="limSep"></div>
        <div class="limit num" id="dLimit">50</div>
      </div>
      <button class="stopbtn" id="dStop" aria-label="Arrêter la navigation"><i></i><span>Arrêter la navigation</span></button>
    </div>`;
  if (arrived) $('#drive').appendChild(arrived);
  $$('.tab').forEach((b) => b.onclick = () => selectTab(b.dataset.tab));
  $('#dMute').onclick = () => { store.set('voice', !store.get('voice')); Voice.setEnabled(store.get('voice')); $('#dMute').innerHTML = icon(store.get('voice') ? 'volume' : 'mute', 24); toast(store.get('voice') ? 'Guidage vocal activé' : 'Guidage vocal coupé'); };
  $('#dStop').onclick = () => confirmStop();
  $('#dReport').onclick = openReport;
  $('#dReport2').onclick = openReport;
  $('#dCam').onclick = cameraButton;
  $('#tripCard').onclick = () => selectTab('trip');
  renderSpotifyCard();
  renderTripCard();
  updateCamButton();
  updateHUD(true);
}

function confirmStop() {
  if (S.arrived) return endNav();
  openSheet('Arrêter la navigation ?', `<p class="note" style="font-size:15px">Le guidage s'arrête${share.active ? ' et vos proches ne verront plus votre position' : ''}.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px"><button class="btn secondary" id="cNo">Continuer</button><button class="btn danger" id="cYes">Arrêter</button></div>`, (el) => {
    $('#cNo', el).onclick = closeSheet;
    $('#cYes', el).onclick = endNav;
  });
}

function selectTab(t) {
  S.tab = t;
  $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  if (t === 'music') openMusic();
  else if (t === 'trip') openShare();
  else closeSheet();
}

function cameraButton() {
  if (!S.follow) { S.follow = true; updateCamButton(); return; }
  S.cam = S.cam === 'chase' ? 'overview' : 'chase';
  store.set('camera', S.cam);
  if (S.cam === 'overview' && S.nav) {
    const r = S.nav.route;
    const along = S.nav.state ? S.nav.state.along : 0;
    const rest = r.coords.filter((_, i) => r.cum[i] >= along - 50);
    const land = document.body.classList.contains('land');
    map.fitBounds(G.bbox(rest.length > 1 ? rest : r.coords), { padding: land ? { left: Math.min(420, innerWidth * 0.36), right: Math.min(400, innerWidth * 0.33), top: 80, bottom: 90 } : { top: 230, bottom: 200, left: 40, right: 40 }, pitch: 30, bearing: 0, duration: 900, maxZoom: 17 });
  }
  toast(S.cam === 'chase' ? 'Vue de poursuite' : 'Vue d\'ensemble');
  updateCamButton();
}

function updateCamButton() {
  const b = $('#dCam');
  if (!b) return;
  b.innerHTML = !S.follow ? icon('locate', 26) : S.cam === 'chase' ? icon('nav', 26) : icon('route', 26);
  b.setAttribute('aria-label', !S.follow ? 'Recentrer' : S.cam === 'chase' ? 'Passer en vue d\'ensemble' : 'Passer en vue de poursuite');
  b.style.color = !S.follow ? 'var(--cyan)' : '';
}

let lastHud = {};
function setText(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; const el = document.getElementById(id); if (el) el.textContent = v; } }
function setHTML(id, v) { if (lastHud[id] !== v) { lastHud[id] = v; const el = document.getElementById(id); if (el) el.innerHTML = v; } }

function updateHUD(force) {
  if (S.screen !== 'drive') return;
  if (force) lastHud = {};
  const st = S.nav && S.nav.state;
  setText('dClock', G.fmtClock(new Date()));
  const kmh = Math.round(S.speed * 3.6);
  setText('dSpeed', String(kmh));
  if (!st) {
    const m0 = S.nav?.route.maneuvers[1] || S.nav?.route.maneuvers[0];
    if (m0) {
      setHTML('mArrow', maneuverIcon(m0.kind, 72));
      const d = G.fmtDistanceParts(m0.along);
      setHTML('mDist', `${d.value}<small>${d.unit}</small>`);
      setText('mTitle', maneuverTitle(m0));
      setText('mStreet', maneuverStreet(m0));
      setText('mTime', G.fmtDuration(S.nav.route.duration));
      setText('mRem', G.fmtDistance(S.nav.route.length));
      setText('mEta', G.fmtClock(new Date(Date.now() + S.nav.route.duration * 1000)));
    }
    toggleLimit(0, kmh);
    return;
  }
  const m = st.maneuver;
  setHTML('mArrow', maneuverIcon(m.kind, 72));
  const d = G.fmtDistanceParts(st.toNext);
  setHTML('mDist', `${d.value}<small>${d.unit}</small>`);
  setText('mTitle', maneuverTitle(m));
  setText('mStreet', maneuverStreet(m));
  setText('mTime', G.fmtDuration(st.remTime));
  setText('mRem', G.fmtDistance(st.remaining));
  setText('mEta', G.fmtClock(new Date(Date.now() + st.remTime * 1000)));
  const prog = $('#mProg'); if (prog) prog.style.width = (st.progress * 100).toFixed(1) + '%';
  const then = $('#mThen');
  if (then) {
    if (st.after && st.toNext < 600 && st.after.kind !== 'straight') {
      then.classList.remove('hidden');
      setHTML('mThen', `Puis ${maneuverIcon(st.after.kind, 26)}`);
      const mc = $('#mcard');
      then.style.top = (mc.offsetTop + mc.offsetHeight + 8) + 'px';
    } else then.classList.add('hidden');
  }
  toggleLimit(store.get('showLimits') ? st.limit : 0, kmh);
  mapView.setProgress(st.progress);
}

function toggleLimit(limit, kmh) {
  const lim = $('#dLimit'), sep = $('#limSep'), pill = $('#speedPill');
  if (!lim) return;
  const has = !!limit;
  lim.classList.toggle('hidden', !has); sep.classList.toggle('hidden', !has);
  if (has) setText('dLimit', String(limit));
  pill.classList.toggle('over', has && kmh > limit + store.get('limitTolerance'));
}

// ---------------------------------------------------------------- Spotify (carte + feuille)
function spArt(t, size) {
  return t && t.art ? `<div class="sp-art" style="background-image:url('${esc(t.art)}')"></div>` : `<div class="sp-art">${icon('music', size || 24)}</div>`;
}

function renderSpotifyCard() {
  const el = $('#spCard');
  if (!el) return;
  const s = Spotify.state;
  if (!s.connected) {
    el.innerHTML = `<div class="sp-head">${icon('spotify', 26)}Spotify</div><div class="sp-connect"><span>${Spotify.configured ? 'Contrôlez votre musique sans quitter la carte' : 'Branchez votre compte en 2 minutes'}</span><button class="btn green" style="height:42px;font-size:15px" id="spGo">${Spotify.configured ? 'Connecter' : 'Configurer'}</button></div>`;
    $('#spGo').onclick = () => Spotify.configured ? Spotify.login().catch((e) => toast(e.message)) : openMusic();
    return;
  }
  const t = s.track;
  if (!t) {
    el.innerHTML = `<div class="sp-head">${icon('spotify', 26)}Spotify</div><div class="sp-connect"><span>Aucune lecture en cours</span><a class="btn green" style="height:42px;font-size:15px" href="spotify:">Ouvrir Spotify</a></div>`;
    return;
  }
  const pct = t.duration ? Math.min(100, ((t.progress + (s.playing ? Date.now() - t.at : 0)) / t.duration) * 100) : 0;
  el.innerHTML = `<div class="sp-head">${icon('spotify', 26)}Spotify</div>
    <div class="sp-body">${spArt(t)}<div class="sp-t"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div></div>
    <div class="sp-ctrl"><button data-c="prev" aria-label="Précédent">${icon('prev', 26)}</button><button class="pp" data-c="toggle" aria-label="${s.playing ? 'Pause' : 'Lecture'}">${icon(s.playing ? 'pause' : 'play', 26)}</button><button data-c="next" aria-label="Suivant">${icon('next', 26)}</button></div>
    <div class="sp-bar"><i style="width:${pct.toFixed(1)}%"></i></div>`;
  $$('[data-c]', el).forEach((b) => b.onclick = () => Spotify.command(b.dataset.c).catch((e) => toast(e.message, 4000)));
}
Spotify.on(() => { renderSpotifyCard(); if ($('#musicSheet')) renderMusicBody(); });

function openMusic() {
  openSheet('Musique', '<div id="musicSheet"></div>', () => renderMusicBody(), () => { if (S.tab === 'music') { S.tab = 'nav'; $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === 'nav')); } });
}

async function renderMusicBody() {
  const el = $('#musicSheet');
  if (!el) return;
  const s = Spotify.state;
  if (!s.connected) {
    el.innerHTML = spotifySetupHTML();
    bindSpotifySetup(el);
    return;
  }
  const t = s.track;
  el.innerHTML = `
    <div class="group" style="padding:14px">
      <div class="np">${spArt(t, 34)}<div style="min-width:0"><b>${esc(t ? t.title : 'Aucune lecture')}</b><span class="muted">${esc(t ? t.artist : (s.device ? 'Appareil : ' + s.device : 'Lancez Spotify sur ce téléphone'))}</span></div></div>
      <div class="sp-ctrl" style="margin-top:12px"><button data-c="prev" aria-label="Précédent">${icon('prev', 28)}</button><button class="pp" data-c="toggle" aria-label="Lecture / pause">${icon(s.playing ? 'pause' : 'play', 28)}</button><button data-c="next" aria-label="Suivant">${icon('next', 28)}</button></div>
    </div>
    <label class="s-input" style="margin-bottom:12px">${icon('search', 20)}<input id="mSearch" type="search" placeholder="Titre, artiste, playlist…" autocomplete="off"></label>
    <div id="mResults"></div>
    <div class="group-t">Mes playlists</div>
    <div class="pl-grid" id="mPlaylists"><div class="skel"></div></div>
    <div style="display:flex;gap:10px;margin-top:16px"><a class="btn secondary" href="spotify:" style="flex:1">${icon('spotify', 20)}Ouvrir Spotify</a></div>`;
  $$('[data-c]', el).forEach((b) => b.onclick = () => Spotify.command(b.dataset.c).catch((e) => toast(e.message, 4000)));
  let tm;
  $('#mSearch', el).oninput = (e) => {
    clearTimeout(tm);
    const q = e.target.value.trim();
    tm = setTimeout(async () => {
      if (q.length < 2 || s.demo) { $('#mResults').innerHTML = ''; return; }
      try {
        const res = await Spotify.search(q);
        $('#mResults').innerHTML = `<div class="group">${res.map((r, i) => `<button class="row" data-u="${i}">${r.art ? `<span class="sp-art" style="width:44px;height:44px;background-image:url('${esc(r.art)}')"></span>` : `<span class="sp-art" style="width:44px;height:44px">${icon('music', 18)}</span>`}<span class="rl"><b>${esc(r.name)}</b><span>${esc(r.sub)}</span></span>${icon('play', 18)}</button>`).join('')}</div>`;
        $$('#mResults [data-u]').forEach((b) => b.onclick = () => Spotify.play(res[+b.dataset.u].uri).then(() => toast('Lecture lancée')).catch((e) => toast(e.message, 4000)));
      } catch (er) { $('#mResults').innerHTML = `<p class="note">${esc(er.message)}</p>`; }
    }, 350);
  };
  if (s.demo) { $('#mPlaylists').innerHTML = ['Route de nuit', 'Trajet du matin', 'Classiques', 'Podcasts'].map((n) => `<div class="pl"><div class="pa">${icon('music', 30)}</div><b>${n}</b></div>`).join(''); return; }
  try {
    const pls = await Spotify.playlists();
    const box = $('#mPlaylists');
    if (!box) return;
    box.innerHTML = pls.length ? pls.map((p, i) => `<button class="pl" data-p="${i}"><div class="pa" style="${p.art ? `background-image:url('${esc(p.art)}')` : ''}">${p.art ? '' : icon('music', 30)}</div><b>${esc(p.name)}</b></button>`).join('') : '<p class="note">Aucune playlist.</p>';
    $$('[data-p]', box).forEach((b) => b.onclick = () => Spotify.play(pls[+b.dataset.p].uri).then(() => toast('Playlist lancée')).catch((e) => toast(e.message, 4000)));
  } catch (e) { const box = $('#mPlaylists'); if (box) box.innerHTML = `<p class="note">${esc(e.message)}</p>`; }
}

function spotifySetupHTML() {
  return `
    <div class="group" style="padding:16px">
      <div class="live-head">${icon('spotify', 26)}<span style="color:var(--green)">Connecter Spotify</span></div>
      <p class="note" style="margin:10px 0 12px">Spotify demande une clé gratuite propre à votre compte (une seule fois, environ 2 minutes). Un compte Premium est nécessaire pour piloter la lecture.</p>
      <ol class="steps">
        <li>Ouvrez <b>developer.spotify.com/dashboard</b> et connectez-vous.</li>
        <li><b>Create app</b> : nom « AZZ DRIVE », cochez <b>Web API</b>.</li>
        <li>Dans <b>Redirect URIs</b>, collez exactement cette adresse :</li>
      </ol>
      <div class="code" style="margin:8px 0" id="spRedir">${esc(redirectUri())}</div>
      <button class="btn secondary block" id="spCopy" style="height:44px;margin-bottom:12px">${icon('copy', 18)}Copier l'adresse</button>
      <ol class="steps" start="4"><li>Enregistrez, puis copiez le <b>Client ID</b> ici :</li></ol>
      <input class="field" id="spCid" placeholder="Client ID Spotify" value="${esc(store.get('spotifyClientId'))}" style="margin:8px 0 12px" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="btn green block" id="spLogin">${icon('spotify', 20)}Connecter mon compte</button>
      ${Spotify.state.error ? `<p class="note" style="color:#ff8a80">${esc(Spotify.state.error)}</p>` : ''}
    </div>
    <a class="btn secondary block" href="spotify:">Ouvrir l'app Spotify</a>
    <button class="btn secondary block" id="spDemo" style="margin-top:10px">Essayer en mode démo</button>`;
}

function bindSpotifySetup(el) {
  $('#spCopy', el).onclick = () => copy(redirectUri(), 'Adresse copiée');
  $('#spLogin', el).onclick = () => {
    const v = $('#spCid', el).value.trim();
    if (v.length < 20) { toast('Collez le Client ID Spotify (32 caractères)'); return; }
    store.set('spotifyClientId', v);
    Spotify.login().catch((e) => toast(e.message));
  };
  const d = $('#spDemo', el);
  if (d) d.onclick = () => { Spotify.startDemo(); toast('Mode démo Spotify'); };
}

// ---------------------------------------------------------------- Partage avec les proches
function renderTripCard() {
  const el = $('#tripCard');
  if (!el) return;
  if (!share.active) {
    el.innerHTML = `<div class="tc-main"><div class="tc-title">${icon('users', 22)}<span class="t">Partager le trajet</span></div><div class="tc-sub">Vos proches suivent votre arrivée en direct</div></div>${icon('chevron', 22)}`;
    return;
  }
  const vs = share.activeViewers();
  const sub = vs.length ? `${vs.length} personne${vs.length > 1 ? 's' : ''} sui${vs.length > 1 ? 'vent' : 't'} ce trajet` : 'Lien prêt · en attente de vos proches';
  el.innerHTML = `<div class="tc-main"><div class="tc-title">${icon('users', 22)}<span class="t">Trajet partagé</span><span class="pill-dot"></span></div><div class="tc-sub">${sub}</div>${vs.length ? `<div class="avatars">${vs.slice(0, 5).map(avatar).join('')}</div>` : ''}</div>${icon('chevron', 22)}`;
}

const AV_COLORS = ['#e07a5f', '#7b8cde', '#3fb6a8', '#d4a72c', '#c86bbf', '#5aa0e0'];
function avatar(v) {
  const n = (v.name || '?').trim();
  const ini = n.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="av" style="background:${AV_COLORS[h % AV_COLORS.length]}" title="${esc(n)}">${esc(ini)}</span>`;
}

share.on((ev) => {
  renderTripCard();
  if ($('#shareSheet')) renderShareBody();
  if (ev.type === 'viewers' && ev.isNew) toast(`${ev.viewer.name || 'Un proche'} suit votre trajet`);
  if (ev.type === 'reaction') { toast(`${ev.reaction.name || 'Un proche'} : ${ev.reaction.text}`, 4500); Voice.say(`Message de ${ev.reaction.name || 'un proche'} : ${ev.reaction.text}`); }
});
setInterval(renderTripCard, 15000);

async function startShare() {
  try {
    const r = S.nav ? S.nav.route : null;
    const car = store.get('car');
    await share.start({ name: store.get('name') || 'Un proche', dest: S.dest, car: { model: car.model, color: car.color, plate: car.plate }, route: r });
    if (S.pos && S.nav?.state) share.update({ coord: S.nav.state.snapped, heading: S.disp.heading, speed: S.speed, remaining: S.nav.state.remaining, remTime: S.nav.state.remTime, eta: Date.now() + S.nav.state.remTime * 1000, force: true });
    return true;
  } catch (e) { toast('Partage indisponible : ' + e.message, 4000); return false; }
}

function shareText() {
  const n = store.get('name');
  const dest = S.dest ? ` vers ${S.dest.title}` : '';
  const eta = S.nav?.state ? ` Arrivée prévue à ${G.fmtClock(new Date(Date.now() + S.nav.state.remTime * 1000))}.` : '';
  return `${n ? n + ' est' : 'Je suis'} en route${dest}.${eta} Suivez le trajet en direct : ${share.link}`;
}

function openShare() {
  openSheet('Trajet partagé', '<div id="shareSheet"></div>', () => renderShareBody(), () => { if (S.tab === 'trip') { S.tab = 'nav'; $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === 'nav')); } });
}

function renderShareBody() {
  const el = $('#shareSheet');
  if (!el) return;
  if (!share.active) {
    el.innerHTML = `<div class="group" style="padding:16px">
      <p class="note" style="font-size:15px;margin:0 0 14px">Envoyez un lien à vos proches : ils voient votre voiture avancer sur la carte, l'heure d'arrivée, et peuvent vous envoyer un petit message lu à voix haute. Le partage s'arrête tout seul à l'arrivée.</p>
      <button class="btn primary block" id="shStart" ${S.nav ? '' : 'disabled'}>${icon('share', 20)}Partager mon trajet</button>
      ${S.nav ? '' : '<p class="note">Lancez une navigation pour partager un trajet.</p>'}
    </div>`;
    const b = $('#shStart', el);
    if (b) b.onclick = async () => { b.disabled = true; if (await startShare()) renderShareBody(); b.disabled = false; };
    return;
  }
  const vs = share.activeViewers();
  const contacts = store.get('contacts');
  const txt = encodeURIComponent(shareText());
  el.innerHTML = `
    <div class="group" style="padding:16px">
      <div class="live-head"><span class="pill-dot"></span>En direct · ${vs.length ? `${vs.length} personne${vs.length > 1 ? 's' : ''} sui${vs.length > 1 ? 'vent' : 't'}` : 'personne ne suit encore'}</div>
      <div class="code" style="margin-top:12px">${esc(share.link)}</div>
      <div class="share-btns">
        <a class="wa" href="https://wa.me/?text=${txt}" target="_blank" rel="noopener">${icon('message', 22)}WhatsApp</a>
        <a href="sms:&body=${txt}">${icon('phone', 22)}SMS</a>
        <button id="shCopy">${icon('copy', 22)}Copier</button>
        <button id="shMore">${icon('share', 22)}Plus…</button>
      </div>
    </div>
    ${contacts.length ? `<div class="group-t">Mes proches</div><div class="group">${contacts.map((c) => `<div class="row"><span class="av" style="margin:0;background:#3a4a66">${esc((c.name || '?')[0].toUpperCase())}</span><span class="rl"><b>${esc(c.name)}</b><span>${esc(c.phone || '')}</span></span><a class="chip" href="https://wa.me/${esc((c.phone || '').replace(/[^0-9]/g, ''))}?text=${txt}" target="_blank" rel="noopener">WhatsApp</a><a class="chip" href="sms:${esc(c.phone || '')}&body=${txt}">SMS</a></div>`).join('')}</div>` : ''}
    ${vs.length ? `<div class="group-t">Ils suivent</div><div class="group">${vs.map((v) => `<div class="row">${avatar(v)}<span class="rl"><b>${esc(v.name)}</b><span>connecté</span></span></div>`).join('')}</div>` : ''}
    ${share.reactions.length ? `<div class="group-t">Messages</div><div class="group" style="padding:0 16px">${share.reactions.map((r) => `<div class="react">${avatar(r)}<span><b>${esc(r.name || 'Proche')}</b> · ${esc(r.text)}</span></div>`).join('')}</div>` : ''}
    <button class="btn danger block" id="shStop" style="margin-top:6px">Arrêter le partage</button>
    <p class="note">Toute personne qui a le lien voit votre position pendant ce trajet. Le lien ne fonctionne plus après l'arrivée ou l'arrêt du partage.</p>`;
  $('#shCopy', el).onclick = () => copy(share.link, 'Lien copié');
  $('#shMore', el).onclick = () => { if (navigator.share) navigator.share({ title: 'AZZ DRIVE', text: shareText(), url: share.link }).catch(() => {}); else copy(shareText(), 'Message copié'); };
  $('#shStop', el).onclick = () => { share.stop('arrêté'); toast('Partage arrêté'); renderShareBody(); };
}

function openContacts() {
  openSheet('Mes proches', '<div id="contactsSheet"></div>', renderContacts);
}
function renderContacts() {
  const el = $('#contactsSheet');
  if (!el) return;
  const cs = store.get('contacts');
  el.innerHTML = `
    <p class="note" style="font-size:15px;margin-top:0">Pendant un trajet, envoyez le lien de suivi à vos proches en un geste (WhatsApp ou SMS). Activez « Prévenir mes proches » avant de démarrer.</p>
    <div class="group">${cs.length ? cs.map((c, i) => `<div class="row"><span class="av" style="margin:0;background:#3a4a66">${esc((c.name || '?')[0].toUpperCase())}</span><span class="rl"><b>${esc(c.name)}</b><span>${esc(c.phone || 'Sans numéro')}</span></span><button class="sh-close" data-del="${i}" aria-label="Supprimer">${icon('trash', 18)}</button></div>`).join('') : '<div class="row"><span class="rl"><span>Aucun proche enregistré.</span></span></div>'}</div>
    <div class="group" style="padding:14px;display:grid;gap:10px">
      <input class="field" id="cName" placeholder="Prénom (ex. Maman)" autocomplete="off">
      <input class="field" id="cPhone" type="tel" placeholder="Téléphone (ex. +32 470 12 34 56)" autocomplete="off">
      <button class="btn primary" id="cAdd">${icon('plus', 20)}Ajouter</button>
    </div>
    <div class="row group" style="cursor:pointer" id="cAuto"><span class="rl"><b>Prévenir mes proches à chaque départ</b><span>Le lien de suivi est créé dès que la navigation démarre</span></span><span class="switch ${store.get('autoShare') ? 'on' : ''}"></span></div>`;
  $$('[data-del]', el).forEach((b) => b.onclick = () => { const c = store.get('contacts').slice(); c.splice(+b.dataset.del, 1); store.set('contacts', c); renderContacts(); });
  $('#cAdd', el).onclick = () => {
    const name = $('#cName', el).value.trim();
    const phone = $('#cPhone', el).value.trim();
    if (!name) { toast('Indiquez un prénom'); return; }
    store.set('contacts', [...store.get('contacts'), { name, phone }]);
    renderContacts();
  };
  $('#cAuto', el).onclick = () => { store.set('autoShare', !store.get('autoShare')); renderContacts(); };
}

// ---------------------------------------------------------------- Signalements
function openReport() {
  const types = Object.entries(REPORT_TYPES);
  openSheet('Signaler', `<div class="rep-grid">${types.map(([k, t]) => `<button class="rep" data-r="${k}"><span class="ri" style="background:${t.color}">${icon(t.icon, 28)}</span>${t.label}</button>`).join('')}</div>
    <p class="note">Votre signalement est visible par les autres conducteurs AZZ DRIVE à proximité pendant ${'quelques'} minutes à quelques heures selon le type.</p>`, (el) => {
    $$('[data-r]', el).forEach((b) => b.onclick = async () => {
      const c = S.disp.coord || S.pos?.coord;
      if (!c) { toast('Position inconnue'); return; }
      closeSheet();
      try {
        await reports.add(b.dataset.r, c, S.disp.heading, store.get('name'));
        toast(`Merci, ${REPORT_TYPES[b.dataset.r].label.toLowerCase()} signalé`);
      } catch { toast('Signalement non envoyé (hors ligne)'); }
    });
  });
}

reports.on((list) => {
  const seen = new Set();
  for (const r of list) {
    seen.add(r.id);
    if (markers.reports.has(r.id)) continue;
    const t = REPORT_TYPES[r.type];
    if (!t) continue;
    const el = document.createElement('button');
    el.className = 'rmk';
    el.style.background = t.color;
    el.innerHTML = icon(t.icon, 20);
    el.setAttribute('aria-label', t.label);
    el.onclick = (e) => { e.stopPropagation(); reportPopup(r); };
    markers.reports.set(r.id, new maplibregl.Marker({ element: el }).setLngLat(r.c).addTo(map));
  }
  for (const [id, m] of markers.reports) if (!seen.has(id)) { m.remove(); markers.reports.delete(id); }
});

function reportPopup(r) {
  const t = REPORT_TYPES[r.type];
  const mins = Math.max(1, Math.round((Date.now() - r.t) / 60000));
  openSheet(t.label, `<p class="note" style="font-size:15px;margin-top:0">Signalé il y a ${mins} min${r.by ? ' par ' + esc(r.by) : ''}.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn secondary" id="rpYes">Toujours là</button><button class="btn danger" id="rpNo">Plus là</button></div>`, (el) => {
    $('#rpYes', el).onclick = () => { closeSheet(); toast('Merci'); };
    $('#rpNo', el).onclick = () => { reports.remove(r.id); closeSheet(); toast('Signalement retiré'); };
  });
}

// ---------------------------------------------------------------- Garage (véhicule 3D)
function openGarage() {
  const car = { ...store.get('car') };
  openSheet('Ma voiture', `
    <div class="garage-view"><canvas id="gCanvas" aria-label="Aperçu 3D du véhicule"></canvas><div class="gv-name" id="gName">${esc(car.nick)}</div><div class="gv-hint">Glissez pour tourner</div></div>
    <div class="group-t" style="margin-top:4px">Modèle</div>
    <div class="models">${Object.entries(MODELS).map(([k, m]) => `<button class="model ${car.model === k ? 'on' : ''}" data-m="${k}"><b>${m.name}</b><span>${m.desc}</span></button>`).join('')}</div>
    <div class="group-t">Couleur</div>
    <div class="colors">${COLORS.map((c) => `<button class="sw ${car.color.toLowerCase() === c.hex ? 'on' : ''}" data-c="${c.hex}" style="background:${c.hex}" aria-label="${c.name}"></button>`).join('')}<label class="sw custom" aria-label="Couleur personnalisée"><input type="color" id="gColor" value="${esc(car.color)}"></label></div>
    <div class="group-t">Personnalisation</div>
    <div class="group" style="padding:14px;display:grid;gap:10px">
      <input class="field" id="gNick" maxlength="24" placeholder="Nom de la voiture" value="${esc(car.nick)}">
      <input class="field" id="gPlate" maxlength="10" placeholder="Plaque (ex. 1-ABC-234)" value="${esc(car.plate)}" style="text-transform:uppercase">
    </div>
    <button class="btn primary block" id="gSave">${icon('check', 20)}Enregistrer</button>`, (el) => {
    const canvas = $('#gCanvas', el);
    if (garage) garage.destroy();
    garage = new Garage(canvas);
    garage.setCar(car);
    garage.start();
    const refresh = () => garage.setCar(car);
    $$('[data-m]', el).forEach((b) => b.onclick = () => { car.model = b.dataset.m; $$('[data-m]', el).forEach((x) => x.classList.toggle('on', x === b)); refresh(); });
    $$('[data-c]', el).forEach((b) => b.onclick = () => { car.color = b.dataset.c; $$('.sw', el).forEach((x) => x.classList.toggle('on', x === b)); refresh(); });
    $('#gColor', el).oninput = (e) => { car.color = e.target.value; $$('.sw', el).forEach((x) => x.classList.remove('on')); e.target.parentElement.classList.add('on'); refresh(); };
    $('#gNick', el).oninput = (e) => { car.nick = e.target.value; $('#gName', el).textContent = car.nick; };
    let pt;
    $('#gPlate', el).oninput = (e) => { car.plate = e.target.value.toUpperCase(); clearTimeout(pt); pt = setTimeout(refresh, 300); };
    $('#gSave', el).onclick = () => {
      store.set('car', { ...car, nick: car.nick.trim() || 'Ma voiture', plate: (car.plate || 'AZZ-DRIVE').trim() });
      mapView.setCar(store.get('car'));
      closeSheet();
      toast('Voiture enregistrée');
      if (S.screen === 'explore') renderExplore();
    };
    setTimeout(() => garage.resize(), 50);
  }, () => { if (garage) { garage.destroy(); garage = null; } });
}

// ---------------------------------------------------------------- Réglages
function openSettings() {
  openSheet('Réglages', '<div id="setSheet"></div>', renderSettings);
}

function seg(id, options, value) {
  return `<div class="seg" id="${id}">${options.map(([v, l, ic]) => `<button data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${ic ? icon(ic, 16) : ''}${l}</button>`).join('')}</div>`;
}
function sw(id, on, title, sub) {
  return `<button class="row" id="${id}"><span class="rl"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</span><span class="switch ${on ? 'on' : ''}"></span></button>`;
}

function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

function installHTML() {
  if (isStandalone()) return '';
  if (isIOS()) return `<div class="installbar">${icon('download', 22)}<span>Installer sur l'iPhone : touchez <b>Partager</b> dans Safari puis <b>Sur l'écran d'accueil</b>. L'app s'ouvre ensuite en plein écran, comme Waze.</span></div>`;
  return `<div class="installbar">${icon('download', 22)}<span>Installer l'app : menu du navigateur puis <b>Installer AZZ DRIVE</b> (ou « Ajouter à l'écran d'accueil »).</span></div>`;
}

function renderSettings() {
  const el = $('#setSheet');
  if (!el) return;
  const sp = Spotify.state;
  el.innerHTML = `
    ${installHTML()}
    <div class="group-t">Profil</div>
    <div class="group" style="padding:14px"><input class="field" id="stName" maxlength="24" placeholder="Votre prénom (vu par vos proches)" value="${esc(store.get('name'))}"></div>
    <button class="row group" id="stGarage" style="margin-bottom:14px">${icon('car', 22)}<span class="rl"><b>${esc(store.get('car').nick)}</b><span>${esc(MODELS[store.get('car').model]?.name || '')} · ${esc(store.get('car').plate)}</span></span>${icon('chevron', 20)}</button>
    <div class="group-t">Carte</div>
    <div class="group" style="padding:12px">${seg('stStyle', [['auto', 'Auto', 'auto'], ['nuit', 'Nuit', 'moon'], ['jour', 'Jour', 'sun'], ['satellite', 'Satellite', 'globe']], store.get('mapStyle'))}</div>
    <div class="group-t">Navigation</div>
    <div class="group">
      ${sw('stVoice', store.get('voice'), 'Guidage vocal', 'Annonces en français')}
      ${sw('stLimits', store.get('showLimits'), 'Limitations de vitesse', 'Panneau et alerte en cas de dépassement')}
      <div class="row"><span class="rl"><b>Alerte au-delà de</b></span>${seg('stTol', [[0, '+0'], [5, '+5'], [10, '+10']], store.get('limitTolerance'))}</div>
      <div class="row"><span class="rl"><b>Caméra</b></span>${seg('stCam', [['chase', 'Poursuite'], ['overview', 'Ensemble']], store.get('camera'))}</div>
      <div class="row"><span class="rl"><b>Simulation</b><span>Vitesse du trajet simulé</span></span>${seg('stSim', [[1, '×1'], [2, '×2'], [4, '×4'], [8, '×8']], store.get('simSpeed'))}</div>
    </div>
    <div class="group-t">Itinéraire</div>
    <div class="group">
      ${sw('stTolls', store.get('avoidTolls'), 'Éviter les péages')}
      ${sw('stHw', store.get('avoidHighways'), 'Éviter les autoroutes')}
    </div>
    <div class="group-t">Proches et communauté</div>
    <div class="group">
      ${sw('stAuto', store.get('autoShare'), 'Prévenir mes proches au départ', 'Crée le lien de suivi automatiquement')}
      <button class="row" id="stContacts"><span class="rl"><b>Mes proches</b><span>${store.get('contacts').length} enregistré(s)</span></span>${icon('chevron', 20)}</button>
      ${sw('stReports', store.get('reportsEnabled'), 'Signalements', 'Police, accidents, dangers signalés par les conducteurs')}
    </div>
    <div class="group-t">Spotify</div>
    <div class="group">
      <div class="row"><span style="color:var(--green)">${icon('spotify', 26)}</span><span class="rl"><b>${sp.connected ? (sp.demo ? 'Mode démo' : 'Connecté') : 'Non connecté'}</b><span>${sp.connected ? (sp.device ? 'Appareil : ' + esc(sp.device) : 'Commandes disponibles pendant la navigation') : 'Musique sans quitter la carte'}</span></span>${sp.connected ? '<button class="chip" id="stSpOut">Déconnecter</button>' : '<button class="chip" id="stSpIn">Connecter</button>'}</div>
    </div>
    <div class="group-t">À propos</div>
    <div class="group" style="padding:14px">
      <p class="note" style="margin:0">Cartes © OpenStreetMap, OpenFreeMap, OpenMapTiles · Imagerie satellite © Esri · Itinéraires Valhalla (FOSSGIS) et OSRM · Adresses Photon (Komoot) · Temps réel par relais MQTT publics (${esc(live.url ? new URL(live.url).hostname : 'EMQX / HiveMQ')}).</p>
      <p class="note">Vos réglages restent sur cet appareil. Respectez toujours le code de la route : ne manipulez pas le téléphone en conduisant.</p>
    </div>
    <button class="btn secondary block" id="stReset">Réinitialiser l'application</button>`;
  $('#stName', el).onchange = (e) => store.set('name', e.target.value.trim());
  $('#stGarage', el).onclick = () => { closeSheet(); setTimeout(openGarage, 220); };
  $('#stContacts', el).onclick = () => { closeSheet(); setTimeout(openContacts, 220); };
  const bindSeg = (id, key, cast, after) => $$(`#${id} button`, el).forEach((b) => b.onclick = () => { store.set(key, cast(b.dataset.v)); $$(`#${id} button`, el).forEach((x) => x.classList.toggle('on', x === b)); after && after(); });
  bindSeg('stStyle', 'mapStyle', String, () => { applyStyle(); if (S.screen === 'explore') renderExplore(); });
  bindSeg('stTol', 'limitTolerance', Number);
  bindSeg('stCam', 'camera', String, () => { S.cam = store.get('camera'); });
  bindSeg('stSim', 'simSpeed', Number, () => { if (S.sim) S.sim.multiplier = store.get('simSpeed'); });
  const bindSw = (id, key, after) => { $('#' + id, el).onclick = () => { store.set(key, !store.get(key)); $('#' + id + ' .switch', el).classList.toggle('on', store.get(key)); after && after(); }; };
  bindSw('stVoice', 'voice', () => Voice.setEnabled(store.get('voice')));
  bindSw('stLimits', 'showLimits');
  bindSw('stTolls', 'avoidTolls');
  bindSw('stHw', 'avoidHighways');
  bindSw('stAuto', 'autoShare');
  bindSw('stReports', 'reportsEnabled');
  const spIn = $('#stSpIn', el); if (spIn) spIn.onclick = () => { closeSheet(); setTimeout(openMusic, 220); };
  const spOut = $('#stSpOut', el); if (spOut) spOut.onclick = () => { Spotify.logout(); renderSettings(); };
  $('#stReset', el).onclick = () => { if (confirmInline(el, 'Effacer tous les réglages, favoris et la voiture ?')) { store.reset(); Spotify.logout(); location.reload(); } };
}

function confirmInline(el, msg) {
  const b = $('#stReset', el);
  if (b.dataset.armed) return true;
  b.dataset.armed = '1';
  b.textContent = 'Touchez encore pour confirmer';
  b.classList.add('danger');
  setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Réinitialiser l\'application'; b.classList.remove('danger'); } }, 4000);
  return false;
}

// ---------------------------------------------------------------- Feuilles génériques
let sheetClose = null;
function openSheet(title, body, onMount, onClose) {
  closeSheet(true);
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.id = 'sheet';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sh-grab"></div><div class="sh-head"><h3>${esc(title)}</h3><button class="sh-close" aria-label="Fermer">${icon('x', 20)}</button></div><div class="sh-body">${body}</div></div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeSheet(); });
  $('.sh-close', wrap).onclick = () => closeSheet();
  sheetClose = onClose || null;
  onMount && onMount(wrap);
}
function closeSheet(immediate) {
  const w = $('#sheet');
  if (!w) return;
  const cb = sheetClose; sheetClose = null;
  w.id = '';
  w.classList.remove('show');
  setTimeout(() => w.remove(), immediate ? 0 : 220);
  cb && cb();
}

function copy(text, msg) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(msg)).catch(() => {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); toast(msg); } catch { toast('Copie impossible'); }
    t.remove();
  });
}

// ---------------------------------------------------------------- Première ouverture
function onboarding() {
  return new Promise((resolve) => {
    const car = { ...store.get('car') };
    let step = 0;
    const el = document.createElement('div');
    el.className = 'onb';
    document.body.appendChild(el);
    const render = () => {
      const dots = `<div class="dots">${[0, 1, 2].map((i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;
      if (step === 0) {
        el.innerHTML = `<div class="onb-card card"><div class="logo">${LOGO.replace('class="logo-mark"', 'style="color:var(--cyan);width:40px;height:34px"')}AZZ DRIVE</div>
          <h1>La route, en 3D.<br>Avec votre voiture.</h1>
          <p>Navigation GPS guidée en français, votre musique Spotify sur l'écran, et vos proches qui suivent votre arrivée en direct.</p>
          <div class="feat"><div>${icon('nav')}Guidage vocal, limitations, recalcul automatique</div><div>${icon('car')}Votre voiture en 3D : modèle, couleur, plaque</div><div>${icon('users')}Trajet partagé et signalements de la communauté</div></div>
          ${installHTML()}
          <button class="btn primary block" id="oNext">Commencer</button>${dots}</div>`;
      } else if (step === 1) {
        el.innerHTML = `<div class="onb-card card"><h1>Comment vous appelez-vous ?</h1><p>Votre prénom s'affiche chez vos proches quand vous partagez un trajet.</p>
          <input class="field" id="oName" placeholder="Votre prénom" maxlength="24" value="${esc(store.get('name'))}" style="height:54px;font-size:18px;margin-bottom:16px">
          <button class="btn primary block" id="oNext">Continuer</button>${dots}</div>`;
        setTimeout(() => $('#oName', el)?.focus(), 50);
      } else {
        el.innerHTML = `<div class="onb-card card"><h1 style="font-size:28px">Choisissez votre voiture</h1>
          <div class="garage-view" style="height:200px"><canvas id="oCanvas"></canvas></div>
          <div class="models" style="margin-bottom:12px">${Object.entries(MODELS).map(([k, m]) => `<button class="model ${car.model === k ? 'on' : ''}" data-m="${k}"><b>${m.name}</b><span>${m.desc}</span></button>`).join('')}</div>
          <div class="colors" style="margin-bottom:18px">${COLORS.slice(0, 8).map((c) => `<button class="sw ${car.color === c.hex ? 'on' : ''}" data-c="${c.hex}" style="background:${c.hex}" aria-label="${c.name}"></button>`).join('')}</div>
          <button class="btn primary block" id="oNext">${icon('locate', 20)}Activer la localisation et partir</button>${dots}</div>`;
        const g = new Garage($('#oCanvas', el));
        g.setCar(car); g.start();
        $$('[data-m]', el).forEach((b) => b.onclick = () => { car.model = b.dataset.m; $$('[data-m]', el).forEach((x) => x.classList.toggle('on', x === b)); g.setCar(car); });
        $$('[data-c]', el).forEach((b) => b.onclick = () => { car.color = b.dataset.c; $$('[data-c]', el).forEach((x) => x.classList.toggle('on', x === b)); g.setCar(car); });
        el._garage = g;
      }
      $('#oNext', el).onclick = () => {
        if (step === 1) store.set('name', $('#oName', el).value.trim());
        if (step === 2) {
          el._garage && el._garage.destroy();
          store.set('car', car);
          store.set('onboarded', true);
          el.remove();
          resolve(true);
          return;
        }
        step++; render();
      };
    };
    render();
  });
}

// ---------------------------------------------------------------- GPS
function startGPS(fly) {
  if (S.gps) { if (fly && S.pos) flyToPos(); return; }
  S.gps = new GPS((fix) => {
    const first = !S.pos;
    if (S.simulating) return;
    onFix(fix);
    if (first && S.screen === 'explore') flyToPos();
  }, (e) => {
    if (e.code === 1) toast('Localisation refusée : autorisez-la dans les réglages du téléphone', 4500);
    else toast('Position GPS indisponible pour le moment');
  });
  S.gps.start();
}

async function requestWakeLock() {
  try { if ('wakeLock' in navigator) S.wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
function releaseWakeLock() { try { S.wakeLock && S.wakeLock.release(); } catch {} S.wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.screen === 'drive') requestWakeLock(); });

// ---------------------------------------------------------------- Boucle d'animation (caméra + voiture)
function carPx() {
  const m = Math.min(innerWidth, innerHeight);
  return S.screen === 'drive' ? G.clamp(m * 0.36, 110, 300) : G.clamp(m * 0.2, 60, 160);
}

let lastFrame = performance.now(), lastHudAt = 0, camZoom = 17.6, camPitch = 60, camBearing = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (map && S.disp.coord) {
    const st = S.nav && S.nav.state;
    let targetHeading = S.disp.heading;
    const k = 1 - Math.exp(-dt * 6);
    if (st && st.onRoute && S.screen === 'drive') {
      const since = Math.min(1.2, (now - S.fixPerf) / 1000) * (S.simulating ? S.sim?.multiplier || 1 : 1);
      const target = Math.min(S.nav.route.length, st.along + (S.arrived ? 0 : S.speed * since));
      if (Math.abs(target - S.disp.along) > 120) S.disp.along = target;
      else S.disp.along += (target - S.disp.along) * k;
      S.disp.coord = G.pointAlong(S.nav.route.coords, S.nav.route.cum, S.disp.along).p;
      targetHeading = G.headingAhead(S.nav.route.coords, S.nav.route.cum, S.disp.along, 10);
    } else if (S.pos) {
      const since = Math.min(1.2, (now - S.fixPerf) / 1000);
      let tgt = S.pos.coord;
      if (S.speed > 1.5 && S.pos.heading != null) {
        const d = S.speed * since;
        const rad = (S.pos.heading * Math.PI) / 180;
        tgt = [tgt[0] + (Math.sin(rad) * d) / (111320 * Math.cos((tgt[1] * Math.PI) / 180)), tgt[1] + (Math.cos(rad) * d) / 110540];
      }
      if (G.dist(S.disp.coord, tgt) > 200) S.disp.coord = tgt.slice();
      else S.disp.coord = [G.lerp(S.disp.coord[0], tgt[0], k), G.lerp(S.disp.coord[1], tgt[1], k)];
      if (S.pos.heading != null && S.speed > 1) targetHeading = S.pos.heading;
    }
    const prevH = S.disp.heading;
    S.disp.heading = G.lerpAngle(S.disp.heading, targetHeading, 1 - Math.exp(-dt * 5));
    const turnRate = dt > 0 ? (G.angleDiff(prevH, S.disp.heading) * Math.PI / 180) / dt : 0;
    const anim = { speed: S.speed, turnRate, braking: S.braking };

    if (S.screen === 'drive' && S.follow && S.cam === 'chase') {
      const kmh = S.speed * 3.6;
      const zT = 18.4 - G.clamp((kmh - 20) / 100, 0, 1) * 1.5;
      const pT = 66;
      camZoom += (zT - camZoom) * (1 - Math.exp(-dt * 1.5));
      camPitch += (pT - camPitch) * (1 - Math.exp(-dt * 2));
      camBearing = G.lerpAngle(camBearing, S.disp.heading, 1 - Math.exp(-dt * 3.5));
      const land = document.body.classList.contains('land');
      const h = innerHeight;
      map.jumpTo({ center: S.disp.coord, zoom: camZoom, pitch: camPitch, bearing: camBearing, padding: { top: h * (land ? 0.42 : 0.3), bottom: land ? 0 : h * 0.14, left: 0, right: 0 } });
    } else if (S.screen === 'explore' && S.follow && S.pos) {
      camZoom += (16.6 - camZoom) * (1 - Math.exp(-dt * 1.2));
      camPitch += (58 - camPitch) * (1 - Math.exp(-dt * 1.5));
      if (S.speed > 2) camBearing = G.lerpAngle(camBearing, S.disp.heading, 1 - Math.exp(-dt * 2));
      if (!map.isMoving() || map._azzFollowing) {
        map._azzFollowing = true;
        map.jumpTo({ center: S.disp.coord, zoom: camZoom, pitch: camPitch, bearing: camBearing, padding: explorePadding() });
      }
    } else {
      camZoom = map.getZoom(); camPitch = map.getPitch(); camBearing = map.getBearing();
    }
    mapView.setCarPose(S.disp.coord, S.disp.heading, carPx(), anim);
  }
  if (now - lastHudAt > 250) { lastHudAt = now; updateHUD(); }
  if (S.screen === 'drive' && !S.follow && S.userMovedAt && Date.now() - S.userMovedAt > 12000) { S.follow = true; updateCamButton(); }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- Démarrage
async function boot() {
  layout();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  Voice.setEnabled(store.get('voice'));
  const styleParam = params.get('style');
  if (styleParam && ['nuit', 'jour', 'satellite', 'auto'].includes(styleParam)) store.data.mapStyle = styleParam;
  const lp = store.get('lastPos');
  mapView = new MapView($('#map'), { mode: resolveStyleMode(store.get('mapStyle')), center: lp || DEFAULT_CENTER, zoom: lp ? 15.5 : 13.5 });
  map = await mapView.ready;
  window.__azz = { S, map, mapView, store, share, reports, Spotify };
  mapView.setCar(store.get('car'));
  const userMove = (e) => {
    if (!e.originalEvent) return;
    map._azzFollowing = false;
    if (S.follow) { S.follow = false; updateCamButton(); }
    S.userMovedAt = Date.now();
  };
  map.on('dragstart', userMove); map.on('rotatestart', userMove); map.on('pitchstart', userMove);
  map.on('zoomstart', userMove);
  map.on('click', 'route-alt', (e) => { if (S.screen === 'preview' && e.features[0]) selectRoute(e.features[0].properties.id); });
  $('#splash').classList.add('out');
  setTimeout(() => $('#splash').remove(), 500);

  try { await Spotify.handleRedirect(); } catch (e) { console.warn(e); }
  if (Spotify.state.connected) Spotify.refresh();

  show('explore'); renderExplore();
  requestAnimationFrame(frame);
  setInterval(() => { if (S.screen === 'explore' && !document.querySelector('.sheet-wrap')) { const h2 = $('.ex-sheet h2'); if (h2) h2.innerHTML = greeting(); } if (store.get('mapStyle') === 'auto') { const m = resolveStyleMode('auto'); if (m !== mapView.mode) mapView.setMode(m); } store.save(); }, 60000);

  if (DEMO) return demo(DEMO);
  if (!store.get('onboarded')) await onboarding();
  startGPS(true);
}

// Mode démonstration (captures, essais sans GPS) : ?demo=drive | ?demo=preview | ?demo=explore
async function demo(kind) {
  store.data.onboarded = true;
  if (params.get('name')) store.data.name = params.get('name');
  if (params.get('car')) store.data.car = { ...store.data.car, model: params.get('car') };
  if (params.get('color')) store.data.car = { ...store.data.car, color: '#' + params.get('color') };
  mapView.setCar(store.data.car);
  const start = [4.41755, 51.21808];
  onFix({ coord: start, speed: 0, heading: 250, accuracy: 5, t: Date.now(), real: false });
  const openDemoSheet = () => { const s = params.get('sheet'); if (!s) return; if (s === 'music') openMusic(); if (s === 'trip') openShare(); if (s === 'garage') openGarage(); if (s === 'report') openReport(); if (s === 'settings') openSettings(); };
  if (kind === 'explore') { flyToPos(); openDemoSheet(); return; }
  const dest = { title: 'Grote Markt', subtitle: '2000 Anvers', coord: [4.40035, 51.22117] };
  await goPreview(dest);
  if (kind === 'preview') return;
  Spotify.startDemo();
  if (params.get('share') !== '0') share.startDemo();
  await startNav(true);
  renderTripCard();
  openDemoSheet();
}

boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<div class="card" style="position:fixed;left:16px;right:16px;top:40%;padding:20px;z-index:50">Erreur de démarrage : ${esc(e.message)}</div>`); });
