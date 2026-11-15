// Phone / tablet controls. Nothing here runs until a real touch happens (or ?touch in the URL),
// so mouse + keyboard play is untouched. Left: floating joystick. Right: drag to turn the camera,
// קפיצה (= Space), החלקה (= Shift), pause and back-to-checkpoint.
import { G } from './ctx.js';

const T = { on: false, f: 0, s: 0, jump: false, slide: false };
const roles = new Map();            // touch identifier -> { kind, x, y, el }
let ui, base, knob, home = { x: 0, y: 0 }, shown = false, onPauseCb = null, inputRef = null, onActivate = [];
const JR = 52, DEAD = 0.12, LOOK = 2.4;

export const touch = T;
export const onTouchActivate = fn => { if (T.on) fn(); else onActivate.push(fn); };

export function initTouch(input, onPause) {
  inputRef = input; onPauseCb = onPause;
  if (/[?&]touch/.test(location.search)) activate();
  const first = () => activate();
  addEventListener('touchstart', first, { capture: true, passive: true });
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') activate(); }, { capture: true, passive: true });
  // iOS only lets audio start inside touchend / click
  const unlock = () => { if (G.audio) G.audio.start(); removeEventListener('touchend', unlock, true); };
  addEventListener('touchend', unlock, { capture: true, passive: true });
}

function activate() {
  if (T.on) return;
  T.on = true; G.touch = true;
  document.body.classList.add('touch');
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  build();
  // no pinch / double-tap zoom on the game surface (menus keep normal behaviour)
  const blockGesture = e => { if (e.target === G.renderer?.domElement || ui.contains(e.target)) e.preventDefault(); };
  document.addEventListener('gesturestart', blockGesture, { passive: false });
  document.addEventListener('dblclick', blockGesture, { passive: false });
  onActivate.forEach(fn => fn()); onActivate = [];
}

function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; parent.appendChild(e); return e; }

function build() {
  ui = el('div', 'hidden', document.body); ui.id = 'touchUI';
  base = el('div', 'tStick', ui); knob = el('i', '', base);
  el('div', 'tBtn tJump', ui, '<b>קפיצה</b>').dataset.b = 'jump';
  el('div', 'tBtn tSlide', ui, '<b>החלקה</b>').dataset.b = 'slide';
  el('div', 'tBtn tPause', ui, '<i></i><i></i>').dataset.b = 'pause';
  el('div', 'tBtn tBack', ui, '<b>לשמירה</b>').dataset.b = 'respawn';
  ui.addEventListener('touchstart', onStart, { passive: false });
  ui.addEventListener('touchmove', onMove, { passive: false });
  ui.addEventListener('touchend', onEnd, { passive: false });
  ui.addEventListener('touchcancel', onEnd, { passive: false });
  ui.addEventListener('contextmenu', e => e.preventDefault());
}

function stickHome() {
  const r = base.getBoundingClientRect();
  base.style.transform = ''; knob.style.transform = '';
  home.x = r.left + r.width / 2; home.y = r.top + r.height / 2;
}

function press(b, down, el) {
  const I = inputRef;
  if (b === 'jump') { T.jump = down; if (down) I.jumpPressed = true; else I.jumpReleased = true; }
  else if (b === 'slide') { T.slide = down; if (down) I.slidePressed = true; }
  else if (b === 'pause' && down) onPauseCb && onPauseCb(true);
  else if (b === 'respawn' && down) I.respawnPressed = true;
  el && el.classList.toggle('on', down);
}

function onStart(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const btn = t.target.closest && t.target.closest('[data-b]');
    if (btn) { roles.set(t.identifier, { kind: 'btn', b: btn.dataset.b, el: btn }); press(btn.dataset.b, true, btn); continue; }
    const used = k => [...roles.values()].some(r => r.kind === k);
    if (t.clientX < innerWidth * 0.45 && !used('stick')) {
      stickHome();
      // the stick jumps to where the thumb lands (kept on screen)
      const half = base.offsetWidth / 2;
      const cx = Math.max(half + 6, Math.min(innerWidth * 0.45 - half, t.clientX)), cy = Math.max(half + 70, Math.min(innerHeight - half - 6, t.clientY));
      base.style.transform = `translate(${cx - home.x}px,${cy - home.y}px)`; base.classList.add('on');
      roles.set(t.identifier, { kind: 'stick', cx, cy });
      stickMove(roles.get(t.identifier), t.clientX, t.clientY);
    } else if (t.clientX >= innerWidth * 0.45 && !used('look')) {
      roles.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
    }
  }
}
function stickMove(r, x, y) {
  let dx = x - r.cx, dy = y - r.cy; const d = Math.hypot(dx, dy);
  const k = d > JR ? JR / d : 1; dx *= k; dy *= k;
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  let v = Math.min(1, d / JR); v = v < DEAD ? 0 : (v - DEAD) / (1 - DEAD);
  T.s = d > 0 ? (x - r.cx) / d * v : 0; T.f = d > 0 ? -(y - r.cy) / d * v : 0;
}
function onMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const r = roles.get(t.identifier); if (!r) continue;
    if (r.kind === 'stick') stickMove(r, t.clientX, t.clientY);
    else if (r.kind === 'look') { inputRef.mx += (t.clientX - r.x) * LOOK; inputRef.my += (t.clientY - r.y) * LOOK; r.x = t.clientX; r.y = t.clientY; }
  }
}
function release(id) {
  const r = roles.get(id); if (!r) return; roles.delete(id);
  if (r.kind === 'btn') press(r.b, false, r.el);
  else if (r.kind === 'stick') { T.f = T.s = 0; base.classList.remove('on'); base.style.transform = ''; knob.style.transform = ''; }
}
function onEnd(e) { e.preventDefault(); for (const t of e.changedTouches) release(t.identifier); }

// called every frame from pollInput (only when touch is active)
export function pollTouch(input) {
  const want = G.running && !G.paused && !document.getElementById('hud').classList.contains('hidden');
  if (want !== shown) { shown = want; ui.classList.toggle('hidden', !want); if (!want) for (const id of [...roles.keys()]) release(id); }
  if (!shown) return;
  if (!input.f && !input.s) { input.f = T.f; input.s = T.s; }
  input.jump = input.jump || T.jump;
  input.slide = input.slide || T.slide;
}
