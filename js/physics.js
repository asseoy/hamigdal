// Collision world: yaw-rotated boxes (OBB) and vertical cylinders, spatial hash for statics.
// The player is a vertical capsule approximated as a cylinder (radius r, height h, feet at y).
const CELL = 6;
const key = (ix, iy, iz) => ((ix + 1000) * 2048 + (iy + 1000)) * 2048 + (iz + 1000);

export function makeBox(x, y, z, hx, hy, hz, yaw = 0, tags = {}) {
  const c = { type: 'box', x, y, z, hx, hy, hz, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), tags, off: false, dx: 0, dy: 0, dz: 0, dyaw: 0 };
  return c;
}
export function makeCyl(x, y, z, r, hy, tags = {}) {
  return { type: 'cyl', x, y, z, r, hx: r, hz: r, hy, yaw: 0, cos: 1, sin: 0, tags, off: false, dx: 0, dy: 0, dz: 0, dyaw: 0 };
}
export function setYaw(c, yaw) { c.yaw = yaw; c.cos = Math.cos(yaw); c.sin = Math.sin(yaw); }
function extents(c) {
  if (c.type === 'cyl') return [c.r, c.r];
  const ac = Math.abs(c.cos), as = Math.abs(c.sin);
  return [ac * c.hx + as * c.hz, as * c.hx + ac * c.hz];
}

export class World {
  constructor() { this.map = new Map(); this.dyn = []; this.all = []; this.stamp = 1; this.out = []; }
  add(c) {
    this.all.push(c);
    const [ex, ez] = extents(c);
    const x0 = Math.floor((c.x - ex) / CELL), x1 = Math.floor((c.x + ex) / CELL);
    const y0 = Math.floor((c.y - c.hy) / CELL), y1 = Math.floor((c.y + c.hy) / CELL);
    const z0 = Math.floor((c.z - ez) / CELL), z1 = Math.floor((c.z + ez) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) for (let k = z0; k <= z1; k++) {
      const kk = key(i, j, k); let a = this.map.get(kk); if (!a) { a = []; this.map.set(kk, a); } a.push(c);
    }
    return c;
  }
  addDynamic(c) { c.dyn = true; this.dyn.push(c); this.all.push(c); return c; }
  query(x0, y0, z0, x1, y1, z1) {
    const out = this.out; out.length = 0; const st = ++this.stamp;
    const a0 = Math.floor(x0 / CELL), a1 = Math.floor(x1 / CELL), b0 = Math.floor(y0 / CELL), b1 = Math.floor(y1 / CELL), c0 = Math.floor(z0 / CELL), c1 = Math.floor(z1 / CELL);
    for (let i = a0; i <= a1; i++) for (let j = b0; j <= b1; j++) for (let k = c0; k <= c1; k++) {
      const arr = this.map.get(key(i, j, k)); if (!arr) continue;
      for (const c of arr) if (c._s !== st && !c.off) { c._s = st; out.push(c); }
    }
    for (const c of this.dyn) if (!c.off && c._s !== st) { c._s = st; out.push(c); }
    return out;
  }
  // horizontal penetration of circle (px,pz,r) into collider -> {x,z push, nx,nz} or null
  push(c, px, pz, r, res) {
    if (c.type === 'cyl') {
      const dx = px - c.x, dz = pz - c.z, d2 = dx * dx + dz * dz, R = c.r + r;
      if (d2 >= R * R) return null;
      const d = Math.sqrt(d2) || 1e-6; res.nx = dx / d; res.nz = dz / d; res.depth = R - d; return res;
    }
    const dx = px - c.x, dz = pz - c.z;
    const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
    const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
    let ex = lx - qx, ez = lz - qz; const d2 = ex * ex + ez * ez;
    let nlx, nlz, depth;
    if (d2 > 1e-10) {
      if (d2 >= r * r) return null;
      const d = Math.sqrt(d2); nlx = ex / d; nlz = ez / d; depth = r - d;
    } else {                                   // centre inside the box: leave by the nearest face
      const px_ = c.hx - Math.abs(lx), pz_ = c.hz - Math.abs(lz);
      if (px_ < pz_) { nlx = Math.sign(lx) || 1; nlz = 0; depth = px_ + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; depth = pz_ + r; }
    }
    // local -> world (three.js Y rotation)
    res.nx = nlx * c.cos + nlz * c.sin; res.nz = -nlx * c.sin + nlz * c.cos; res.depth = depth; return res;
  }
  // does the circle overlap the collider's footprint (shrunk by m)?
  over(c, px, pz, r) {
    if (c.type === 'cyl') { const dx = px - c.x, dz = pz - c.z, R = c.r + r; return dx * dx + dz * dz < R * R; }
    const dx = px - c.x, dz = pz - c.z;
    const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
    const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
    const ex = lx - qx, ez = lz - qz; return ex * ex + ez * ez < r * r;
  }
  // ray vs everything near the segment; returns hit distance or Infinity
  ray(ox, oy, oz, dx, dy, dz, maxD) {
    const ex = ox + dx * maxD, ey = oy + dy * maxD, ez = oz + dz * maxD;
    const list = this.query(Math.min(ox, ex) - 1, Math.min(oy, ey) - 1, Math.min(oz, ez) - 1, Math.max(ox, ex) + 1, Math.max(oy, ey) + 1, Math.max(oz, ez) + 1);
    let best = maxD;
    for (const c of list) {
      if (c.tags.noCam) continue;
      const rx = ox - c.x, rz = oz - c.z;
      const lox = rx * c.cos - rz * c.sin, loz = rx * c.sin + rz * c.cos, loy = oy - c.y;
      const ldx = dx * c.cos - dz * c.sin, ldz = dx * c.sin + dz * c.cos;
      let t0 = 0, t1 = best;
      const slab = (o, d, h) => { if (Math.abs(d) < 1e-9) return Math.abs(o) <= h; let a = (-h - o) / d, b = (h - o) / d; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; return t0 <= t1; };
      if (slab(lox, ldx, c.hx) && slab(loy, dy, c.hy) && slab(loz, ldz, c.hz) && t0 < best) best = t0;
    }
    return best;
  }
}
