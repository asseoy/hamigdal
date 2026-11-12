// Builds the generated tower: merged static geometry per chunk/material, colliders, and the moving parts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, rng, clamp, lerp, ZONES, zoneOf } from './ctx.js';
import { World, makeBox, setYaw } from './physics.js';
import { generate, CORE } from './levelgen.js';
import { makeMaterials, signTexture, flagTexture } from './tex.js';

const UP = new THREE.Vector3(0, 1, 0);

function boxG(w, h, d, ts = 1) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / ts, uv.getY(k) * dims[f][1] / ts); }
  return g;
}
function cylG(r, h, seg = 10, ts = 1, r2 = r) {
  const g = new THREE.CylinderGeometry(r, r2, h, seg, 1, false), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(2 * Math.PI * r / ts)), uv.getY(i) * h / ts);
  return g;
}
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
function placed(g, x, y, z, yaw = 0) { q.setFromAxisAngle(UP, yaw); m4.compose(v1.set(x, y, z), q, sc); return g.applyMatrix4(m4); }
function between(g, a, b) {            // cylinder (along Y) from point a to point b
  v2.subVectors(b, a); const len = v2.length(); g.scale(1, len, 1);
  q.setFromUnitVectors(UP, v2.normalize()); m4.compose(v1.addVectors(a, b).multiplyScalar(0.5), q, sc); return g.applyMatrix4(m4);
}

