// Améliorations graphiques avancées pour AZZ DRIVE.
// Qualité adaptative, FPS lissé, effets de vitesse et protection thermique.

const state = {
  applied: false,
  quality: 'high',
  fps: 60,
  samples: [],
  lastAdapt: 0,
  lowPower: false,
};

const QUALITY_CLASS = {
  ultra: 'gfx-ultra',
  high: 'gfx-high',
  medium: 'gfx-medium',
  low: 'gfx-low',
};

function isTouch() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function ensureVignette() {
  if (document.getElementById('azz-vignette')) return;
  const el = document.createElement('div');
  el.id = 'azz-vignette';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
}

function applyRendererEnhancements() {
  const canvas = document.querySelector('#map canvas');
  if (!canvas) return false;
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return false;
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  state.applied = true;
  return true;
}

function setQuality(next) {
  if (!QUALITY_CLASS[next] || state.quality === next) return;
  state.quality = next;
  document.body.classList.remove('gfx-ultra', 'gfx-high', 'gfx-medium', 'gfx-low');
  document.body.classList.add(QUALITY_CLASS[next]);
  window.__azzQuality = next;
  document.documentElement.style.setProperty('--azz-gfx', next);
}

function smoothFps(fps) {
  state.samples.push(fps);
  if (state.samples.length > 5) state.samples.shift();
  return state.samples.reduce((a, b) => a + b, 0) / state.samples.length;
}

function adaptQuality(now) {
  if (now - state.lastAdapt < 1500) return;
  state.lastAdapt = now;
  const fps = smoothFps(window.__azzFps || 60);
  state.fps = fps;

  if (state.lowPower || fps < 38) setQuality('low');
  else if (fps < 48) setQuality('medium');
  else if (fps < 56) setQuality('high');
  else if (!isTouch() && fps >= 60) setQuality('ultra');
  else setQuality('high');
}

function updateSpeedEffects() {
  const speed = Math.max(0, Number(window.__azzSpeed || 0));
  const boost = Math.min(speed / 130, 1);
  const strength = state.quality === 'low' ? 0.10 : state.quality === 'medium' ? 0.16 : 0.24;
  document.documentElement.style.setProperty('--azz-speed', boost.toFixed(3));
  document.documentElement.style.setProperty('--azz-vignette-strength', (strength * (0.65 + boost * 0.55)).toFixed(3));
}

function startLoop() {
  let frames = 0;
  let last = performance.now();
  function tick(now) {
    frames++;
    if (now - last >= 1000) {
      window.__azzFps = Math.round((frames * 1000) / (now - last));
      frames = 0;
      last = now;
      adaptQuality(now);
    }
    updateSpeedEffects();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function watchBattery() {
  if (!navigator.getBattery) return;
  try {
    const battery = await navigator.getBattery();
    const update = () => { state.lowPower = !battery.charging && battery.level < 0.20; };
    battery.addEventListener('levelchange', update);
    battery.addEventListener('chargingchange', update);
    update();
  } catch (_) {}
}

function init() {
  ensureVignette();
  setQuality(isTouch() ? 'high' : 'ultra');
  startLoop();
  watchBattery();
  const tryApply = () => {
    if (applyRendererEnhancements()) return;
    requestAnimationFrame(tryApply);
  };
  requestAnimationFrame(tryApply);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
