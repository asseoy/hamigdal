// Shared state and small helpers.
export const G = { dev: /[?&]dev/.test(location.search), t: 0, running: false, paused: false };

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth = t => t * t * (3 - 2 * t);
export const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const dampAng = (a, b, k, dt) => a + angDiff(a, b) * (1 - Math.exp(-k * dt));

export function rng(seed) {             // mulberry32
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.sign = () => r() < 0.5 ? -1 : 1;
  return r;
}

// ---------- persistent save ----------
const KEY = 'hamigdal.v1';
export const save = { maxFloor: 1, best: 0, settings: { sens: 1, sfx: 0.8, music: 0.45, quality: 2, invert: false } };
export function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); Object.assign(save, s); save.settings = Object.assign({ sens: 1, sfx: 0.8, music: 0.45, quality: 2, invert: false }, s.settings || {}); } catch (e) {}
  return save;
}
export function writeSave() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

// zones: by floor (1-based). 10 floors each.
export const ZONES = [
  { name: 'המחנה', color: '#7c9a52' },
  { name: 'המדבר', color: '#d39a4c' },
  { name: 'חנוכה', color: '#3f6fb5' },
  { name: 'הלילה', color: '#3a3550' },
  { name: 'השמיים', color: '#e6b8a8' },
];
export const FLOORS = 50;
export const zoneOf = f => Math.min(ZONES.length - 1, Math.floor((f - 1) / 10));