export async function buildLevel(logo, progress) {
  const S = G.scene, M = makeMaterials(); G.mats = M;
  const world = new World(); G.world = world;
  const data = generate(67); G.data = data;
  const r = rng(99);

  // ---------- static geometry collector ----------
  const bins = new Map();
  const add = (mat, g, chunk = 0) => { const k = mat + '|' + chunk; let b = bins.get(k); if (!b) { b = { mat, chunk, list: [] }; bins.set(k, b); } b.list.push(g); };
  const logBetween = (a, b, rad, chunk, mat = 'log') => add(mat, between(cylG(rad, 1, 8, 1), a, b), chunk);
  const chunkOfY = y => Math.max(0, Math.floor(y / 30));

  // ---------- ground + camp ----------
  {
    const g = new THREE.CircleGeometry(700, 64); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 260, uv.getY(i) * 260);
    const ground = new THREE.Mesh(g, M.ground); ground.receiveShadow = true; S.add(ground);
    world.add(makeBox(0, -5, 0, 700, 5, 700, 0, { ground: true, noCam: true }));
    // tents around the tower
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + 0.4, rr = 34 + r() * 18, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      const tg = new THREE.CylinderGeometry(0.01, 2.2, 2.2, 3, 1); tg.rotateZ(Math.PI / 2); tg.rotateX(0); tg.scale(1.6, 1, 1);
      const tent = new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.4, 4, 1, true), i % 3 ? M.tarp : M.tarpO); tent.position.set(x, 1.2, z); tent.rotation.y = a + Math.PI / 4; tent.castShadow = true; S.add(tent);
      world.add(makeBox(x, 1, z, 1.4, 1, 1.4, a, { noCam: true }));
    }
    // camp fire ring + logs to sit on
    const fx = 22, fz = -8;
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; add('stone', placed(new THREE.DodecahedronGeometry(0.28, 0), fx + Math.cos(a) * 1.1, 0.15, fz + Math.sin(a) * 1.1), 0); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.3; add('log', placed(cylG(0.25, 2.6, 10).rotateZ(Math.PI / 2), fx + Math.cos(a) * 3.3, 0.25, fz + Math.sin(a) * 3.3, -a), 0); }
    // trees
    const leaf = new THREE.MeshStandardMaterial({ color: 0x4f6a35, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, rr = 45 + r() * 120, x = Math.sin(a) * rr, z = Math.cos(a) * rr, h = 3 + r() * 3;
      add('log', placed(cylG(0.18, h, 7), x, h / 2, z), 0);
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + r(), 1), leaf); t.position.set(x, h + 0.8, z); t.scale.set(1, 0.8 + r() * 0.3, 1); t.castShadow = true; S.add(t);
    }
    // ring of hills on the horizon
    const hillM = new THREE.MeshStandardMaterial({ color: 0xa88a62, roughness: 1 });
    for (let i = 0; i < 34; i++) {             // soft desert hills (Negev), not pyramids
      const a = i / 34 * Math.PI * 2 + r() * 0.15, rr = 360 + r() * 160, rad = 80 + r() * 90, hgt = 30 + r() * 70;
      const g = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); const pa = g.attributes.position;
      for (let k = 0; k < pa.count; k++) { const x = pa.getX(k), y = pa.getY(k), z = pa.getZ(k), n = Math.sin(x * 5 + i) * Math.cos(z * 4 - i) * 0.12; pa.setXYZ(k, x * (1 + n), y * (1 + n * 2), z * (1 + n)); }
      g.computeVertexNormals();
      const h = new THREE.Mesh(g, hillM); h.scale.set(rad * (1 + r() * 0.6), hgt, rad); h.position.set(Math.sin(a) * rr, -3, Math.cos(a) * rr); h.rotation.y = r() * 3; S.add(h);
    }
    // camp flag at the base
    G.baseFlagPos = new THREE.Vector3(16.5, 0, 6);
  }

  // ---------- central core: lashed poles all the way up ----------
  const coreTop = data.top + 14, cr = CORE * 0.82;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add('log', placed(cylG(0.5, coreTop + 2, 12, 1.2), sx * cr, coreTop / 2 - 1, sz * cr), 9);
  for (let y = 3; y < coreTop; y += 7) {
    const ch = chunkOfY(y);
    const C = [[cr, cr], [cr, -cr], [-cr, -cr], [-cr, cr]];
    for (let i = 0; i < 4; i++) {
      const a = C[i], b = C[(i + 1) % 4];
      logBetween(v1.clone().set(a[0], y, a[1]), new THREE.Vector3(b[0], y, b[1]), 0.24, ch);
      logBetween(new THREE.Vector3(a[0], y, a[1]), new THREE.Vector3(b[0], y + 7, b[1]), 0.15, ch);
      // lashing rings at the joints
      add('rope', placed(new THREE.TorusGeometry(0.52, 0.06, 6, 14).rotateX(Math.PI / 2), a[0], y, a[1]), ch);
    }
  }
  world.add(makeBox(0, coreTop / 2, 0, cr + 0.4, coreTop / 2, cr + 0.4, 0, { wall: true, noLedge: true, core: true }));

  // ---------- pieces ----------
  const L = { movers: [], spinners: [], crumbles: [], ropes: [], flags: [], winds: [], lanterns: [], floors: data.floors, data };
  G.level = L;
  const flagTexCache = new Map();
  const zoneAtY = y => { let z = 0; for (const f of data.floors) if (f.y <= y + 0.5) z = f.zone; return z; };

  let n = 0;
  for (const p of data.pieces) {
    if (++n % 120 === 0) { progress && progress(0.2 + 0.7 * n / data.pieces.length); await new Promise(r => setTimeout(r, 0)); }
    const ch = chunkOfY(p.y || 0);
    if (p.t === 'box') {
      const tags = Object.assign({}, p.tags);
      if (p.log) {                                   // log beam: round visual, box collider
        const g = cylG(p.w / 2 + 0.06, p.d, 12, 1.2); g.rotateX(Math.PI / 2); add('log', placed(g, p.x, p.y + 0.05, p.z, p.yaw), ch);
        world.add(makeBox(p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2, p.yaw, tags));
        continue;
      }
      if (p.pole) {
        const z = zoneAtY(p.y);
        const mat = p.mat === 'candle' ? 'candle' : 'log';
        add(mat, placed(cylG(0.4, p.h, 14, 1), p.x, p.y, p.z), ch);
        add(mat === 'candle' ? 'white' : 'pine', placed(cylG(0.42, 0.06, 14, 1), p.x, p.y + p.h / 2 + 0.03, p.z), ch);
        if (mat === 'candle') add('metal', placed(cylG(0.025, 0.14, 5), p.x, p.y + p.h / 2 + 0.12, p.z), ch);
        world.add(makeBox(p.x, p.y + 0.03, p.z, 0.4, p.h / 2 + 0.03, 0.4, 0, tags));
        continue;
      }
      if (p.bridge) {
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), cnt = Math.floor(p.d / 0.34);
        for (let i = 0; i < cnt; i++) { const a = -p.d / 2 + 0.17 + i * 0.34; add('wood', placed(boxG(1.3, 0.07, 0.27, 1), p.x + fx * a, p.y + 0.02 + Math.sin(i * 1.7) * 0.01, p.z + fz * a, p.yaw + Math.sin(i * 2.3) * 0.03), ch); }
        world.add(makeBox(p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2, p.yaw, tags));
        continue;
      }
      if (p.pad) { buildPad(p, ch, tags); continue; }
      const mat = p.mat;
      if (p.wallPanel && (mat === 'tarp' || mat === 'tarpO')) {
        add(mat, placed(boxG(0.06, p.h - 0.6, p.d - 0.3, 2.5), p.x, p.y + 0.2, p.z, p.yaw), ch);
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        for (const k of (p.d > 6 ? [-0.5, 0, 0.5] : [-0.5, 0.5])) add('log', placed(cylG(0.12, p.h + 0.4, 8), p.x + fx * k * p.d, p.y + 0.2, p.z + fz * k * p.d), ch);
        add('log', placed(cylG(0.09, p.d, 8).rotateX(Math.PI / 2), p.x, p.y + p.h / 2 - 0.05, p.z, p.yaw), ch);
      } else {
        add(mat, placed(boxG(p.w, p.h, p.d, mat === 'sand' ? 2 : 1), p.x, p.y, p.z, p.yaw), ch);
      }
      world.add(makeBox(p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2, p.yaw, tags));
      if (p.deco) decorate(p, ch);
      if (p.checkpoint) { /* flag built from 'flag' piece */ }
    } else if (p.t === 'mover') {
      const mesh = new THREE.Mesh(boxG(p.w, p.h, p.d), M[p.mat]); mesh.castShadow = mesh.receiveShadow = true; S.add(mesh);
      const under = new THREE.Mesh(boxG(p.w * 0.7, 0.18, p.d * 0.7), M.metal); under.position.y = -0.3; mesh.add(under);
      const c = world.addDynamic(makeBox(p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2, p.yaw, {}));
      L.movers.push({ p, mesh, c, base: new THREE.Vector3(p.x, p.y, p.z) });
      mesh.rotation.y = p.yaw;
    } else if (p.t === 'spin') {
      const grp = new THREE.Group(); grp.position.set(p.x, p.y, p.z); S.add(grp);
      const D = M.dreidel, top = M.white;
      const body = new THREE.Mesh(boxG(p.w, p.h, p.d), [D[0], D[2], top, top, D[1], D[3]]); body.castShadow = body.receiveShadow = true; grp.add(body);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(p.w * 0.71, 1.8, 4), M.blue); cone.rotation.set(Math.PI, Math.PI / 4, 0); cone.position.y = -p.h / 2 - 0.9; cone.castShadow = true; grp.add(cone);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), M.gold); tip.position.y = -p.h / 2 - 1.8; grp.add(tip);
      const rim = new THREE.Mesh(boxG(p.w + 0.08, 0.1, p.d + 0.08), M.gold); rim.position.y = p.h / 2 - 0.04; grp.add(rim);
      const c = world.addDynamic(makeBox(p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2, p.yaw, { noLedge: true }));
      L.spinners.push({ p, grp, c, yaw: p.yaw });
    } else if (p.t === 'crumble') {
      const mesh = new THREE.Mesh(boxG(p.w, p.h, p.d), M.wood); mesh.castShadow = mesh.receiveShadow = true; mesh.position.set(p.x, p.y, p.z); mesh.rotation.y = p.yaw; S.add(mesh);
      const crack = new THREE.Mesh(boxG(p.w * 0.9, 0.02, 0.05), M.dark); crack.position.y = p.h / 2 + 0.005; crack.rotation.y = 0.6; mesh.add(crack);
      const it = { p, mesh, state: 0, t: 0 };
      const c = world.add(makeBox(p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2, p.yaw, {}));
      c.tags.crumble = { touch: () => { if (it.state === 0) { it.state = 1; it.t = 0; G.sfx && G.sfx('creak'); } } };
      it.c = c; L.crumbles.push(it);
    } else if (p.t === 'rope') {
      buildRope(p, ch);
    } else if (p.t === 'net') {
      const g = new THREE.PlaneGeometry(p.w, p.h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * p.w / 0.45, uv.getY(i) * p.h / 0.45);
      add('net', placed(g.rotateY(Math.PI), p.x, p.y, p.z, p.yaw), ch);
      add('log', placed(cylG(0.07, p.w + 0.2, 8).rotateZ(Math.PI / 2), p.x, p.y + p.h / 2, p.z, p.yaw), ch);
    } else if (p.t === 'rails') {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      for (const s of [-1, 1]) {
        const a = new THREE.Vector3(p.x - fx * p.len / 2 + rx * s * 0.72, p.y + 1.05, p.z - fz * p.len / 2 + rz * s * 0.72), b = new THREE.Vector3(p.x + fx * p.len / 2 + rx * s * 0.72, p.y + 1.05, p.z + fz * p.len / 2 + rz * s * 0.72);
        const m = a.clone().lerp(b, 0.5); m.y -= 0.35;
        logBetween(a, m, 0.035, ch, 'rope'); logBetween(m, b, 0.035, ch, 'rope');
        for (const e of [a, b]) add('log', placed(cylG(0.08, 1.3, 8), e.x, p.y + 0.5, e.z), ch);
        const a2 = a.clone(), b2 = b.clone(), m2 = m.clone(); a2.y -= 0.9; b2.y -= 0.9; m2.y -= 0.9 - 0.08;
        logBetween(a2, m2, 0.04, ch, 'rope'); logBetween(m2, b2, 0.04, ch, 'rope');
      }
    } else if (p.t === 'wind') {
      L.winds.push({ x: p.x, y: p.y, z: p.z, hx: p.w / 2, hy: p.h / 2, hz: p.d / 2, cos: Math.cos(p.yaw), sin: Math.sin(p.yaw), dx: p.dx, dz: p.dz, k: p.k, yaw: p.yaw, len: p.d });
      // banners on poles show the wind
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      for (const k of [-0.35, 0.35]) { const bx = p.x + fx * k * p.d - p.dx * (p.w / 2 - 2.2), bz = p.z + fz * k * p.d - p.dz * (p.w / 2 - 2.2); add('log', placed(cylG(0.07, 3.2, 8), bx, p.y - 1.0, bz), ch); L.flags.push(makeFlag(bx, p.y + 0.4, bz, Math.atan2(p.dx, p.dz) - Math.PI / 2, null, 0.9, true)); }
    } else if (p.t === 'sign') {
      const b = p.behind; const rx = Math.cos(b.h), rz = -Math.sin(b.h);
      const sx = b.x + rx * 1.4 - Math.sin(b.h) * 0.6, sz = b.z + rz * 1.4 - Math.cos(b.h) * 0.6;
      add('log', placed(cylG(0.07, 2.2, 8), sx, p.y + 1.1, sz), ch);
      const t = signTexture([{ text: p.lines[0], y: 92, font: '700 66px "Frank Ruhl Libre", serif' }, { text: p.lines[1], y: 176, font: '500 44px "Frank Ruhl Libre", serif', color: '#f3e03b' }]);
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.06), [M.wood, M.wood, M.wood, M.wood, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.28 }), M.wood]);
      s.position.set(sx - Math.sin(b.h) * 0.1, p.y + 1.75, sz - Math.cos(b.h) * 0.1); s.rotation.y = b.h + Math.PI; s.castShadow = true; S.add(s);
    } else if (p.t === 'flag') {
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const px = p.x + rx * 1.85 - fx * 1.85, pz = p.z + rz * 1.85 - fz * 1.85;
      add('log', placed(cylG(0.08, 4.6, 8), px, p.y + 2.3, pz), ch);
      add('gold', placed(new THREE.SphereGeometry(0.12, 8, 6), px, p.y + 4.65, pz), ch);
      L.flags.push(makeFlag(px, p.y + 4.0, pz, p.yaw + Math.PI / 2, p.floor, 1.0));
      if (p.gate) buildGate(p, ch);
    } else if (p.t === 'summit') {
      add('log', placed(cylG(0.16, 10, 10), p.x, p.y + 5, p.z), ch);
      L.flags.push(makeFlag(p.x, p.y + 8.6, p.z, p.yaw, null, 2.6));
      const t = signTexture([{ text: 'הפסגה', y: 110, font: '700 120px "Karantina", serif' }, { text: 'שבט הנשיא', y: 200, font: '700 46px "Frank Ruhl Libre", serif', color: '#f3e03b' }]);
      const s = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 0.1), [M.wood, M.wood, M.wood, M.wood, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.28 }), M.wood]);
      s.position.set(p.x - Math.sin(p.yaw) * 3, p.y + 1.6, p.z - Math.cos(p.yaw) * 3); s.rotation.y = p.yaw + Math.PI; S.add(s);
      add('log', placed(cylG(0.08, 1.8, 8), s.position.x - Math.cos(p.yaw) * 1.3, p.y + 0.9, s.position.z + Math.sin(p.yaw) * 1.3), ch);
      add('log', placed(cylG(0.08, 1.8, 8), s.position.x + Math.cos(p.yaw) * 1.3, p.y + 0.9, s.position.z - Math.sin(p.yaw) * 1.3), ch);
    }
  }

  function decorate(p, ch) {
    const z = zoneAtY(p.y), top = p.y + p.h / 2;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const corner = (lx, lz) => ({ x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c });
    // brace from under the platform to the core: makes the whole thing one structure
    if (!p.block && p.w >= 1.6) {
      const a = new THREE.Vector3(p.x, top - p.h - 0.05, p.z), dir = Math.hypot(p.x, p.z), k = (CORE * 0.82) / Math.max(Math.abs(p.x), Math.abs(p.z));
      const b = new THREE.Vector3(p.x * k, top - 4 - dir * 0.15, p.z * k);
      if (z !== 4) logBetween(a, b, 0.09, ch);
    }
    if (p.block) {                                   // crates: dark edge frame
      const hw = p.w / 2, hd = p.d / 2;
      for (const [lx, lz] of [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]]) { const q2 = corner(lx * 0.98, lz * 0.98); add('dark', placed(boxG(0.12, p.h, 0.12), q2.x, p.y, q2.z, p.yaw), ch); }
      return;
    }
    if (z === 0 || z === 3 || z === 1) {                // corner posts with rope lashings
      const hw = p.w / 2 - 0.08, hd = p.d / 2 - 0.08;
      for (const [lx, lz] of [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]]) {
        const q2 = corner(lx, lz); add('log', placed(cylG(0.075, 1.25, 8), q2.x, top - 0.45, q2.z), ch);
        add('rope', placed(new THREE.TorusGeometry(0.09, 0.03, 5, 10).rotateX(Math.PI / 2), q2.x, top - 0.12, q2.z), ch);
      }
    }
    if (z === 2 && r() < 0.5) {                       // Hanukkah: little candles burning on the corners
      const q2 = corner(p.w / 2 - 0.25, p.d / 2 - 0.25);
      add('candle', placed(cylG(0.07, 0.6, 8), q2.x, top + 0.3, q2.z), ch);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.flame); fl.scale.set(0.8, 1.6, 0.8); fl.position.set(q2.x, top + 0.7, q2.z); S.add(fl); L.lanterns.push({ pos: fl.position, flame: fl, k: 0.6 });
    }
    if (z === 3 && r() < 0.55) {                      // night: lanterns on posts
      const q2 = corner(-(p.w / 2 - 0.2), p.d / 2 - 0.2);
      add('log', placed(cylG(0.05, 1.6, 6), q2.x, top + 0.8, q2.z), ch);
      add('metal', placed(boxG(0.26, 0.05, 0.26), q2.x, top + 1.85, q2.z), ch);
      const gl = new THREE.Mesh(boxG(0.2, 0.28, 0.2), M.lanternGlass); gl.position.set(q2.x, top + 1.7, q2.z); S.add(gl);
      L.lanterns.push({ pos: gl.position, k: 1 });
    }
    if (z === 4) {                                    // sky: cloud puffs under the platform
      for (let i = 0; i < 4; i++) { const q2 = corner((r() - 0.5) * p.w, (r() - 0.5) * p.d); add('cloud', placed(new THREE.IcosahedronGeometry(0.7 + r() * 0.8, 1), q2.x, top - 0.7 - r() * 0.4, q2.z), ch); }
    }
  }

  function buildPad(p, ch, tags) {
    world.add(makeBox(p.x, p.y, p.z, p.w / 2, p.h / 2, p.d / 2, p.yaw, tags));
    const top = p.y + p.h / 2;
    if (p.pad === 'donut') {
      const d = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.42, 12, 24), new THREE.MeshStandardMaterial({ color: 0xc27a3c, roughness: 0.8 })); d.rotation.x = Math.PI / 2; d.position.set(p.x, top - 0.25, p.z); d.castShadow = true; S.add(d);
      const sugar = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.3, 8, 24, Math.PI * 2), new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 1 })); sugar.rotation.x = Math.PI / 2; sugar.position.set(p.x, top - 0.08, p.z); sugar.scale.set(1, 1, 0.5); S.add(sugar);
      const jam = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9e1020, roughness: 0.3 })); jam.position.set(p.x, top - 0.05, p.z); jam.scale.y = 0.4; S.add(jam);
      p.mesh = d;
    } else if (p.pad === 'cloud') {
      for (let i = 0; i < 6; i++) add('cloud', placed(new THREE.IcosahedronGeometry(0.6 + r() * 0.4, 1), p.x + (r() - 0.5) * 1.6, top - 0.3, p.z + (r() - 0.5) * 1.6), ch);
    } else {
      add('tarpO', placed(boxG(2.3, 0.05, 2.3, 2.3), p.x, top - 0.05, p.z, p.yaw), ch);
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      for (const [lx, lz, len, rot] of [[1.2, 0, 2.5, 0], [-1.2, 0, 2.5, 0], [0, 1.2, 2.5, 1], [0, -1.2, 2.5, 1]]) {
        const g = cylG(0.1, len, 8); g.rotateX(Math.PI / 2); if (rot) g.rotateY(Math.PI / 2);
        add('log', placed(g, p.x + lx * c + lz * s, top - 0.08, p.z - lx * s + lz * c, p.yaw), ch);
      }
      for (const [lx, lz] of [[1.2, 1.2], [1.2, -1.2], [-1.2, 1.2], [-1.2, -1.2]]) add('log', placed(cylG(0.08, 0.9, 6), p.x + lx * c + lz * s, top - 0.5, p.z - lx * s + lz * c), ch);
    }
  }

  function buildRope(p, ch) {
    const pivot = new THREE.Vector3(p.x, p.y, p.z);
    // a log arm from the core holds the rope
    const k = (CORE * 0.82) / Math.max(Math.abs(p.x), Math.abs(p.z));
    const base = new THREE.Vector3(p.x * k, p.y + 0.2, p.z * k), tip = new THREE.Vector3(p.x, p.y + 0.2, p.z);
    const dir = tip.clone().sub(base).normalize(); tip.addScaledVector(dir, 0.5);
    logBetween(base, tip, 0.17, ch);
    logBetween(base.clone().setY(base.y - 3.5), tip.clone().lerp(base, 0.35), 0.11, ch);
    add('rope', placed(new THREE.TorusGeometry(0.2, 0.05, 6, 12).rotateY(Math.atan2(dir.x, dir.z)), p.x, p.y + 0.2, p.z), ch);
    const mesh = new THREE.Mesh(cylG(0.05, 1, 6, 0.4), M.rope); mesh.castShadow = true; S.add(mesh);
    const tail = new THREE.Mesh(cylG(0.05, 1, 6, 0.4), M.rope); tail.castShadow = true; S.add(tail);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), M.rope); S.add(knot);
    const sw = (r() - 0.5) * 2;
    const rope = { pivot, L: p.L, bob: new THREE.Vector3(p.x + sw * 0.4, p.y - p.L, p.z), bobV: new THREE.Vector3(Math.cos(sw * 3) * 1.2, 0, Math.sin(sw * 3) * 1.2), held: false, mesh, tail, knot };
    L.ropes.push(rope);
  }

  function buildGate(p, ch) {
    const z = p.zone, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const cx = p.x + fx * 1.6, cz = p.z + fz * 1.6;
    for (const s of [-1, 1]) add('log', placed(cylG(0.14, 4.6, 10), cx + rx * s * 1.9, p.y + 2.3, cz + rz * s * 1.9), ch);
    add('log', placed(cylG(0.12, 4.4, 10).rotateZ(Math.PI / 2), cx, p.y + 4.4, cz, p.yaw), ch);
    const t = signTexture([{ text: 'אזור ' + (z + 1), y: 70, font: '700 48px "Frank Ruhl Libre", serif', color: '#f3e03b' }, { text: ZONES[z].name, y: 168, font: '700 120px "Karantina", serif' }], { bg: '#3a2a1c' });
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.4, 0.08), [M.wood, M.wood, M.wood, M.wood, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.28 }), M.wood]);
    s.position.set(cx, p.y + 3.55, cz); s.rotation.y = p.yaw + Math.PI; S.add(s);
    const s2 = s.clone(); s2.rotation.y = p.yaw; s2.position.addScaledVector(new THREE.Vector3(fx, 0, fz), 0.02); S.add(s2);
  }

  function makeFlag(x, y, z, yaw, floor, size = 1, small = false) {
    const key = floor || 'logo'; let t = flagTexCache.get(key); if (!t) { t = flagTexture(logo, floor); flagTexCache.set(key, t); }
    const w = 1.7 * size, h = 1.06 * size;
    const g = new THREE.PlaneGeometry(w, h, 12, 6); g.translate(w / 2, 0, 0);
    let tb = flagTexCache.get(key + 'b'); if (!tb) { tb = t.clone(); tb.wrapS = THREE.RepeatWrapping; tb.repeat.x = -1; tb.offset.x = 1; tb.needsUpdate = true; flagTexCache.set(key + 'b', tb); }
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, side: THREE.FrontSide, roughness: 0.9 })); mesh.castShadow = true;
    mesh.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tb, side: THREE.BackSide, roughness: 0.9 })));
    mesh.position.set(x, y, z); mesh.rotation.y = yaw; S.add(mesh);
    return { mesh, base: Float32Array.from(g.attributes.position.array), w, ph: Math.random() * 6, strong: small };
  }

  // ---------- merge statics ----------
  for (const b of bins.values()) {
    const merged = mergeGeometries(b.list, false); if (!merged) continue;
    const mesh = new THREE.Mesh(merged, M[b.mat]); mesh.castShadow = b.mat !== 'net' && b.mat !== 'cloud'; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    S.add(mesh); b.list.forEach(g => g.dispose());
  }

  // lantern lights (a small fixed pool, moved to the nearest lanterns)
  L.lights = [];
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffb060, 0, 10, 1.6); S.add(l); L.lights.push(l); }

  // ---------- per-frame ----------
  let lightT = 0;
  L.update = (dt) => {
    const t = G.t, P = G.player;
    for (const m of L.movers) {
      const p = m.p, s = Math.sin((t + p.ph) / p.per * Math.PI * 2) * p.amp;
      const nx = m.base.x + p.ax * s, ny = m.base.y + p.ay * s, nz = m.base.z + p.az * s;
      m.c.dx = nx - m.c.x; m.c.dy = ny - m.c.y; m.c.dz = nz - m.c.z; m.c.x = nx; m.c.y = ny; m.c.z = nz;
      m.mesh.position.set(nx, ny, nz);
    }
    for (const s of L.spinners) {
      const d = s.p.speed * dt; s.yaw += d; setYaw(s.c, s.yaw); s.c.dyaw = d; s.c.dx = s.c.dy = s.c.dz = 0; s.grp.rotation.y = s.yaw;
      s.grp.position.y = s.p.y + Math.sin(t * 2 + s.p.x) * 0.04;
    }
    for (const it of L.crumbles) {
      if (it.state === 1) { it.t += dt; it.mesh.position.set(it.p.x + (Math.random() - 0.5) * 0.06, it.p.y, it.p.z + (Math.random() - 0.5) * 0.06); if (it.t > 0.55) { it.state = 2; it.t = 0; it.c.off = true; it.vy = 0; G.sfx && G.sfx('crack'); } }
      else if (it.state === 2) { it.t += dt; it.vy -= 25 * dt; it.mesh.position.y += it.vy * dt; it.mesh.rotation.x += dt * 1.5; if (it.t > 3.2) { it.state = 0; it.c.off = false; it.mesh.position.set(it.p.x, it.p.y, it.p.z); it.mesh.rotation.set(0, it.p.yaw, 0); } }
    }
    for (const rp of L.ropes) {
      if (!rp.held) {                                     // free pendulum
        rp.bobV.y -= 30 * dt; rp.bob.addScaledVector(rp.bobV, dt);
        v1.subVectors(rp.bob, rp.pivot); const l = v1.length(); v1.divideScalar(l); rp.bob.copy(rp.pivot).addScaledVector(v1, rp.L);
        rp.bobV.addScaledVector(v1, -rp.bobV.dot(v1)); rp.bobV.multiplyScalar(1 - 0.25 * dt);
        if (rp.bobV.lengthSq() < 0.5) rp.bobV.x += Math.sin(t * 0.7 + rp.pivot.x) * 0.6 * dt;
        setSeg(rp.mesh, rp.pivot, rp.bob); rp.tail.visible = false; rp.knot.position.copy(rp.bob);
      } else {
        const hp = P.hp; setSeg(rp.mesh, rp.pivot, hp);
        v1.subVectors(hp, rp.pivot).normalize(); const rest = Math.max(0.3, rp.L - P.ropeS);
        v2.copy(hp).addScaledVector(v1, rest); v2.y -= 0.1; setSeg(rp.tail, hp, v2); rp.tail.visible = true; rp.knot.position.copy(v2);
      }
    }
    // flags wave
    const cam = G.camera.position;
    for (const f of L.flags) {
      if (Math.abs(f.mesh.position.y - cam.y) > 40 || f.mesh.position.distanceToSquared(cam) > 2500) continue;
      const pos = f.mesh.geometry.attributes.position, b = f.base, k = f.strong ? 1.6 : 1;
      for (let i = 0; i < pos.count; i++) { const x = b[i * 3], u = x / f.w; pos.array[i * 3 + 2] = Math.sin(x * 3.2 - t * 6 * k + f.ph) * 0.12 * u * k + Math.sin(x * 7 - t * 9) * 0.03 * u; pos.array[i * 3 + 1] = b[i * 3 + 1] - u * u * 0.08; }
      pos.needsUpdate = true; f.mesh.geometry.computeVertexNormals();
    }
    // lantern + candle flicker, light pool follows the nearest
    lightT -= dt;
    if (lightT <= 0) {
      lightT = 0.25;
      const pp = P.pos; const near = L.lanterns.filter(l => Math.abs(l.pos.y - pp.y) < 18).sort((a, b) => a.pos.distanceToSquared(pp) - b.pos.distanceToSquared(pp));
      L.lights.forEach((l, i) => { const n = near[i]; if (n) { l.position.copy(n.pos); l.userData.k = n.k; l.userData.on = 1; } else l.userData.on = 0; });
    }
    for (const l of L.lights) l.intensity = damp0(l.intensity, l.userData.on ? (l.userData.k || 1) * 6 * (0.85 + 0.15 * Math.sin(t * 11 + l.position.x)) : 0, dt);
    for (const ln of L.lanterns) if (ln.flame) ln.flame.scale.y = 1.6 + Math.sin(t * 13 + ln.pos.x * 3) * 0.25;
  };
  const damp0 = (a, b, dt) => a + (b - a) * (1 - Math.exp(-8 * dt));
  function setSeg(mesh, a, b) { v2.subVectors(b, a); const len = v2.length(); mesh.position.addVectors(a, b).multiplyScalar(0.5); mesh.scale.set(1, len, 1); q.setFromUnitVectors(UP, v2.divideScalar(len || 1)); mesh.quaternion.copy(q); }

  // wind force at a point
  L.windAt = (p, out) => {
    out.set(0, 0, 0);
    for (const w of L.winds) {
      const dx = p.x - w.x, dz = p.z - w.z, lx = dx * w.cos - dz * w.sin, lz = dx * w.sin + dz * w.cos;
      if (Math.abs(lx) < w.hx && Math.abs(lz) < w.hz && Math.abs(p.y - w.y) < w.hy) {
        const gust = 0.55 + 0.45 * Math.sin(G.t * 1.3 + w.x) * Math.sin(G.t * 0.7 + w.z * 0.3) + 0.25;
        out.x += w.dx * w.k * gust; out.z += w.dz * w.k * gust;
      }
    }
    return out;
  };
  progress && progress(1);
  return L;
}
