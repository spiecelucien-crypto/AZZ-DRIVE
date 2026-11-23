// Spotify : connexion OAuth PKCE (sans serveur), titre en cours, commandes, playlists, recherche.
// Il faut un « Client ID » gratuit créé sur developer.spotify.com (voir Réglages > Spotify).
import { store } from './store.js';

const TOKEN_KEY = 'azzdrive.spotify';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative';

export function redirectUri() {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.pathname = u.pathname.replace(/index\.html$/, '');
  return u.toString();
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

class SpotifyClient {
  constructor() {
    this.tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    this.state = { connected: !!this.tokens, playing: false, track: null, error: null, device: null, demo: false };
    this.listeners = new Set();
    this.timer = null;
  }
  on(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit() { this.listeners.forEach((f) => f(this.state)); }
  get clientId() { return (store.get('spotifyClientId') || '').trim(); }
  get configured() { return !!this.clientId; }

  async login() {
    if (!this.clientId) throw new Error('Ajoutez d\'abord votre Client ID Spotify dans les réglages.');
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const st = b64url(crypto.getRandomValues(new Uint8Array(12)));
    sessionStorage.setItem('azz.sp.verifier', verifier);
    sessionStorage.setItem('azz.sp.state', st);
    localStorage.setItem('azz.sp.verifier', verifier);
    const u = new URL('https://accounts.spotify.com/authorize');
    u.search = new URLSearchParams({ client_id: this.clientId, response_type: 'code', redirect_uri: redirectUri(), code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state: st }).toString();
    location.href = u.toString();
  }

  // Appelé au démarrage : termine la connexion si on revient de Spotify
  async handleRedirect() {
    const q = new URLSearchParams(location.search);
    const code = q.get('code');
    if (!code && !q.get('error')) return false;
    history.replaceState(null, '', redirectUri());
    if (q.get('error')) { this.state.error = 'Connexion Spotify refusée'; this.emit(); return true; }
    const verifier = sessionStorage.getItem('azz.sp.verifier') || localStorage.getItem('azz.sp.verifier');
    const body = new URLSearchParams({ client_id: this.clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier || '' });
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const d = await r.json();
    if (!r.ok) { this.state.error = d.error_description || 'Échec de connexion Spotify'; this.emit(); return true; }
    this.saveTokens(d);
    this.state.connected = true; this.state.error = null; this.emit();
    return true;
  }

  saveTokens(d) {
    this.tokens = { access: d.access_token, refresh: d.refresh_token || this.tokens?.refresh, exp: Date.now() + (d.expires_in - 60) * 1000 };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(this.tokens));
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY); this.tokens = null;
    this.state = { ...this.state, connected: false, track: null, playing: false };
    this.emit();
  }

  async token() {
    if (!this.tokens) return null;
    if (Date.now() < this.tokens.exp) return this.tokens.access;
    const body = new URLSearchParams({ client_id: this.clientId, grant_type: 'refresh_token', refresh_token: this.tokens.refresh });
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!r.ok) { this.logout(); return null; }
    this.saveTokens(await r.json());
    return this.tokens.access;
  }

  async api(path, { method = 'GET', body } = {}) {
    const t = await this.token();
    if (!t) throw new Error('Spotify non connecté');
    const r = await fetch('https://api.spotify.com/v1' + path, { method, headers: { Authorization: 'Bearer ' + t, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 204 || r.status === 202) return null;
    if (r.status === 404) { const e = new Error('NO_DEVICE'); e.code = 404; throw e; }
    if (r.status === 403) { const e = new Error('Spotify Premium est nécessaire pour piloter la lecture.'); e.code = 403; throw e; }
    if (!r.ok) throw new Error('Spotify : erreur ' + r.status);
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }

  async refresh() {
    if (this.state.demo || !this.state.connected) return;
    try {
      const d = await this.api('/me/player?additional_types=track,episode');
      if (!d || !d.item) { this.state.track = null; this.state.playing = false; this.state.device = d?.device?.name || null; }
      else {
        const it = d.item;
        this.state.track = {
          title: it.name,
          artist: (it.artists || []).map((a) => a.name).join(', ') || it.show?.name || '',
          art: (it.album?.images || it.images || []).slice(-2)[0]?.url || null,
          duration: it.duration_ms, progress: d.progress_ms, at: Date.now(),
        };
        this.state.playing = !!d.is_playing;
        this.state.device = d.device?.name || null;
      }
      this.state.error = null;
    } catch (e) {
      if (e.code === 404) { this.state.track = null; this.state.playing = false; }
      else this.state.error = e.message;
    }
    this.emit();
  }

  startPolling() { this.stopPolling(); this.refresh(); this.timer = setInterval(() => { if (document.visibilityState === 'visible') this.refresh(); }, 5000); }
  stopPolling() { clearInterval(this.timer); this.timer = null; }

  async command(kind) {
    if (this.state.demo) return this.demoCommand(kind);
    try {
      if (kind === 'toggle') await this.api(this.state.playing ? '/me/player/pause' : '/me/player/play', { method: 'PUT' });
      if (kind === 'next') await this.api('/me/player/next', { method: 'POST' });
      if (kind === 'prev') await this.api('/me/player/previous', { method: 'POST' });
      if (kind === 'toggle') this.state.playing = !this.state.playing;
      this.emit();
      setTimeout(() => this.refresh(), 600);
    } catch (e) {
      throw e.code === 404 ? new Error('Ouvrez Spotify sur ce téléphone et lancez un titre, puis réessayez.') : e;
    }
  }

  async playlists() {
    const d = await this.api('/me/playlists?limit=30');
    return (d?.items || []).filter(Boolean).map((p) => ({ name: p.name, uri: p.uri, art: p.images?.[0]?.url || null, count: p.items?.total ?? p.tracks?.total ?? null }));
  }

  async search(q) {
    const d = await this.api('/search?type=track,playlist&limit=6&q=' + encodeURIComponent(q));
    const tracks = (d?.tracks?.items || []).filter(Boolean).map((t) => ({ kind: 'track', name: t.name, sub: t.artists.map((a) => a.name).join(', '), uri: t.uri, art: t.album?.images?.slice(-1)[0]?.url }));
    const pls = (d?.playlists?.items || []).filter(Boolean).map((p) => ({ kind: 'playlist', name: p.name, sub: 'Playlist', uri: p.uri, art: p.images?.[0]?.url }));
    return [...tracks, ...pls];
  }

  async play(uri) {
    const body = uri.includes(':track:') ? { uris: [uri] } : { context_uri: uri };
    try { await this.api('/me/player/play', { method: 'PUT', body }); }
    catch (e) { throw e.code === 404 ? new Error('Ouvrez Spotify sur ce téléphone, puis réessayez.') : e; }
    setTimeout(() => this.refresh(), 700);
  }

  // Mode démonstration (aucun compte) : interface remplie, sans lecture réelle
  startDemo() {
    this.state = { ...this.state, demo: true, connected: true, playing: true, track: { title: 'Nuit sur l\'E19', artist: 'AZZ Radio', art: null, duration: 214000, progress: 64000, at: Date.now() } };
    this.emit();
  }
  demoCommand(kind) {
    const list = [['Nuit sur l\'E19', 'AZZ Radio'], ['Ring d\'Anvers', 'Les Feux Arrière'], ['Pluie sur Mons', 'Clio & Co'], ['Retour à la maison', 'AZZ Radio']];
    if (kind === 'toggle') this.state.playing = !this.state.playing;
    else {
      const i = list.findIndex((x) => x[0] === this.state.track.title);
      const n = (i + (kind === 'next' ? 1 : list.length - 1)) % list.length;
      this.state.track = { ...this.state.track, title: list[n][0], artist: list[n][1], progress: 0, at: Date.now() };
    }
    this.emit();
  }
}

export const Spotify = new SpotifyClient();
