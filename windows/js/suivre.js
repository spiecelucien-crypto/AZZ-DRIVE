// Page « Suivre le trajet » : ce que voient les proches (sans installation ni compte).
import { MapView, resolveStyleMode, maplibregl } from './map.js';
import { live, ROOT } from './live.js';
import * as G from './geo.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const id = new URLSearchParams(location.search).get('t');
const VKEY = 'azzdrive.viewer';
const me = JSON.parse(localStorage.getItem(VKEY) || 'null') || { id: G.uid(10), name: '' };

let info = null, pos = null, mapView, map, follow = true, route = null, destMarker = null;
const disp = { coord: null, heading: 0 };
let posAt = 0;

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function initials(n) { return (n || '?').trim().split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase(); }

function setLive(state) {
  const el = $('#vLive');
  const map = { live: ['var(--live)', 'En direct'], wait: ['var(--orange)', 'En attente de position'], off: ['var(--faint)', 'Connexion…'], end: ['var(--faint)', 'Trajet terminé'], lost: ['var(--orange)', 'Signal faible'] };
  const [c, t] = map[state] || map.off;
  el.innerHTML = `<span class="pill-dot" style="background:${c};${state === 'live' ? '' : 'box-shadow:none'}"></span>${t}`;
}

function render() {
  const p = $('#vPanel');
  if (!id) { p.innerHTML = `<div class="v-end"><h3>Lien incomplet</h3><p class="muted">Demandez à votre proche de vous renvoyer le lien de suivi.</p></div>`; setLive('end'); return; }
  if (!info) { p.innerHTML = `<div class="v-end"><h3>Recherche du trajet…</h3><p class="muted">Si rien n'apparaît, le trajet est peut-être déjà terminé.</p></div>`; return; }
  const ended = info.status && info.status !== 'en route';
  const name = esc(info.name);
  if (ended) {
    p.innerHTML = `<div class="v-end"><h3>${info.status === 'arrivé' ? `${name} est bien arrivé` : `${name} a terminé le partage`}</h3><p class="muted">${info.dest ? esc(info.dest.title) + ' · ' : ''}${G.fmtClock(new Date(pos?.t || Date.now()))}</p></div>`;
    setLive('end');
    return;
  }
  const remT = pos?.remT ?? null;
  const eta = pos?.eta ? new Date(pos.eta) : remT != null ? new Date(Date.now() + remT * 1000) : null;
  p.innerHTML = `
    <div class="v-who"><span class="av" style="background:#e07a5f">${esc(initials(info.name))}</span><div><b>${name} est en route</b><span>${info.dest ? 'vers ' + esc(info.dest.title) : 'trajet en cours'}</span></div></div>
    <div class="v-stats num">
      <div class="eta"><b>${eta ? G.fmtClock(eta) : '–'}</b><span>Arrivée</span></div>
      <div><b>${remT != null ? G.fmtDuration(remT) : '–'}</b><span>Restant</span></div>
      <div><b>${pos?.rem != null ? G.fmtDistance(pos.rem) : '–'}</b><span>${pos?.v != null ? pos.v + ' km/h' : 'Distance'}</span></div>
    </div>
    <div class="v-react">
      ${['Bonne route', 'Fais attention', 'Je t\'attends', 'Prends ton temps', 'Appelle-moi'].map((t) => `<button class="chip" data-r="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>
    <p class="muted" style="font-size:13px;margin:10px 0 0">Votre message est lu à voix haute dans la voiture.</p>`;
  p.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => react(b.dataset.r));
}

async function react(text) {
  try {
    await live.publish(`${ROOT}/trip/${id}/react`, { id: me.id, name: me.name || 'Un proche', text, t: Date.now() });
    toast('Message envoyé');
  } catch { toast('Envoi impossible, réessayez'); }
}

function setRoute() {
  if (!info?.route) return;
  const coords = G.decodePolyline(info.route, 5);
  route = { id: 'shared', coords, cum: G.cumulative(coords) };
  mapView.setRoutes([route], 'shared');
  if (info.dest && !destMarker) {
    const el = document.createElement('div');
    el.innerHTML = `<svg width="40" height="52" viewBox="0 0 40 52"><path d="M20 51s17-15.6 17-30A17 17 0 0 0 3 21c0 14.4 17 30 17 30Z" fill="#27d7e8" stroke="#05323c" stroke-width="2"/><path d="M14 30V12M14 12h12l-3 4 3 4H14" fill="none" stroke="#04161a" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    destMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(info.dest.coord).addTo(map);
  }
}

