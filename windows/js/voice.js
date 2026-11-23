// Guidage vocal en français (synthèse vocale du système). iOS exige un premier appel lors d'un geste.
let voice = null;
let unlocked = false;
let enabled = true;
let rate = 1;
let lastText = '', lastAt = 0;

function pickVoice() {
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const fr = vs.filter((v) => v.lang && v.lang.toLowerCase().startsWith('fr'));
  voice = fr.find((v) => /fr-BE/i.test(v.lang)) || fr.find((v) => /Amélie|Thomas|Audrey|Aurélie|Google français|Daniel/i.test(v.name)) || fr.find((v) => /fr-FR/i.test(v.lang)) || fr[0] || null;
}
if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export const Voice = {
  get enabled() { return enabled; },
  setEnabled(v) { enabled = v; if (!v && window.speechSynthesis) speechSynthesis.cancel(); },
  setRate(r) { rate = r; },
  unlock() {
    if (unlocked || !window.speechSynthesis) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); unlocked = true; } catch {}
  },
  say(text, { force = false, priority = false } = {}) {
    if (!window.speechSynthesis || (!enabled && !force) || !text) return;
    const now = Date.now();
    if (text === lastText && now - lastAt < 4000) return;
    lastText = text; lastAt = now;
    if (priority) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice ? voice.lang : 'fr-FR';
    if (voice) u.voice = voice;
    u.rate = rate; u.pitch = 1; u.volume = 1;
    speechSynthesis.speak(u);
  },
};
