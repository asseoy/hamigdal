// Boot, game flow (menu / play / pause / win), checkpoints, respawn, HUD and the frame loop.
import * as THREE from 'three';
import { G, clamp, lerp, save, loadSave, writeSave, ZONES, FLOORS, zoneOf } from './ctx.js';
import { initInput, pollInput, endFrameInput, input } from './input.js';
import { createPlayer } from './player.js';
import { createRig } from './rig.js';
import { createCamera } from './camera.js';
import { buildLevel } from './level.js';
import { createSky } from './sky.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';

const $ = id => document.getElementById(id);
const showErr = m => { const e = $('err'); e.classList.remove('hidden'); e.textContent += m + '\n'; };
addEventListener('error', e => showErr(e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno));
addEventListener('unhandledrejection', e => showErr('promise: ' + (e.reason && e.reason.message || e.reason)));
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const fmt = s => { const m = Math.floor(s / 60), r = s - m * 60; return String(m).padStart(2, '0') + ':' + r.toFixed(1).padStart(4, '0'); };

async function boot() {
  loadSave();
  const bar = $('loadBar'), prog = k => { bar.style.width = Math.round(k * 100) + '%'; };
  const canvas = $('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  G.renderer = renderer; G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
  prog(0.05);
  try { await Promise.all(['700 64px "Karantina"', '700 64px "Frank Ruhl Libre"', '500 40px "Frank Ruhl Libre"'].map(f => document.fonts.load(f))); } catch (e) {}
  const logo = await loadImg('assets/logo.webp');
  prog(0.15);
  await buildLevel(logo, prog);
  createPlayer();
  await createRig(logo);
  createCamera(); createSky(); createFx(); const audio = createAudio(); G.audio = audio;
  initInput(canvas, setPause);
  resize(); addEventListener('resize', resize);
  applyQuality();

  // ---------------- game state ----------------
  const L = G.level, P = G.player, floors = L.floors;
  const S = G.state = { cp: 1, time: 0, timing: false, fullRun: false, won: false, fade: 0, respawning: 0, hintT: 0 };
  $('floorMax').textContent = FLOORS;
  // height meter zones
  const mz = $('meterZones'); ZONES.forEach(z => { const d = document.createElement('div'); d.style.background = z.color; mz.appendChild(d); });

  function placeAt(f) {
    const fl = floors[f - 1];
    P.place(fl.x, fl.y + 0.02, fl.z, fl.h); P.grounded = true;
    const c = G.world.query(fl.x - 1, fl.y - 1, fl.z - 1, fl.x + 1, fl.y + 1, fl.z + 1).find(c => c.tags.cp === f); P.ground = c || null;
    G.rig.resetScarf(); G.cam.snap();
  }
  G.onCheckpoint = (f) => {
    if (!G.running || f <= S.cp) return;
    S.cp = f; if (f > save.maxFloor) { save.maxFloor = f; writeSave(); }
    const zoneStart = (f - 1) % 10 === 0;
    toast(zoneStart ? 'אזור ' + (zoneOf(f) + 1) : 'נקודת שמירה', zoneStart ? ZONES[zoneOf(f)].name : 'קומה ' + f, zoneStart ? 2600 : 1500);
    G.sfx(zoneStart ? 'zone' : 'checkpoint'); G.fx.bits(P.pos.x, P.pos.y, P.pos.z, zoneStart ? 60 : 26);
  };
  G.onSummit = () => {
    if (!G.running || S.won) return; S.won = true; S.timing = false;
    G.sfx('summit'); G.fx.bits(P.pos.x, P.pos.y, P.pos.z, 120);
    let txt = 'זמן: ' + fmt(S.time) + '.';
    if (S.fullRun) { if (!save.best || S.time < save.best) { txt += ' שיא חדש!'; save.best = S.time; } else txt += ' השיא שלך: ' + fmt(save.best) + '.'; }
    else txt += ' (התחלת מקומה ' + S.startFloor + ', לכן הזמן לא נכנס לשיא.)';
    save.maxFloor = FLOORS; writeSave();
    setTimeout(() => { $('winText').textContent = txt; show('win'); G.running = false; document.exitPointerLock && document.exitPointerLock(); }, 2200);
  };
  function respawn() {
    if (S.respawning) return; S.respawning = 1; G.sfx('respawn');
    $('fade').style.opacity = 1;
    setTimeout(() => { placeAt(S.cp); $('fade').style.opacity = 0; S.respawning = 0; }, 260);
  }
  G.respawn = respawn;

  let toastTimer = 0;
  function toast(over, text, ms) { $('toastOver').textContent = over; $('toastText').textContent = text; const t = $('toast'); t.classList.remove('hidden'); t.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = 0; }, ms); }
  function hint(text, ms = 5000) { const h = $('hint'); h.textContent = text; h.classList.remove('hidden'); clearTimeout(hint.t); hint.t = setTimeout(() => h.classList.add('hidden'), ms); }

  // ---------------- screens ----------------
  const screens = ['menu', 'floors', 'help', 'settings', 'pause', 'win', 'loading'];
  let backTo = 'menu';
  function show(id) { screens.forEach(s => $(s).classList.toggle('hidden', s !== id)); $('hud').classList.toggle('hidden', !!id); if (id === 'menu') refreshMenu(); }
  function refreshMenu() {
    $('btnContinue').disabled = save.maxFloor <= 1; $('contFloor').textContent = save.maxFloor;
    $('bestLine').textContent = (save.best ? 'השיא שלך: ' + fmt(save.best) + ' · ' : '') + (save.maxFloor > 1 ? 'הגעת עד קומה ' + save.maxFloor : '');
  }
  function start(f, full) {
    audio.start();
    S.cp = f; S.startFloor = f; S.time = 0; S.timing = true; S.fullRun = full; S.won = false;
    placeAt(f); G.running = true; G.paused = false; show(null);
    canvas.requestPointerLock && canvas.requestPointerLock();
    if (f === 1) hint('W A S D – תנועה · רווח – קפיצה (פעמיים = סלטה) · עכבר – מצלמה', 7000);
    toast(f === 1 ? 'שבט הנשיא' : 'קומה ' + f, f === 1 ? 'המגדל' : ZONES[zoneOf(f)].name, 2000);
  }
  function setPause(v) {
    if (!G.running) return;
    G.paused = v; if (v) { show('pause'); document.exitPointerLock && document.exitPointerLock(); } else { show(null); canvas.requestPointerLock && canvas.requestPointerLock(); }
  }
  $('btnPlay').onclick = () => start(1, true);
  $('btnContinue').onclick = () => start(save.maxFloor, false);
  $('btnFloors').onclick = () => {
    const g = $('floorGrid'); g.innerHTML = '';
    for (let f = 1; f <= FLOORS; f++) { const b = document.createElement('button'); b.textContent = f; b.className = 'z'; b.style.setProperty('--zc', ZONES[zoneOf(f)].color); b.disabled = f > save.maxFloor; b.onclick = () => start(f, f === 1); g.appendChild(b); }
    show('floors');
  };
  $('btnHelp').onclick = () => show('help');
  const openSettings = from => {
    backTo = from; const s = save.settings;
    $('sSens').value = s.sens; $('sSfx').value = s.sfx; $('sMusic').value = s.music; $('sQuality').value = s.quality; $('sInvert').checked = s.invert;
    show('settings');
  };
  $('btnSettings').onclick = () => openSettings('menu');
  $('btnPSettings').onclick = () => openSettings('pause');
  const onSet = () => { const s = save.settings; s.sens = +$('sSens').value; s.sfx = +$('sSfx').value; s.music = +$('sMusic').value; s.invert = $('sInvert').checked;
    const q = +$('sQuality').value; if (q !== s.quality) { s.quality = q; applyQuality(); } writeSave(); audio.volumes(); };
  ['sSens', 'sSfx', 'sMusic', 'sQuality', 'sInvert'].forEach(id => $(id).addEventListener('input', onSet));
  document.querySelectorAll('.back').forEach(b => b.onclick = () => show(b.closest('#settings') ? backTo : 'menu'));
  $('btnResume').onclick = () => setPause(false);
  $('btnRespawn').onclick = () => { setPause(false); respawn(); };
  $('btnQuit').onclick = () => { G.running = false; G.paused = false; show('menu'); };
  $('btnWinMenu').onclick = () => show('menu');

  placeAt(1);
  show('menu');

  // ---------------- loop ----------------
  let last = performance.now(), fpsAcc = 0, fpsN = 0, slow = 0, menuT = 0;
  const camMenu = new THREE.Vector3();
  function step(dt) {
    G.t += dt;
    if (G.bot) G.bot(dt);
    pollInput();
    if (G.running && !G.paused) {
      if (input.respawnPressed) respawn();
      const n = Math.max(1, Math.ceil(dt / (1 / 90))), sdt = dt / n;
      for (let i = 0; i < n; i++) {
        L.update(sdt);
        P.update(sdt);
        if (i === 0) { input.jumpPressed = false; input.slidePressed = false; }
        for (const e of P.ev) { G.fx.onEvent(e); const map = { land: 'land', jump: 'jump', longjump: 'jump', double: 'double', walljump: 'walljump', grab: 'grab', mantle: 'mantle', vault: 'vault', ropeGrab: 'ropeGrab', ropeRelease: 'ropeRelease', bounce: 'bounce', roll: 'roll', slide: 'slide' }; if (map[e.type]) G.sfx(map[e.type], e.impact || 1); }
      }
      if (S.timing) S.time += dt;
      if (P.pos.y < floors[S.cp - 1].y - 16 && !S.respawning) respawn();
      G.rig.update(dt);
      G.cam.update(dt);
    } else {
      L.update(dt); P.update(0); G.rig.update(dt);
      if (!G.running) {                                     // menu: slow orbit around the tower base
        menuT += dt * 0.06; const fl = floors[0];
        camMenu.set(Math.sin(menuT + 0.6) * 26, 9 + Math.sin(menuT * 0.7) * 3, Math.cos(menuT + 0.6) * 26);
        G.camera.position.copy(camMenu); G.camera.lookAt(fl.x * 0.4, 16, fl.z * 0.4); G.camera.fov = 62; G.camera.updateProjectionMatrix();
      }
    }
    G.fx.update(dt); G.sky.update(dt); audio.update(dt);
    // HUD
    if (G.running) {
      $('floorNum').textContent = S.cp; $('zoneName').textContent = ZONES[zoneOf(S.cp)].name; $('hudTime').textContent = fmt(S.time);
      $('meterMe').style.bottom = clamp(P.pos.y / G.data.top, 0, 1) * 100 + '%';
    }
    if (!G.noRender) renderer.render(G.scene, G.camera);
    endFrameInput();
  }
  G.step = step;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min(1 / 20, (now - last) / 1000)); last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 3) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (G.running && !G.paused && !G.dev && G.fps < 40 && save.settings.quality > 0) { if (++slow >= 2) { save.settings.quality--; applyQuality(); slow = 0; } } else slow = 0; }
    if (G.frozen) return;
    step(dt);
  }
  requestAnimationFrame(frame);
  G.ready = true; window.__ready = true;
  if (G.dev) window.__m = { G, input, start, placeAt, respawn, show };
}

function resize() {
  const w = innerWidth, h = innerHeight;
  G.renderer.setSize(w, h, false); G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
}
function applyQuality() {
  const q = save.settings.quality, dpr = devicePixelRatio || 1;
  G.renderer.setPixelRatio(q >= 2 ? Math.min(dpr, 2) : q === 1 ? Math.min(dpr, 1.5) : Math.min(dpr, 1));
  G.sky && G.sky.applyQuality(q);
  resize();
}
G.applyQuality = applyQuality;
boot();
