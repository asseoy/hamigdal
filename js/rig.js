// The runner: a tribe kid in the blue movement shirt with the tribe scarf, fully procedural animation.
// Pose = flat set of joint angles; each frame a target pose is built from the controller state and the
// current pose chases it (fast), with flips/rolls/twirls layered on as whole-body rotations.
import * as THREE from 'three';
import { G, clamp, lerp, damp, smooth, angDiff } from './ctx.js';

const KEYS = ['py', 'pp', 'pr', 'pyaw', 'sp', 'sr', 'sy', 'hp', 'hy',
  'lsx', 'lsy', 'lsz', 'lel', 'rsx', 'rsy', 'rsz', 'rel', 'lhx', 'lhz', 'lkn', 'lan', 'rhx', 'rhz', 'rkn', 'ran', 'bank', 'tilt'];
const zero = () => { const o = {}; for (const k of KEYS) o[k] = 0; return o; };

function stripeTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#a8121b'; g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#111'; for (let y = 0; y < 256; y += 64) g.fillRect(0, y + 24, 64, 16);
  g.fillStyle = '#f3e03b'; g.fillRect(0, 0, 5, 256); g.fillRect(59, 0, 5, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export async function createRig(logoImg) {
  const S = G.scene;
  const M = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough }, extra));
  const shirt = M(0x3d6496, 0.85), pants = M(0x4d4a3a, 0.9), skin = M(0xd29f7a, 0.6), hair = M(0x2a1b12, 0.9);
  const shoe = M(0xf1efeb, 0.6), sole = M(0x2a2a2a, 0.9), dark = M(0x151515, 0.5);
  const cap = (r, l, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 12), mat); m.castShadow = true; return m; };
  const J = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

  const root = new THREE.Group(); S.add(root);
  const bank = J(root, 0, 1.0, 0), flip = J(bank), body = J(flip, 0, -1.0, 0);
  const pelvis = J(body, 0, 0.95, 0);
  const hipMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), pants); hipMesh.scale.set(1.05, 0.75, 0.78); hipMesh.castShadow = true; pelvis.add(hipMesh);
  const spine = J(pelvis, 0, 0.1, 0);
  const torso = cap(0.165, 0.2, shirt); torso.scale.set(1.12, 1, 0.74); torso.position.y = 0.2; spine.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.172, 0.05, 16), dark); belt.scale.set(1.08, 1, 0.78); belt.position.y = 0.0; spine.add(belt);
  const chest = J(spine, 0, 0.24, 0);
  // shirt pocket flaps (movement shirt look)
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.012), M(0x355a88, 0.9)); p.position.set(s * 0.08, 0.02, 0.118); p.rotation.x = -0.12; chest.add(p); });
  // tribe logo on the back
  if (logoImg) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const w = 112, h = w * logoImg.height / logoImg.width; g.drawImage(logoImg, 64 - w / 2, 64 - h / 2, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.1, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    d.position.set(0, 0.0, -0.126); d.rotation.y = Math.PI; chest.add(d);
  }
  const neck = J(chest, 0, 0.2, 0);
  const neckM = cap(0.05, 0.06, skin); neckM.position.y = -0.02; neck.add(neckM);
  const head = J(neck, 0, 0.05, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 16), skin); skull.scale.set(0.93, 1.06, 1); skull.position.y = 0.11; skull.castShadow = true; head.add(skull);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.133, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hair); hairM.scale.set(0.95, 1.05, 1.04); hairM.position.set(0, 0.125, -0.008); hairM.rotation.x = -0.32; head.add(hairM);
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.06), hair); fringe.position.set(0, 0.2, 0.085); fringe.rotation.x = 0.5; head.add(fringe);
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), dark); e.position.set(s * 0.042, 0.125, 0.112); head.add(e);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), hair); b.position.set(s * 0.043, 0.152, 0.115); b.rotation.z = -s * 0.15; head.add(b);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * 0.118, 0.11, 0); head.add(ear); });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), skin); nose.position.set(0, 0.1, 0.125); head.add(nose);

  // arms (left = +x)
  function arm(s) {
    const sh = J(chest, s * 0.2, 0.15, 0);
    const sleeve = cap(0.062, 0.12, shirt); sleeve.position.y = -0.08; sh.add(sleeve);
    const up = cap(0.048, 0.16, skin); up.position.y = -0.16; sh.add(up);
    const el = J(sh, 0, -0.28, 0);
    const fo = cap(0.044, 0.17, skin); fo.position.y = -0.12; el.add(fo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skin); hand.scale.set(0.8, 1.1, 0.9); hand.position.y = -0.28; hand.castShadow = true; el.add(hand);
    return { sh, el };
  }
  function leg(s) {
    const hp = J(pelvis, s * 0.095, -0.03, 0);
    const th = cap(0.078, 0.3, pants); th.position.y = -0.21; hp.add(th);
    const kn = J(hp, 0, -0.45, 0);
    const shin = cap(0.062, 0.3, skin); shin.position.y = -0.2; kn.add(shin);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.058, 0.08, 10), M(0xe8e4dc, 0.9)); sock.position.y = -0.37; kn.add(sock);
    const an = J(kn, 0, -0.42, 0);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.25), shoe); sh.position.set(0, -0.0, 0.05); sh.castShadow = true; an.add(sh);
    const so = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.025, 0.26), sole); so.position.set(0, -0.05, 0.05); an.add(so);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), shoe); toe.scale.set(1, 0.7, 1); toe.position.set(0, -0.035, 0.17); an.add(toe);
    return { hp, kn, an };
  }
  const L = { a: arm(1), l: leg(1) }, Rr = { a: arm(-1), l: leg(-1) };

  // scarf: ring at the front + flowing triangle down the back (verlet ribbon)
  const stex = stripeTex();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 6, 12), M(0x6b4a2a, 0.6)); ring.position.set(0, 0.07, 0.125); chest.add(ring);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.03, 8, 18), new THREE.MeshStandardMaterial({ map: stex, roughness: 0.9 })); collar.rotation.x = Math.PI / 2 + 0.25; collar.position.set(0, 0.16, -0.01); collar.scale.set(1.15, 1, 1); chest.add(collar);
  [-1, 1].forEach(s => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.012), new THREE.MeshStandardMaterial({ map: stex, roughness: 0.9 })); t.position.set(s * 0.018, -0.02, 0.13); t.rotation.z = s * 0.12; chest.add(t); });
  const NS = 7, SEG = 0.058;
  const sp = [], spp = [];
  const sGeo = new THREE.BufferGeometry(); const sPos = new Float32Array(NS * 2 * 3), sUv = new Float32Array(NS * 2 * 2), idx = [];
  for (let i = 0; i < NS; i++) { sUv.set([0, i / (NS - 1) * 1.6, 1, i / (NS - 1) * 1.6], i * 4); if (i < NS - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); sGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2)); sGeo.setIndex(idx);
  const scarf = new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({ map: stex, side: THREE.DoubleSide, roughness: 0.9 })); scarf.castShadow = true; scarf.frustumCulled = false; S.add(scarf);
  const anchorL = new THREE.Vector3(0, 0.14, -0.12), aW = new THREE.Vector3(), rightW = new THREE.Vector3(), chestC = new THREE.Vector3(), pelC = new THREE.Vector3();

  const pose = zero(); let phase = 0, prevYaw = 0, bankTurn = 0, stepSide = 0, lastSpeed = 0, accLean = 0, idleT = 0;
  const A = { root, bank, flip, body, pelvis, spine, chest, neck, head, L, R: Rr, pose };
  const qYaw = new THREE.Quaternion(), qTilt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3();

  A.update = (dt) => {
    const P = G.player, t = G.t, st = P.state, sp_ = P.speedH;
    const T = zero(); let k = 16;                        // target pose + chase speed
    const run = clamp(sp_ / 8.4, 0, 1.25);
    const yawRate = angDiff(prevYaw, P.yaw) / Math.max(dt, 1e-4); prevYaw = P.yaw;
    accLean = damp(accLean, clamp((sp_ - lastSpeed) / Math.max(dt, 1e-4) * 0.01, -0.25, 0.3), 6, dt); lastSpeed = sp_;
    let flipX = 0, flipY = 0, bankZ = 0, pivot = 1.0;

    const runCycle = (amp, rate = 1) => {
      const stride = 1.1 + sp_ * 0.38;
      const prev = phase; phase += sp_ * dt / stride * Math.PI * 2 * rate;
      // footstep when a foot passes under the body (sin crosses ±1)
      if (Math.floor((prev + Math.PI / 2) / Math.PI) !== Math.floor((phase + Math.PI / 2) / Math.PI)) { stepSide ^= 1; G.onStep && G.onStep(stepSide, amp); }
      const sL = Math.sin(phase), sR = -sL, cL = Math.cos(phase), cR = -cL;
      T.lhx = -(sL * 0.85 + 0.12) * amp; T.rhx = -(sR * 0.85 + 0.12) * amp;
      T.lkn = 0.12 + amp * (1.6 * Math.pow(Math.max(0, cL), 1.4) + 0.25 * Math.max(0, -sL));
      T.rkn = 0.12 + amp * (1.6 * Math.pow(Math.max(0, cR), 1.4) + 0.25 * Math.max(0, -sR));
      T.lan = amp * (0.45 * Math.max(0, -sL) - 0.25 * Math.max(0, cL)); T.ran = amp * (0.45 * Math.max(0, -sR) - 0.25 * Math.max(0, cR));
      T.lsx = sL * 0.95 * amp; T.rsx = sR * 0.95 * amp;                     // arms opposite to legs
      T.lel = -(0.35 + 1.0 * amp + 0.35 * Math.max(0, -sL) * amp); T.rel = -(0.35 + 1.0 * amp + 0.35 * Math.max(0, -sR) * amp);
      T.lsz = 0.1 + 0.08 * amp; T.rsz = -0.1 - 0.08 * amp;
      T.py = -0.07 * amp + 0.075 * amp * Math.abs(cL);
      T.pyaw = 0.2 * amp * sL; T.sy = -0.32 * amp * sL; T.pr = 0.06 * amp * cL;
      T.sp = 0.1 + 0.2 * amp + accLean; T.hp = -T.sp * 0.65; T.hy = -T.sy * 0.5 - T.pyaw * 0.5;
    };

    if (st === 'move' && P.grounded) {
      if (P.slideT > 0) {
        T.lhx = -1.45; T.lkn = 0.15; T.lan = -0.3; T.rhx = -0.55; T.rkn = 1.8; T.py = -0.55; T.sp = -0.5; T.hp = 0.45;
        T.lsx = 0.5; T.lsz = 0.9; T.lel = -0.2; T.rsx = -1.0; T.rsz = -0.4; T.rel = -1.2; k = 20;
      } else if (sp_ > 0.4) {
        runCycle(run);
        bankTurn = damp(bankTurn, clamp(-yawRate * sp_ * 0.014, -0.4, 0.4), 8, dt);
        bankZ = bankTurn;
      } else {
        idleT += dt;
        T.sp = 0.03 + 0.015 * Math.sin(t * 2.1); T.hp = -0.02; T.hy = 0.35 * Math.sin(t * 0.37) * Math.min(1, idleT / 2);
        T.lsz = 0.12; T.rsz = -0.12; T.lel = -0.18; T.rel = -0.18; T.lsx = 0.03 * Math.sin(t * 2.1); T.rsx = T.lsx;
        T.lhx = -0.04; T.rhx = 0.06; T.lkn = 0.06; T.rkn = 0.1; T.lhz = 0.04; T.rhz = -0.04; T.pr = 0.03 * Math.sin(t * 0.7); T.py = -0.01 + 0.006 * Math.sin(t * 2.1);
        bankTurn = damp(bankTurn, 0, 8, dt);
      }
      if (sp_ > 0.4) idleT = 0;
    } else if (st === 'move') {                                // airborne
      const vy = P.vel.y, upK = clamp((vy + 2) / 10, 0, 1);
      const a = { lhx: -1.0, lkn: 1.55, rhx: -0.3, rkn: 0.85, lsx: -2.3, lsz: 0.45, lel: -0.45, rsx: -1.1, rsz: -0.5, rel: -0.9, sp: 0.12, hp: -0.1 };
      const w = Math.sin(t * 7.5);
      const b = { lhx: -0.65, lkn: 0.55, rhx: 0.3, rkn: 0.75, lsx: -0.5 + 0.45 * w, lsz: 1.25 + 0.2 * w, lel: -0.4, rsx: -0.5 - 0.45 * w, rsz: -1.25 + 0.2 * w, rel: -0.4, sp: 0.04, hp: 0.15 };
      for (const kk in a) T[kk] = lerp(b[kk], a[kk], upK);
      if (stepSide) { [T.lhx, T.rhx] = [T.rhx, T.lhx]; [T.lkn, T.rkn] = [T.rkn, T.lkn]; }
      T.lan = -0.25; T.ran = 0.2; k = 9;
      if (P.flipT >= 0) {                                       // double jump: forward somersault, tucked
        const f = clamp(P.flipT / 0.55, 0, 1);
        flipX = smooth(f) * Math.PI * 2;
        const tuck = Math.sin(Math.min(1, f * 1.15) * Math.PI);
        T.lhx = lerp(T.lhx, -2.1, tuck); T.rhx = lerp(T.rhx, -2.0, tuck); T.lkn = lerp(T.lkn, 2.4, tuck); T.rkn = lerp(T.rkn, 2.4, tuck);
        T.lsx = lerp(T.lsx, -1.3, tuck); T.rsx = lerp(T.rsx, -1.3, tuck); T.lel = lerp(T.lel, -1.9, tuck); T.rel = lerp(T.rel, -1.9, tuck);
        T.lsz = lerp(T.lsz, 0.25, tuck); T.rsz = lerp(T.rsz, -0.25, tuck); T.sp = lerp(T.sp, 0.6, tuck); T.hp = lerp(T.hp, 0.5, tuck); k = 30;
      }
      if (P.wallJumpT >= 0) {
        const f = clamp(P.wallJumpT / 0.35, 0, 1);
        flipY = (1 - smooth(f)) * Math.PI;
        T.lsz = 1.6; T.rsz = -1.6; T.lsx = -0.6; T.rsx = -0.6; T.lhx = -0.9; T.lkn = 1.2; T.rhx = 0.4; T.rkn = 0.4; k = 22;
      }
      bankTurn = damp(bankTurn, 0, 4, dt); bankZ = bankTurn;
    } else if (st === 'wallrun') {
      runCycle(1.15, 1.25);
      const w = P.wr, yaw = P.yaw, lx = Math.cos(yaw), lz = -Math.sin(yaw);
      const wallLeft = (-w.nx * lx + -w.nz * lz) > 0;
      bankZ = (wallLeft ? 1 : -1) * 0.5 * smooth(Math.min(1, w.t * 6));
      if (wallLeft) { T.lsx = -0.9; T.lsz = 1.5; T.lel = -0.3; } else { T.rsx = -0.9; T.rsz = -1.5; T.rel = -0.3; }
      T.hy = (wallLeft ? -0.3 : 0.3); k = 18;
    } else if (st === 'ledge') {
      const L = P.ledge, sw = Math.sin(t * 3) * 0.12;
      T.lsx = -2.95; T.rsx = -2.95; T.lsz = 0.22; T.rsz = -0.22; T.lel = -0.25; T.rel = -0.25;
      T.sp = -0.08; T.hp = -0.55; T.lhx = 0.1 + sw; T.rhx = -0.05 - sw; T.lkn = 0.35; T.rkn = 0.25; T.lan = 0.4; T.ran = 0.4; k = 22;
    } else if (st === 'mantle') {
      const M = P.mantle, f = clamp(M.t / M.dur, 0, 1);
      if (M.kind === 'vault') {
        const s = Math.sin(f * Math.PI);
        T.sp = 0.65 * s; T.rsx = lerp(-0.8, -1.25, s); T.rsz = -0.35; T.rel = 0; T.lsx = -0.4; T.lsz = 0.9 * s; T.lel = -0.5;
        T.lhx = -1.3 * s - 0.2; T.lhz = 0.7 * s; T.lkn = 1.6 * s; T.rhx = -1.1 * s; T.rhz = 0.35 * s; T.rkn = 1.7 * s; T.py = -0.1 * s;
        bankZ = -0.45 * s; k = 30;
      } else {
        const pull = clamp(f / 0.6, 0, 1), step = clamp((f - 0.4) / 0.6, 0, 1);
        T.lsx = lerp(-2.95, 0.25, smooth(pull)); T.rsx = T.lsx; T.lel = -1.6 * Math.sin(pull * Math.PI); T.rel = T.lel; T.lsz = 0.3; T.rsz = -0.3;
        T.sp = 0.55 * Math.sin(f * Math.PI); T.hp = -0.2;
        T.lhx = -1.6 * Math.sin(step * Math.PI); T.lkn = 2.1 * Math.sin(step * Math.PI); T.rhx = 0.2 * (1 - step); T.rkn = 0.4 * (1 - step);
        k = 30;
      }
    } else if (st === 'rope') {
      const kick = clamp((P.hv.x * Math.sin(P.yaw) + P.hv.z * Math.cos(P.yaw)) / 7, -1, 1);
      T.lsx = -2.95; T.rsx = -2.95; T.lsz = 0.1; T.rsz = -0.1; T.lel = -0.35; T.rel = -0.2;
      T.lhx = -0.25 - 0.55 * kick; T.rhx = -0.15 - 0.45 * kick; T.lkn = 0.35 + 0.4 * Math.max(0, -kick); T.rkn = 0.5 + 0.3 * Math.max(0, -kick); T.hp = -0.3; T.sp = -0.1 * kick; k = 12;
    } else if (st === 'climb') {
      const c = P.climb.ph, s = Math.sin(c);
      T.lsx = -2.55 + 0.4 * s; T.rsx = -2.55 - 0.4 * s; T.lel = -0.7 - 0.3 * s; T.rel = -0.7 + 0.3 * s; T.lsz = 0.3; T.rsz = -0.3;
      T.lhx = -0.95 - 0.5 * s; T.rhx = -0.95 + 0.5 * s; T.lkn = 1.35 + 0.4 * s; T.rkn = 1.35 - 0.4 * s; T.lhz = 0.25; T.rhz = -0.25; T.hp = -0.45; T.py = -0.05; k = 20;
    }

    // landing squash / roll overlays
    if (P.landT >= 0 && st === 'move') {
      const s = P.landK * Math.pow(1 - P.landT / 0.3, 1.6);
      T.py -= 0.38 * s; T.lkn += 1.2 * s; T.rkn += 1.2 * s; T.lhx -= 0.7 * s; T.rhx -= 0.6 * s; T.sp += 0.45 * s; T.lan -= 0.4 * s; T.ran -= 0.4 * s;
      T.lsx -= 0.5 * s; T.rsx -= 0.5 * s; T.lsz += 0.3 * s; T.rsz -= 0.3 * s; k = 30;
    }
    if (P.rollT >= 0) {
      const f = clamp(P.rollT / 0.55, 0, 1); flipX = smooth(f) * Math.PI * 2; pivot = 0.55;
      const tuck = Math.sin(f * Math.PI);
      T.py = -0.4 * tuck; T.lhx = -2.0 * tuck; T.rhx = -2.0 * tuck; T.lkn = 2.3 * tuck; T.rkn = 2.3 * tuck; T.sp = 0.8 * tuck; T.hp = 0.6 * tuck;
      T.lsx = -1.4 * tuck; T.rsx = -1.4 * tuck; T.lel = -1.6 * tuck; T.rel = -1.6 * tuck; k = 34;
    }

    // chase
    for (const kk of KEYS) pose[kk] = damp(pose[kk], T[kk], k, dt);
    // apply joints
    pelvis.position.y = 0.95 + pose.py; pelvis.rotation.set(pose.pp, pose.pyaw, pose.pr);
    spine.rotation.set(pose.sp, pose.sy, pose.sr); neck.rotation.set(pose.hp * 0.4, pose.hy * 0.4, 0); head.rotation.set(pose.hp * 0.6, pose.hy * 0.6, 0);
    L.a.sh.rotation.set(pose.lsx, pose.lsy, pose.lsz); L.a.el.rotation.x = pose.lel;
    Rr.a.sh.rotation.set(pose.rsx, pose.rsy, pose.rsz); Rr.a.el.rotation.x = pose.rel;
    L.l.hp.rotation.set(pose.lhx, 0, pose.lhz); L.l.kn.rotation.x = pose.lkn; L.l.an.rotation.x = pose.lan;
    Rr.l.hp.rotation.set(pose.rhx, 0, pose.rhz); Rr.l.kn.rotation.x = pose.rkn; Rr.l.an.rotation.x = pose.ran;
    bank.position.y = pivot; body.position.y = -pivot;
    flip.rotation.set(flipX, flipY, 0);
    A.bankZ = damp(A.bankZ || 0, bankZ, 14, dt); bank.rotation.z = A.bankZ;

    // place the root
    if (st === 'rope') {
      const d = tv.copy(P.hp).sub(P.rope.pivot).normalize();
      root.position.copy(P.hp).addScaledVector(d, 2.0);
      qTilt.setFromUnitVectors(up, d.clone().negate()); qYaw.setFromAxisAngle(up, P.yaw);
      root.quaternion.copy(qTilt).multiply(qYaw);
    } else {
      root.position.copy(P.pos); qYaw.setFromAxisAngle(up, P.yaw); root.quaternion.slerp(qYaw, 1 - Math.exp(-30 * dt));
      if (st === 'ledge' || st === 'mantle' || st === 'climb') root.quaternion.copy(qYaw);
    }
    root.updateMatrixWorld(true);
    updateScarf(dt);
  };

  // ---------------- scarf verlet ----------------
  let scarfInit = false;
  function updateScarf(dt) {
    chest.localToWorld(aW.copy(anchorL));
    rightW.set(1, 0, 0).applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion()));
    chest.localToWorld(chestC.set(0, -0.02, 0)); pelvis.localToWorld(pelC.set(0, 0.05, 0));
    if (!scarfInit) { for (let i = 0; i < NS; i++) { sp.push(new THREE.Vector3(aW.x, aW.y - i * SEG, aW.z - 0.02)); spp.push(sp[i].clone()); } scarfInit = true; }
    const h = Math.min(dt, 1 / 30), g = -9.8 * h * h, fl = G.t * 13;
    sp[0].copy(aW); spp[0].copy(aW);
    for (let i = 1; i < NS; i++) {
      const p = sp[i], q = spp[i];
      const vx = (p.x - q.x) * 0.965, vy = (p.y - q.y) * 0.965, vz = (p.z - q.z) * 0.965;
      q.copy(p);
      const f = Math.sin(fl + i * 0.9) * 0.0007 * i;
      p.x += vx + rightW.x * f; p.y += vy + g; p.z += vz + rightW.z * f;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < NS; i++) {
        const a = sp[i - 1], b = sp[i]; const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, e = (d - SEG) / d;
        if (i === 1) { b.x -= dx * e; b.y -= dy * e; b.z -= dz * e; } else { a.x += dx * e * 0.5; a.y += dy * e * 0.5; a.z += dz * e * 0.5; b.x -= dx * e * 0.5; b.y -= dy * e * 0.5; b.z -= dz * e * 0.5; }
      }
      for (let i = 2; i < NS; i++) for (const [c, r] of [[chestC, 0.2], [pelC, 0.2]]) {
        const p = sp[i]; const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < r && d > 1e-5) { const k = (r - d) / d; p.x += dx * k; p.y += dy * k; p.z += dz * k; }
      }
    }
    for (let i = 0; i < NS; i++) {
      const w = lerp(0.15, 0.01, i / (NS - 1)), p = sp[i];
      sPos.set([p.x - rightW.x * w, p.y - rightW.y * w, p.z - rightW.z * w, p.x + rightW.x * w, p.y + rightW.y * w, p.z + rightW.z * w], i * 6);
    }
    sGeo.attributes.position.needsUpdate = true; sGeo.computeVertexNormals(); sGeo.computeBoundingSphere();
  }
  A.resetScarf = () => { scarfInit = false; sp.length = 0; spp.length = 0; };
  A.handWorld = (left, out) => (left ? L : Rr).a.el.localToWorld(out.set(0, -0.28, 0));
  A.footWorld = (left, out) => (left ? L : Rr).l.an.localToWorld(out.set(0, -0.05, 0.05));
  G.rig = A;
  return A;
}
