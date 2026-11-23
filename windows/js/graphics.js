// Améliorations graphiques progressives pour AZZ DRIVE.
// Ajoute une vignette cinématographique, surveille les performances et adapte la qualité.

const state = {
  applied: false,
  quality: 'high',
  lastAdapt: 0,
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
  state.applied = true;
  return true;
}

function adaptQuality(now) {
  if (now - state.lastAdapt < 2000) return;
  state.lastAdapt = now;
  const fps = window.__azzFps || 60;
  if (fps < 45 && state.quality !== 'low') {
    state.quality = 'low';
    document.body.classList.add('gfx-low');
  } else if (fps >= 55 && state.quality !== 'high') {
    state.quality = 'high';
    document.body.classList.remove('gfx-low');
  }
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
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function init() {
  ensureVignette();
  startLoop();
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
