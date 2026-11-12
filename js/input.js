// Keyboard + mouse (pointer lock). Edge flags are cleared at end of each frame.
import { G } from './ctx.js';

export const input = { f: 0, s: 0, jump: false, jumpPressed: false, jumpReleased: false, slide: false, slidePressed: false,
  respawnPressed: false, mx: 0, my: 0, wheel: 0, locked: false, keys: {} };

export function initInput(canvas, onPause) {
  const k = input.keys;
  addEventListener('keydown', e => {
    if (e.repeat) return;
    k[e.code] = true;
    if (e.code === 'Space') { input.jumpPressed = true; e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') input.slidePressed = true;
    if (e.code === 'KeyR') input.respawnPressed = true;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (G.running) onPause(!G.paused); }
  });
  addEventListener('keyup', e => { k[e.code] = false; if (e.code === 'Space') input.jumpReleased = true; });
  addEventListener('blur', () => { for (const c in k) k[c] = false; if (G.running && !G.paused) onPause(true); });
  canvas.addEventListener('mousedown', () => { if (G.running && !G.paused && !input.locked) canvas.requestPointerLock && canvas.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked && G.running && !G.paused && !G.dev) onPause(true);
  });
  addEventListener('mousemove', e => { if (input.locked || G.dev) { input.mx += e.movementX || 0; input.my += e.movementY || 0; } });
  addEventListener('wheel', e => { input.wheel += Math.sign(e.deltaY); }, { passive: true });
}

export function pollInput() {
  const k = input.keys;
  if (!input.scripted) {
    input.f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    input.s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    input.jump = !!k.Space;
    input.slide = !!(k.ShiftLeft || k.ShiftRight || k.KeyC);
  }
}
export function endFrameInput() {
  input.jumpPressed = input.jumpReleased = input.slidePressed = input.respawnPressed = false;
  input.mx = input.my = input.wheel = 0;
}
