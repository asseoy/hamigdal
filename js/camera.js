// Third-person orbit camera: smooth follow, collision with the tower, speed FOV, wall-run tilt, landing shake.
import * as THREE from 'three';
import { G, clamp, damp, dampAng, save } from './ctx.js';
import { input } from './input.js';

export function createCamera() {
  const cam = G.camera;
  const C = { yaw: Math.PI, pitch: 0.2, dist: 4.7, curDist: 4.7, target: new THREE.Vector3(), shake: 0, roll: 0, fov: 70, tiltT: 0 };
  G.cam = C;
  // ---- automatic camera: always look along the course, so no mouse is needed ----
  const path = [];
  { const D = G.data, add = (x, y, z) => { const l = path[path.length - 1]; if (!l || Math.hypot(l.x - x, l.z - z) + Math.abs(l.y - y) > 0.6) path.push({ x, y, z }); };
    for (const fl of D.floors) {
      add(fl.x, fl.y, fl.z);
      for (const sg of D.segs) { if (sg.floor !== fl.floor) continue;
        for (const p of sg.way) { const top = p.y + p.h / 2;
          if (p.d > 3.2) { const ax = Math.sin(p.yaw), az = Math.cos(p.yaw), k = p.d / 2 - 0.5; add(p.x - ax * k, top, p.z - az * k); add(p.x + ax * k, top, p.z + az * k); } else add(p.x, top, p.z); }
        add(sg.end.x, sg.end.y, sg.end.z); }
    }
    add(D.summit.x, D.summit.y, D.summit.z); }
  let idx = 0, manualT = 0;
  const near = (lo, hi) => { const P = G.player.pos; let best = 1e9, bi = idx; for (let i = Math.max(0, lo); i < Math.min(path.length, hi); i++) { const q = path[i], d = Math.hypot(q.x - P.x, q.z - P.z) + Math.abs(q.y - P.y) * 2.5; if (d < best) { best = d; bi = i; } } return bi; };
  function autoYaw() {
    const P = G.player.pos; idx = near(idx - 12, idx + 14);
    let j = idx + 1; while (j < path.length - 1 && Math.hypot(path[j].x - P.x, path[j].z - P.z) < 5 && j < idx + 6) j++;
    const q = path[Math.min(j, path.length - 1)], dx = q.x - P.x, dz = q.z - P.z;
    if (Math.hypot(dx, dz) < 1) return null;
    return Math.atan2(dx, dz) + Math.PI;
  }
  C.snap = () => { const P = G.player; C.target.set(P.pos.x, P.pos.y + 1.45, P.pos.z); idx = near(0, path.length); const a = save.settings.autoCam !== false ? autoYaw() : null; C.yaw = a != null ? a : P.yaw + Math.PI; C.curDist = C.dist; manualT = 0; };

  C.update = (dt) => {
    const P = G.player, s = save.settings;
    const sens = 0.0024 * s.sens;
    C.yaw -= input.mx * sens; C.pitch += input.my * sens * (s.invert ? -1 : 1);
    C.pitch = clamp(C.pitch, -0.95, 1.2);
    C.dist = clamp(C.dist + input.wheel * 0.5, 2.8, 10);

    if (Math.abs(input.mx) + Math.abs(input.my) > 1) manualT = 2.5; else manualT = Math.max(0, manualT - dt);
    if (save.settings.autoCam !== false && manualT <= 0) {
      const a = autoYaw(); if (a != null) C.yaw = dampAng(C.yaw, a, P.state === 'wallrun' ? 1.2 : 2.4, dt);
      C.pitch = damp(C.pitch, 0.22, 2, dt);
    } else if (save.settings.autoCam !== false) idx = near(idx - 12, idx + 14);

    const ty = P.state === 'rope' ? P.pos.y + 1.2 : P.pos.y + 1.45;
    C.target.x = damp(C.target.x, P.pos.x, 18, dt); C.target.z = damp(C.target.z, P.pos.z, 18, dt);
    C.target.y = damp(C.target.y, ty, P.grounded ? 14 : 9, dt);

    const cp = Math.cos(C.pitch), dx = Math.sin(C.yaw) * cp, dy = Math.sin(C.pitch), dz = Math.cos(C.yaw) * cp;
    // pull in when something is between the runner and the camera
    const hit = G.world.ray(C.target.x, C.target.y, C.target.z, dx, dy, dz, C.dist + 0.3);
    const want = Math.max(1.2, Math.min(C.dist, hit - 0.35));
    C.curDist = want < C.curDist ? want : damp(C.curDist, want, 4, dt);

    cam.position.set(C.target.x + dx * C.curDist, C.target.y + dy * C.curDist, C.target.z + dz * C.curDist);
    if (cam.position.y < 0.3) cam.position.y = 0.3;
    cam.lookAt(C.target.x, C.target.y + 0.15, C.target.z);

    // feel: FOV with speed, roll on wall runs, shake on landings
    const sp = Math.hypot(P.vel.x, P.vel.y * 0.5, P.vel.z);
    C.fov = damp(C.fov, 68 + clamp((sp - 7) * 1.4, 0, 16), 5, dt);
    cam.fov = C.fov; cam.updateProjectionMatrix();
    let wantRoll = 0;
    if (P.state === 'wallrun') { const w = P.wr; const rx = Math.cos(C.yaw), rz = -Math.sin(C.yaw); wantRoll = -(w.nx * rx + w.nz * rz) * 0.09; }
    C.roll = damp(C.roll, wantRoll, 6, dt);
    C.shake = Math.max(0, C.shake - dt * 2.5);
    const sh = C.shake * C.shake;
    cam.rotateZ(C.roll + (Math.random() - 0.5) * sh * 0.04);
    cam.position.y += (Math.random() - 0.5) * sh * 0.12;
    const lines = document.getElementById('speedLines'); if (lines) lines.style.opacity = clamp((sp - 13) / 12, 0, 0.8).toFixed(2);
  };
  return C;
}
