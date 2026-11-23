// Icônes SVG (trait), style homogène.
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  settings: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  car: '<path d="M5 17h14M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0"/><path d="M3 17v-4.5l2-5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5l2 5V17"/><path d="M3.5 12.5h17"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  nav: '<path d="M12 2 4.5 20.3a.5.5 0 0 0 .7.6L12 17l6.8 3.9a.5.5 0 0 0 .7-.6Z"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5Z" fill="currentColor"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/>',
  next: '<path d="M5 4.5v15l11-7.5Z" fill="currentColor"/><rect x="17" y="4.5" width="2.5" height="15" rx="1" fill="currentColor"/>',
  prev: '<path d="M19 4.5v15L8 12Z" fill="currentColor"/><rect x="4.5" y="4.5" width="2.5" height="15" rx="1" fill="currentColor"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  locate: '<path d="M3 11 22 2l-9 19-2-8Z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="m22 9-6 6M16 9l6 6"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
  work: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.2A8 8 0 1 1 21 12Z"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  police: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Z"/><path d="m9 12 2 2 4-4"/>',
  crash: '<path d="M4 17h3l2-4 3 6 2-8 2 4h4"/><circle cx="12" cy="5" r="2"/>',
  traffic: '<rect x="7" y="2" width="10" height="20" rx="3"/><circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/>',
  works: '<path d="M2 20h20M5 20l4-12h6l4 12M7.5 13h9"/><path d="M12 3v5"/>',
  camera: '<rect x="2" y="7" width="15" height="11" rx="2"/><path d="m17 11 5-3v9l-5-3"/><circle cx="9.5" cy="12.5" r="2.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor"/>',
  route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H12"/>',
  sim: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z" fill="currentColor"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  spotify: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M7 9.5c3.5-1 7.5-.7 10.5 1M7.6 12.6c2.9-.8 6.1-.5 8.6.9M8.2 15.5c2.3-.6 4.7-.4 6.6.7" stroke="#0b0f14" stroke-width="1.6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  wifi: '<path d="M5 12.6a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/>',
};

export function icon(name, size = 22, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// Flèches de manœuvre épaisses (comme sur les écrans de voiture)
const M = {
  straight: '<path d="M24 42V10"/><path d="m13 20 11-11 11 11"/>',
  right: '<path d="M14 42V26a8 8 0 0 1 8-8h16"/><path d="m30 8 10 10-10 10"/>',
  'slight-right': '<path d="M18 42V28c0-5 2-8 6-11l10-8"/><path d="M24 8h11v11"/>',
  'sharp-right': '<path d="M14 8v18a8 8 0 0 0 8 8h14"/><path d="m28 24 10 10-10 10"/>',
  uturn: '<path d="M32 42V18a9 9 0 0 0-18 0v10"/><path d="m6 22 8 9 8-9"/>',
  roundabout: '<circle cx="24" cy="20" r="8"/><path d="M24 28v14"/><path d="M30 14l8-8"/><path d="M30 6h8v8"/>',
  'exit-right': '<path d="M16 42V8"/><path d="M16 26c0-6 4-10 10-12l8-3"/><path d="M28 6h7v7"/>',
  merge: '<path d="M24 42V24L12 10M24 24l12-14"/><path d="m18 20 6-6 6 6" opacity="0"/>',
  arrive: '<path d="M12 42V8"/><path d="M12 8h22l-5 7 5 7H12"/>',
  depart: '<path d="M24 42V10"/><path d="m13 20 11-11 11 11"/>',
  ferry: '<path d="M6 34c3 2 6 2 9 0s6-2 9 0 6 2 9 0 6-2 9 0"/><path d="M10 28 8 20h32l-2 8M16 20v-8h16v8"/>',
};
const MIRROR = { left: 'right', 'slight-left': 'slight-right', 'sharp-left': 'sharp-right', 'exit-left': 'exit-right' };

export function maneuverIcon(kind, size = 64) {
  const base = MIRROR[kind] || kind;
  const path = M[base] || M.straight;
  const flip = MIRROR[kind] ? ' transform="translate(48 0) scale(-1 1)"' : '';
  return `<svg class="mv" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g${flip}>${path}</g></svg>`;
}

export const REPORT_TYPES = {
  police: { label: 'Police', icon: 'police', color: '#3b82f6', ttl: 60 },
  accident: { label: 'Accident', icon: 'crash', color: '#ef4444', ttl: 90 },
  danger: { label: 'Danger', icon: 'alert', color: '#f59e0b', ttl: 60 },
  bouchon: { label: 'Bouchon', icon: 'traffic', color: '#f97316', ttl: 45 },
  travaux: { label: 'Travaux', icon: 'works', color: '#eab308', ttl: 480 },
  radar: { label: 'Radar', icon: 'camera', color: '#a855f7', ttl: 240 },
};
