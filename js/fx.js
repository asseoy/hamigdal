// Particles: dust on steps/landings/slides/wall runs, puffs on double jumps, sand in the wind, bits on checkpoints.
import * as THREE from 'three';
import { G, clamp } from './ctx.js';
import { dustSprite } from './tex.js';

const N = 700;
export function createFx() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1)); geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { map: { value: dustSprite() }, scale: { value: 600 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;
      void main(){ vA=alpha; vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*600./-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC,t.a*vA); if(gl_FragColor.a<0.01) discard; }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; G.scene.add(pts);
  const P = []; for (let i = 0; i < N; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0.3, s1: 1, a0: 0.5, r: 1, g: 1, b: 1, grav: 0, drag: 2 });
  let head = 0;
  const tint = () => { const z = G.zoneBlend ? G.zoneBlend.zi : 0; return [[0.78, 0.72, 0.62], [0.86, 0.7, 0.5], [0.85, 0.85, 0.9], [0.5, 0.5, 0.6], [1, 1, 1]][z]; };
  function spawn(o) {
    const p = P[head]; head = (head + 1) % N;
    Object.assign(p, { life: 0, max: 0.6, vx: 0, vy: 0, vz: 0, s0: 0.25, s1: 0.9, a0: 0.45, grav: 0, drag: 2.5 }, o);
    if (!o.r) { const t = tint(); p.r = t[0]; p.g = t[1]; p.b = t[2]; }
    return p;
  }
  const F = {};
  F.puff = (x, y, z, n, spd, o = {}) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = spd * (0.4 + Math.random() * 0.6); spawn(Object.assign({ x: x + Math.cos(a) * 0.15, y: y + 0.05, z: z + Math.sin(a) * 0.15, vx: Math.cos(a) * s, vy: Math.random() * spd * 0.35, vz: Math.sin(a) * s, max: 0.5 + Math.random() * 0.5 }, o)); } };
  F.ring = (x, y, z, n, spd, o = {}) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; spawn(Object.assign({ x, y: y + 0.05, z, vx: Math.cos(a) * spd, vy: 0.3, vz: Math.sin(a) * spd, max: 0.55, s0: 0.3, s1: 1.2, drag: 4 }, o)); } };
  F.bits = (x, y, z, n) => { const C = [[0.66, 0.07, 0.1], [0.95, 0.88, 0.23], [0.95, 0.94, 0.92], [0.1, 0.1, 0.1]]; for (let i = 0; i < n; i++) { const c = C[i % 4], a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4; spawn({ x, y: y + 1, z, vx: Math.cos(a) * s, vy: 4 + Math.random() * 5, vz: Math.sin(a) * s, grav: 9, drag: 1.2, max: 1.6, s0: 0.09, s1: 0.07, a0: 1, r: c[0], g: c[1], b: c[2] }); } };

  let windAcc = 0, slideAcc = 0;
  const wv = new THREE.Vector3(), tmp = new THREE.Vector3();
  F.update = (dt) => {
    const pl = G.player;
    // continuous emitters
    if (pl.state === 'move' && pl.grounded && pl.slideT > 0) { slideAcc += dt; while (slideAcc > 0.025) { slideAcc -= 0.025; F.puff(pl.pos.x, pl.pos.y, pl.pos.z, 1, 1.5, { max: 0.7 }); } }
    if (G.level && G.level.winds.length) {
      windAcc += dt;
      while (windAcc > 0.03) {
        windAcc -= 0.03;
        for (const w of G.level.winds) {
          if (Math.abs(w.y - pl.pos.y) > 25) continue;
          const lx = (Math.random() - 0.5) * w.hx * 2, lz = (Math.random() - 0.5) * w.hz * 2;
          const x = w.x + lx * w.cos + lz * w.sin, z = w.z - lx * w.sin + lz * w.cos;
          spawn({ x, y: w.y - 2.5 + Math.random() * 3.5, z, vx: w.dx * w.k * 1.6, vy: 0, vz: w.dz * w.k * 1.6, drag: 0, max: 1.1, s0: 0.12, s1: 0.18, a0: 0.35 });
        }
      }
    }
    for (let i = 0; i < N; i++) {
      const p = P[i];
      if (p.life >= p.max) { alpha[i] = 0; continue; }
      p.life += dt; const k = p.life / p.max, dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
      size[i] = p.s0 + (p.s1 - p.s0) * k; alpha[i] = p.a0 * (1 - k) * Math.min(1, k * 8);
    }
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.size.needsUpdate = geo.attributes.alpha.needsUpdate = true;
  };

  // hook into controller events
  F.onEvent = (e) => {
    const p = G.player.pos;
    switch (e.type) {
      case 'land': { const k = clamp(e.impact / 20, 0.2, 1); F.ring(p.x, p.y, p.z, Math.round(6 + 12 * k), 2 + 3 * k); if (e.impact > 12) G.cam.shake = Math.min(1, 0.3 + k * 0.6); break; }
      case 'roll': F.ring(p.x, p.y, p.z, 16, 4); G.cam.shake = 0.5; break;
      case 'jump': case 'longjump': F.puff(p.x, p.y, p.z, 6, 1.6); break;
      case 'double': F.ring(p.x, p.y + 0.2, p.z, 10, 2.5, { s0: 0.2, s1: 0.8, a0: 0.3, r: 0.95, g: 0.95, b: 0.95 }); break;
      case 'walljump': { const n = G.player.wallN; F.puff(p.x - n.x * 0.35, p.y + 0.4, p.z - n.z * 0.35, 8, 1.8); break; }
      case 'bounce': F.ring(p.x, p.y, p.z, 14, 3.5); G.cam.shake = 0.35; break;
      case 'vault': case 'mantle': F.puff(p.x, p.y + 1.6, p.z, 4, 0.8); break;
      case 'slide': F.puff(p.x, p.y, p.z, 8, 2.5); break;
    }
  };
  F.onStep = (side, amp) => {
    const pl = G.player; if (amp < 0.6) return;
    if (pl.state === 'wallrun') { const w = pl.wr; F.puff(pl.pos.x - w.nx * 0.35, pl.pos.y + 0.5, pl.pos.z - w.nz * 0.35, 3, 0.8, { max: 0.45 }); return; }
    if (pl.grounded) { G.rig.footWorld(!!side, tmp); F.puff(tmp.x, pl.pos.y, tmp.z, 2, 0.7 * amp, { max: 0.4, a0: 0.3 }); }
  };
  G.fx = F;
  return F;
}