function overview() {
  const pts = [];
  if (disp.coord) pts.push(disp.coord);
  if (info?.dest) pts.push(info.dest.coord);
  if (route && !disp.coord) pts.push(...route.coords);
  if (!pts.length) return;
  const wide = innerWidth >= 900;
  if (pts.length === 1) { map.easeTo({ center: pts[0], zoom: 15.5, pitch: 55 }); return; }
  map.fitBounds(G.bbox(pts), { padding: wide ? { left: 470, right: 80, top: 100, bottom: 80 } : { top: 110, bottom: 300, left: 50, right: 50 }, pitch: 45, maxZoom: 16, duration: 900 });
}

function askName() {
  return new Promise((res) => {
    if (me.name) return res();
    const el = document.createElement('div');
    el.className = 'v-ask';
    el.innerHTML = `<div class="card"><h2>Qui suit le trajet ?</h2><p>Votre prénom s'affiche dans la voiture pour dire que vous suivez.</p><input class="field" id="vName" placeholder="Votre prénom" maxlength="24" autocomplete="given-name"><button class="btn primary block" id="vOk">Suivre le trajet</button></div>`;
    document.body.appendChild(el);
    const go = () => { me.name = el.querySelector('#vName').value.trim() || 'Un proche'; localStorage.setItem(VKEY, JSON.stringify(me)); el.remove(); res(); };
    el.querySelector('#vOk').onclick = go;
    el.querySelector('#vName').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
}

function heartbeat() {
  if (!id || (info && info.status && info.status !== 'en route')) return;
  live.publish(`${ROOT}/trip/${id}/viewer/${me.id}`, { id: me.id, name: me.name, t: Date.now() }).catch(() => {});
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (pos && pos.c) {
    let tgt = pos.c;
    const since = Math.min(3, (Date.now() - pos.t) / 1000);
    const v = (pos.v || 0) / 3.6;
    if (v > 1 && since > 0) {
      const d = v * since, rad = (pos.h * Math.PI) / 180;
      tgt = [tgt[0] + (Math.sin(rad) * d) / (111320 * Math.cos((tgt[1] * Math.PI) / 180)), tgt[1] + (Math.cos(rad) * d) / 110540];
    }
    if (!disp.coord || G.dist(disp.coord, tgt) > 300) disp.coord = tgt.slice();
    const k = 1 - Math.exp(-dt * 4);
    disp.coord = [G.lerp(disp.coord[0], tgt[0], k), G.lerp(disp.coord[1], tgt[1], k)];
    disp.heading = G.lerpAngle(disp.heading, pos.h || 0, k);
    const m = Math.min(innerWidth, innerHeight);
    mapView.setCarPose(disp.coord, disp.heading, G.clamp(m * 0.16, 56, 120), { speed: v, turnRate: 0, braking: v < 0.5 });
    if (follow) map.jumpTo({ center: disp.coord, padding: innerWidth >= 900 ? { left: 440, top: 0, right: 0, bottom: 0 } : { top: 0, bottom: 260, left: 0, right: 0 } });
    if (route) {
      const s = G.snapToLine(disp.coord, route.coords, route.cum);
      if (s.d < 80) mapView.setProgress(s.along / route.cum[route.cum.length - 1]);
    }
  }
  if (pos && info?.status === 'en route' && Date.now() - pos.t > 45000) setLive('lost');
  requestAnimationFrame(frame);
}

async function boot() {
  mapView = new MapView($('#map'), { mode: resolveStyleMode('auto'), center: [4.4025, 51.2194], zoom: 12 });
  map = await mapView.ready;
  map.on('dragstart', (e) => { if (e.originalEvent) follow = false; });
  render();
  if (!id) return;
  await askName();
  live.subscribe(`${ROOT}/trip/${id}/info`, (t, d) => {
    if (!d) return;
    const first = !info;
    info = d;
    if (d.car) mapView.setCar({ ...d.car });
    setRoute();
    if (first) { setTimeout(overview, 300); setLive(pos ? 'live' : 'wait'); }
    render();
  });
  live.subscribe(`${ROOT}/trip/${id}/pos`, (t, d) => {
    if (!d) return;
    if (d.status && d.status !== 'en route' && info) { info.status = d.status; render(); return; }
    if (!d.c) return;
    const first = !pos;
    pos = d; posAt = Date.now();
    if (info?.status === 'en route') setLive(Date.now() - d.t > 45000 ? 'lost' : 'live');
    if (first && info) { disp.coord = d.c.slice(); disp.heading = d.h || 0; follow = false; overview(); setTimeout(() => { follow = true; }, 2500); }
    render();
  });
  live.onStatus((s) => { if (s === 'indisponible') toast('Connexion temps réel impossible, vérifiez le réseau'); });
  heartbeat();
  setInterval(heartbeat, 25000);
  setInterval(render, 30000);
  setTimeout(() => { if (!info) render(); }, 6000);
  requestAnimationFrame(frame);
}

boot().catch((e) => { console.error(e); $('#vPanel').innerHTML = `<div class="v-end"><h3>Erreur</h3><p class="muted">${esc(e.message)}</p></div>`; });
