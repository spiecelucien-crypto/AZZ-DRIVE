// Temps réel sans compte : relais MQTT publics (EMQX, HiveMQ, Mosquitto) via WebSocket sécurisé.
// Sert au partage de trajet avec les proches et aux signalements de la communauté.
import mqttMod from '../vendor/mqtt.esm.js';

const mqtt = mqttMod.connect ? mqttMod : (mqttMod.default || mqttMod);
export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
export const ROOT = 'azzdrive/v1';

class Live {
  constructor() {
    this.client = null;
    this.handlers = new Map(); // filtre -> Set(fn)
    this.connecting = null;
    this.status = 'off';
    this.statusListeners = new Set();
  }
  onStatus(f) { this.statusListeners.add(f); f(this.status); return () => this.statusListeners.delete(f); }
  setStatus(s) { this.status = s; this.statusListeners.forEach((f) => f(s)); }

  connect() {
    if (this.client && this.client.connected) return Promise.resolve(this.client);
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      for (const url of BROKERS) {
        try {
          const c = await new Promise((res, rej) => {
            const cl = mqtt.connect(url, { clientId: 'azz_' + Math.random().toString(36).slice(2, 12), connectTimeout: 7000, reconnectPeriod: 3000, keepalive: 30, clean: true });
            const to = setTimeout(() => { cl.end(true); rej(new Error('timeout')); }, 8000);
            cl.once('connect', () => { clearTimeout(to); res(cl); });
            cl.once('error', (e) => { clearTimeout(to); cl.end(true); rej(e); });
          });
          this.client = c;
          this.url = url;
          c.on('message', (topic, payload) => this.dispatch(topic, payload));
          c.on('reconnect', () => this.setStatus('reconnexion'));
          c.on('offline', () => this.setStatus('hors ligne'));
          c.on('connect', () => { this.setStatus('connecté'); for (const f of this.handlers.keys()) c.subscribe(f, { qos: 0 }); });
          this.setStatus('connecté');
          for (const f of this.handlers.keys()) c.subscribe(f, { qos: 0 });
          return c;
        } catch (e) { console.warn('relais', url, e && e.message); }
      }
      this.setStatus('indisponible');
      throw new Error('Aucun relais temps réel joignable');
    })().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  dispatch(topic, payload) {
    let data = null;
    const txt = payload.toString();
    if (txt) { try { data = JSON.parse(txt); } catch { return; } }
    for (const [filter, set] of this.handlers) {
      if (match(filter, topic)) set.forEach((fn) => fn(topic, data));
    }
  }

  async subscribe(filter, fn) {
    if (!this.handlers.has(filter)) this.handlers.set(filter, new Set());
    this.handlers.get(filter).add(fn);
    try { const c = await this.connect(); c.subscribe(filter, { qos: 0 }); } catch {}
    return () => {
      const s = this.handlers.get(filter);
      if (!s) return;
      s.delete(fn);
      if (!s.size) { this.handlers.delete(filter); if (this.client) this.client.unsubscribe(filter); }
    };
  }

  async publish(topic, data, { retain = false } = {}) {
    const c = await this.connect();
    c.publish(topic, data == null ? '' : JSON.stringify(data), { qos: 0, retain });
  }
}

function match(filter, topic) {
  const f = filter.split('/'), t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (f[i] === '+') { if (t[i] == null) return false; continue; }
    if (f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

export const live = new Live();
