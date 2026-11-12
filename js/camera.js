// Third-person orbit camera: smooth follow, collision with the tower, speed FOV, wall-run tilt, landing shake.
import * as THREE from 'three';
import { G, clamp, damp, dampAng, save } from './ctx.js';
import { input } from './input.js';

export function createCamera() {
  const cam = G.camera;
  const C = { yaw: Math.PI, pitch: 0.2, dist: 4.7, curDist: 4.7, target: new THREE.Vector3(), shake: 0, roll: 0, fov: 70, tiltT: 0 };
  G.cam = C;
  C.snap = () => { const P = G.player; C.target.set(P.pos.x, P.pos.y + 1.45, P.pos.z); C.yaw = P.yaw + Math.PI; C.curDist = C.dist; };

  C.update = (dt) => {
    const P = G.player, s = save.settings;
    const sens = 0.0024 * s.sens;
    C.yaw -= input.mx * sens; C.pitch += input.my * sens * (s.invert ? -1 : 1);
    C.pitch = clamp(C.pitch, -0.95, 1.2);
    C.dist = clamp(C.dist + input.wheel * 0.5, 2.8, 10);

    // gentle auto-follow behind the runner when moving and not touching the mouse
    if (Math.abs(input.mx) < 0.5 && P.speedH > 6 && (P.state === 'wallrun' || P.state === 'rope')) C.yaw = dampAng(C.yaw, P.yaw + Math.PI, 1.6, dt);

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
