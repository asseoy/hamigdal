// Deterministic tower generator: 50 floors spiralling up around a central lashed-pole core.
// Produces plain data (pieces); level.js turns it into meshes + colliders.
import { rng, clamp, lerp, FLOORS, zoneOf } from './ctx.js';

export const CORE = 4.6;          // half size of the central core
const TH = 0.45;                  // platform thickness

const STYLE = [
  { plat: 'pine', crate: 'wood', wall: 'tarp', pole: 'log', beam: 'log' },
  { plat: 'sand', crate: 'sand', wall: 'sand', pole: 'log', beam: 'wood' },
  { plat: 'blue', crate: 'white', wall: 'blue', pole: 'candle', beam: 'white' },
  { plat: 'dark', crate: 'dark', wall: 'dark', pole: 'log', beam: 'log' },
  { plat: 'white', crate: 'white', wall: 'tarpO', pole: 'log', beam: 'white' },
];
const PALETTE = [
  ['gaps', 'gaps', 'stairs', 'beam', 'ledge', 'wallrun', 'rope', 'chimney', 'net', 'movers', 'bounce', 'bridge', 'poles'],
  ['gaps', 'poles', 'poles', 'wallrun', 'wallrun', 'rope', 'rope2', 'wind', 'crumble', 'chimney', 'dbl', 'ledge', 'movers', 'beam'],
  ['spin', 'spin', 'bounce', 'gaps', 'poles', 'wallrun', 'rope', 'movers', 'dbl', 'net', 'crumble', 'chimney'],
  ['crumble', 'rope2', 'wallrun', 'wallrun', 'chimney', 'poles', 'beam', 'movers', 'gaps', 'rope', 'dbl', 'spin'],
  ['wind', 'wind', 'rope2', 'wallrun', 'crumble', 'movers', 'spin', 'beam', 'bridge', 'bounce', 'poles', 'chimney'],
];
// zone 0 teaches one mechanic at a time
const TUTOR = [
  ['gaps', 'stairs', 'gaps'], ['gaps', 'beam', 'ledge'], ['wallrun', 'gaps', 'stairs'], ['rope', 'gaps', 'ledge'],
  ['chimney', 'beam', 'gaps'], ['net', 'movers', 'gaps'], ['bounce', 'poles', 'wallrun'], ['bridge', 'rope', 'dbl'],
];
const SIGNS = {
  wallrun: ['רוץ לאורך הקיר', 'קפוץ אליו והחזק קדימה'], rope: ['קפוץ על החבל', 'רווח – משחררים'], chimney: ['ניתור בין הקירות', 'רווח כשנוגעים בקיר'],
  net: ['טפס על הרשת', 'הולכים לתוכה'], bounce: ['ברזנט קפיצה', 'נוחתים עליו'], ledge: ['תפיסת קצה', 'קופצים אל הקצה'], beam: ['קורה צרה', 'לאט ובזהירות'],
  movers: ['במות זזות', 'מחכים לרגע הנכון'], bridge: ['גשר חבלים', ''], dbl: ['קפיצה כפולה', 'רווח פעמיים'],
};

export function generate(seed = 67) {
  const r = rng(seed);
  const pieces = [], floors = [], segs = [];
  const bounds = [];                       // {x0,y0,z0,x1,y1,z1, id}
  let nextId = 1;

  const push = (p) => { p.id = nextId++; pieces.push(p); return p; };
  const B = (p) => {                       // world AABB of a piece
    if (p.t === 'rope') return { x0: p.x - 3.5, x1: p.x + 3.5, z0: p.z - 3.5, z1: p.z + 3.5, y0: p.y - p.L - 0.5, y1: p.y + 0.3 };
    if (p.t === 'box' || p.t === 'mover' || p.t === 'spin' || p.t === 'crumble') {
      let hx = p.w / 2, hz = p.d / 2;
      if (p.t === 'spin') { hx = hz = Math.hypot(hx, hz); }
      const c = Math.abs(Math.cos(p.yaw || 0)), s = Math.abs(Math.sin(p.yaw || 0)), ex = c * hx + s * hz, ez = s * hx + c * hz;
      let ax = 0, az = 0, ay = 0; if (p.t === 'mover') { ax = Math.abs(p.ax * p.amp); az = Math.abs(p.az * p.amp); ay = Math.abs(p.ay * p.amp); }
      return { x0: p.x - ex - ax, x1: p.x + ex + ax, z0: p.z - ez - az, z1: p.z + ez + az, y0: p.y - p.h / 2 - ay, y1: p.y + p.h / 2 + ay };
    }
    return null;
  };

  function overlaps(cands, skip) {
    for (const p of cands) {
      const b = B(p); if (!b || p.noCheck) continue;
      const rad = Math.hypot((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      if (Math.max(Math.abs((b.x0 + b.x1) / 2), Math.abs((b.z0 + b.z1) / 2)) - Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 < CORE + 1.6) return true;
      if (rad > 30) return true;
      for (let i = bounds.length - 1; i >= 0; i--) {
        const o = bounds[i]; if (o.id === skip) continue;
        if (o.y1 + 2.6 < b.y0 - 0.3 || b.y1 + 2.6 < o.y0 - 0.3) continue;    // headroom both ways
        if (o.x1 + 0.7 < b.x0 || b.x1 + 0.7 < o.x0 || o.z1 + 0.7 < b.z0 || b.z1 + 0.7 < o.z0) continue;
        return true;
      }
    }
    return false;
  }
  function commit(cands) { for (const p of cands) { push(p); const b = B(p); if (b && !p.noCheck) { b.id = p.id; bounds.push(b); } } }

  // ---------- segment builders: local frame (a = along heading, l = lateral) ----------
  function frame(c, h) {
    const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    const ox = c.x + fx * c.half, oz = c.z + fz * c.half;
    return { h, W: (a, l) => ({ x: ox + fx * a + rx * l, z: oz + fz * a + rz * l }) };
  }
  const plat = (L, x, top, z, w, d, yaw, mat, tags = {}, deco = true) => {
    const p = { t: 'box', x, y: top - TH / 2, z, w, h: TH, d, yaw, mat, tags, deco };
    L.push(p); return p;
  };
  const block = (L, x, top, z, w, d, yaw, mat, depth, tags = {}) => { const p = { t: 'box', x, y: top - depth / 2, z, w, h: depth, d, yaw, mat, tags, deco: true, block: true }; L.push(p); return p; };

  const SEG = {
    gaps(c, h, d, st) {
      const L = [], F = frame(c, h); let a = 0, l = 0, y = c.y, p, s; const n = r.int(3, 4);
      for (let i = 0; i < n; i++) {
        const gap = lerp(1.6, 3.3, d) + r() * 0.5; s = lerp(2.5, 1.6, d) + r() * 0.4;
        l = clamp(l + r.range(-1.2, 1.2), -2, 2); a += gap + s / 2; y += r.range(-0.2, lerp(0.6, 1.0, d));
        p = F.W(a, l); plat(L, p.x, y, p.z, s, s, h, st.plat); a += s / 2;
      }
      return { L, end: { x: p.x, y, z: p.z, h, half: s / 2 } };
    },
    stairs(c, h, d, st) {
      const L = [], F = frame(c, h); let a = 0, y = c.y, p, l = 0; const n = r.int(4, 5), s = 1.7;
      for (let i = 0; i < n; i++) { a += r.range(0.8, 1.5) + s / 2; y += r.range(1.1, 1.45); l = clamp(l + r.range(-0.8, 0.8), -1.5, 1.5); p = F.W(a, l); block(L, p.x, y, p.z, s, s, h, st.crate, 1.2); a += s / 2; }
      return { L, end: { x: p.x, y, z: p.z, h, half: s / 2 } };
    },
    dbl(c, h, d, st) {
      const L = [], F = frame(c, h); let a = 0, y = c.y, p; const s = 2.3;
      for (let i = 0; i < 2; i++) { a += r.range(1.5, 2.3) + s / 2; y += r.range(2.4, 3.0); p = F.W(a, r.range(-1, 1)); block(L, p.x, y, p.z, s, s, h, st.crate, 3.4); a += s / 2; }
      return { L, end: { x: p.x, y, z: p.z, h, half: s / 2 } };
    },
    beam(c, h, d, st) {
      const L = [], F = frame(c, h), wB = lerp(0.6, 0.32, d), y = c.y, L1 = r.range(5, 8);
      const m1 = F.W(L1 / 2 + 0.2, 0);
      L.push({ t: 'box', x: m1.x, y: y - 0.15, z: m1.z, w: wB, h: 0.3, d: L1 + 0.4, yaw: h, mat: st.beam, tags: {}, log: st.beam === 'log', beam: true });
      const j = F.W(L1 + 0.2 + 0.6, 0); plat(L, j.x, y, j.z, 1.2, 1.2, h, st.plat, {}, false);
      const h2 = h + r.sign() * r.range(0.6, 1.1), L2 = r.range(4, 7), f2 = { x: Math.sin(h2), z: Math.cos(h2) };
      const m2 = { x: j.x + f2.x * (0.6 + L2 / 2), z: j.z + f2.z * (0.6 + L2 / 2) };
      L.push({ t: 'box', x: m2.x, y: y - 0.15, z: m2.z, w: wB, h: 0.3, d: L2 + 0.2, yaw: h2, mat: st.beam, tags: {}, log: st.beam === 'log', beam: true });
      const e = { x: j.x + f2.x * (0.6 + L2 + 1.15), z: j.z + f2.z * (0.6 + L2 + 1.15) };
      plat(L, e.x, y, e.z, 2.3, 2.3, h2, st.plat);
      return { L, end: { x: e.x, y, z: e.z, h: h2, half: 1.15 } };
    },
    poles(c, h, d, st) {
      const L = [], F = frame(c, h); let a = 0, l = 0, y = c.y, p; const n = r.int(4, 6);
      for (let i = 0; i < n; i++) {
        a += lerp(1.7, 2.5, d) + r() * 0.3 + 0.4; l = clamp(l + r.range(-1, 1), -1.8, 1.8); y += r.range(-0.3, 0.6); p = F.W(a, l);
        L.push({ t: 'box', x: p.x, y: y - 2.5, z: p.z, w: 0.8, h: 5, d: 0.8, yaw: 0, mat: st.pole, tags: { noLedge: true }, pole: true });
        a += 0.4;
      }
      a += 2.0 + 1.2; y += 0.3; p = F.W(a, l * 0.5); plat(L, p.x, y, p.z, 2.4, 2.4, h, st.plat);
      return { L, end: { x: p.x, y, z: p.z, h, half: 1.2 } };
    },
    wallrun(c, h, d, st) {
      const L = [], F = frame(c, h), s = r.sign(), wl = 13, gap = r.range(10.4, 11.4);
      const wc = F.W(0.3 + wl / 2, s * 1.5);
      L.push({ t: 'box', x: wc.x, y: c.y + 1.3, z: wc.z, w: 0.36, h: 5.2, d: wl, yaw: h, mat: st.wall, tags: { wall: true, noLedge: true }, wallPanel: true });
      const y = c.y - 0.3 + r.range(0, 0.6), e = F.W(gap + 1.6, -s * 0.45);
      plat(L, e.x, y, e.z, 3.2, 3.2, h, st.plat);
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.6 }, sign: 'wallrun', side: s };
    },
    chimney(c, h, d, st) {
      const L = [], F = frame(c, h), Hc = r.range(6.8, 8.4), y = c.y;
      const fl = F.W(0.6 + 1.3, 0); plat(L, fl.x, y, fl.z, 2.1, 2.6, h, st.plat, {}, false);
      for (const s of [-1, 1]) { const w = F.W(1.9, s * 1.25); L.push({ t: 'box', x: w.x, y: y + (Hc - 1) / 2, z: w.z, w: 0.4, h: Hc + 1, d: 2.6, yaw: h, mat: st.wall, tags: { wall: true, noRun: true }, wallPanel: true }); }
      const ty = y + Hc - 0.7, e = F.W(0.6 + 2.6 + 0.35 + 1.5, 0); plat(L, e.x, ty, e.z, 3, 3, h, st.plat);
      return { L, end: { x: e.x, y: ty, z: e.z, h, half: 1.5 }, sign: 'chimney' };
    },
    ledge(c, h, d, st) {
      const L = [], F = frame(c, h), tall = d > 0.35 && r() < 0.35, hg = tall ? r.range(4.1, 4.5) : r.range(2.5, 3.1);
      const y = c.y + hg, e = F.W(r.range(0.7, 1.2) + 1.3, r.range(-0.8, 0.8)); block(L, e.x, y, e.z, 2.6, 2.6, h, st.crate, hg + 2.5);
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.3 }, sign: 'ledge' };
    },
    net(c, h, d, st) {
      const L = [], F = frame(c, h), hg = r.range(5, 6.8), y = c.y + hg, gap = 0.5, e = F.W(gap + 1.3, 0);
      block(L, e.x, y, e.z, 2.6, 2.6, h, st.crate, hg + 1.5, { climb: true });
      const n = F.W(gap - 0.03, 0); L.push({ t: 'net', x: n.x, y: c.y + hg / 2, z: n.z, w: 2.5, h: hg, yaw: h });
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.3 }, sign: 'net' };
    },
    rope(c, h, d, st) {
      const L = [], F = frame(c, h), gap = r.range(9.5, 10.8), pv = F.W(gap * 0.42, 0);
      L.push({ t: 'rope', x: pv.x, y: c.y + 8.2, z: pv.z, L: 6.8 });
      const y = c.y + r.range(-0.6, 0.3), e = F.W(gap + 1.6, 0); plat(L, e.x, y, e.z, 3.2, 3.2, h, st.plat);
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.6 }, sign: 'rope' };
    },
    rope2(c, h, d, st) {
      const L = [], F = frame(c, h), gap = r.range(15.5, 17), p1 = F.W(gap * 0.3, 0), p2 = F.W(gap * 0.67, r.range(-0.6, 0.6));
      L.push({ t: 'rope', x: p1.x, y: c.y + 8.2, z: p1.z, L: 6.8 }); L.push({ t: 'rope', x: p2.x, y: c.y + 8.4, z: p2.z, L: 6.8 });
      const y = c.y + r.range(-0.5, 0.3), e = F.W(gap + 1.6, 0); plat(L, e.x, y, e.z, 3.2, 3.2, h, st.plat);
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.6 } };
    },
    movers(c, h, d, st) {
      const L = [], F = frame(c, h); let a = 0, y = c.y; const n = r.int(2, 3), s = 2.3, per = r.range(3.4, 4.6), vert = r() < 0.3;
      for (let i = 0; i < n; i++) {
        a += 2.0 + s / 2; y += 0.3; const p = F.W(a, 0);
        const m = { t: 'mover', x: p.x, y: y - TH / 2, z: p.z, w: s, h: TH, d: s, yaw: h, mat: st.plat, tags: {}, per, ph: i / n * per * 0.5 + r() * 0.3 };
        if (vert) { m.ax = 0; m.az = 0; m.ay = 1; m.amp = 1.4; } else { m.ax = Math.cos(h); m.az = -Math.sin(h); m.ay = 0; m.amp = r.range(2.2, 3.0); }
        L.push(m); a += s / 2;
      }
      a += 2.0 + 1.3; y += 0.3; const e = F.W(a, 0); plat(L, e.x, y, e.z, 2.6, 2.6, h, st.plat);
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.3 }, sign: 'movers' };
    },
    spin(c, h, d, st) {
      const L = [], F = frame(c, h); let a = 0, y = c.y; const n = r.int(2, 3), s = 2.8, dir = r.sign();
      for (let i = 0; i < n; i++) { a += (i === 0 ? 2.2 : 3.0) + s / 2 + (i ? 0.6 : 0.6); y += 0.4; const p = F.W(a, 0); L.push({ t: 'spin', x: p.x, y: y - 0.8, z: p.z, w: s, h: 1.6, d: s, yaw: r() * 3, mat: 'dreidel', tags: {}, speed: dir * (i % 2 ? -1 : 1) * r.range(0.8, 1.4) }); a += s / 2; }
      a += 2.6 + 1.3; y += 0.3; const e = F.W(a, 0); plat(L, e.x, y, e.z, 2.6, 2.6, h, st.plat);
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.3 } };
    },
    crumble(c, h, d, st) {
      const L = [], F = frame(c, h); let a = 0, l = 0, y = c.y; const n = r.int(3, 5), s = 1.8;
      for (let i = 0; i < n; i++) { a += r.range(1.6, 2.3) + s / 2; y += r.range(-0.2, 0.4); l = clamp(l + r.range(-1, 1), -1.5, 1.5); const p = F.W(a, l); L.push({ t: 'crumble', x: p.x, y: y - 0.15, z: p.z, w: s, h: 0.3, d: s, yaw: h, mat: 'wood', tags: {} }); a += s / 2; }
      a += 2.0 + 1.3; y += 0.3; const e = F.W(a, l * 0.5); plat(L, e.x, y, e.z, 2.6, 2.6, h, st.plat);
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.3 } };
    },
    bounce(c, h, d, st, z) {
      const L = [], F = frame(c, h), rise = r.range(6.5, 8), pad = F.W(1.2, 0);
      L.push({ t: 'box', x: pad.x, y: c.y - 0.3 - 0.15, z: pad.z, w: 2.4, h: 0.3, d: 2.4, yaw: h, mat: 'tarpO', tags: { bounce: Math.sqrt(2 * 30 * (rise + 1.7)) }, pad: z === 2 ? 'donut' : z === 4 ? 'cloud' : 'tramp' });
      const y = c.y + rise, e = F.W(2.4 + 2.6 + 1.6, 0); block(L, e.x, y, e.z, 3.2, 3.2, h, st.crate, 2.4);
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.6 }, sign: 'bounce' };
    },
    bridge(c, h, d, st) {
      const L = [], F = frame(c, h), len = r.range(10, 13.5), y = c.y, holes = d > 0.35 ? r.int(1, 2) : 0;
      const cuts = []; for (let i = 0; i < holes; i++) cuts.push(len * (i + 1) / (holes + 1));
      let a0 = 0; const segs = [];
      for (const cu of cuts) { segs.push([a0, cu - 0.7]); a0 = cu + 0.7; } segs.push([a0, len]);
      for (const [s0, s1] of segs) { const m = F.W((s0 + s1) / 2, 0); L.push({ t: 'box', x: m.x, y: y - 0.06, z: m.z, w: 1.3, h: 0.12, d: s1 - s0, yaw: h, mat: 'wood', tags: {}, bridge: true }); }
      const r0 = F.W(len / 2, 0); L.push({ t: 'rails', x: r0.x, y, z: r0.z, len, yaw: h, noCheck: true });
      const e = F.W(len + 1.2, 0); plat(L, e.x, y, e.z, 2.4, 2.4, h, st.plat);
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.2 }, sign: 'bridge' };
    },
    wind(c, h, d, st) {
      const L = [], F = frame(c, h), len = r.range(12, 15), wdt = lerp(1.7, 1.15, d), y = c.y, s = r.sign();
      const m = F.W(len / 2, 0); L.push({ t: 'box', x: m.x, y: y - 0.2, z: m.z, w: wdt, h: 0.4, d: len, yaw: h, mat: st.beam === 'log' ? 'wood' : st.beam, tags: {} });
      L.push({ t: 'wind', x: m.x, y: y + 2.5, z: m.z, w: wdt + 6, h: 6, d: len + 2, yaw: h, dx: Math.cos(h) * s, dz: -Math.sin(h) * s, k: lerp(5, 8.5, d), noCheck: true });
      const e = F.W(len + 1.3, 0); plat(L, e.x, y, e.z, 2.6, 2.6, h, st.plat);
      return { L, end: { x: e.x, y, z: e.z, h, half: 1.3 } };
    },
    connector(c, h, d, st) {
      const L = [], F = frame(c, h), p = F.W(2.2 + 1.2, 0), y = c.y + 1.0; plat(L, p.x, y, p.z, 2.4, 2.4, h, st.plat);
      return { L, end: { x: p.x, y, z: p.z, h, half: 1.2 } };
    },
  };

  // ---------- floors ----------
  const startR = 15, a0 = 0.3;
  let cur = { x: Math.sin(a0) * startR, y: 1.2, z: Math.cos(a0) * startR, h: a0 + Math.PI / 2, half: 2.2 };
  const signed = new Set();
  function tangentHeading(c) {
    const th = Math.atan2(c.x, c.z), rad = Math.hypot(c.x, c.z);
    return th + Math.PI / 2 + clamp((rad - 15) / 9, -0.7, 0.7);
  }

  for (let f = 1; f <= FLOORS; f++) {
    const z = zoneOf(f), st = STYLE[z], d = (f - 1) / (FLOORS - 1);
    // checkpoint platform
    const cpL = [];
    const cp = plat(cpL, cur.x, cur.y, cur.z, 4.4, 4.4, cur.h, st.plat, { cp: f });
    cp.checkpoint = f;
    if (f === 1) { commit(cpL); } else commit(cpL);
    floors.push({ floor: f, x: cur.x, y: cur.y, z: cur.z, h: cur.h, zone: z, cpId: cp.id });
    const fl = floors[floors.length - 1];
    fl.flag = push({ t: 'flag', x: cur.x, y: cur.y, z: cur.z, yaw: cur.h, floor: f, zone: z, gate: f % 10 === 1 });
    cur = { x: cur.x, y: cur.y, z: cur.z, h: cur.h, half: 2.2 };
    let lastId = cp.id;
    const list = f <= TUTOR.length ? TUTOR[f - 1].slice() : null;
    const nseg = list ? list.length : 3 + Math.floor(d * 2.6) + (f % 10 === 0 ? 1 : 0);
    for (let s = 0; s < nseg; s++) {
      let done = false;
      for (let tr = 0; tr < 26 && !done; tr++) {
        const type = list && tr < 8 ? list[s] : (tr < 22 ? r.pick(PALETTE[z]) : 'connector');
        const h = tangentHeading(cur) + (tr === 0 ? r.range(-0.3, 0.3) : r.range(-0.9, 0.9));
        const res = SEG[type](cur, h, d, st, z);
        if (overlaps(res.L, lastId) && tr < 25) continue;
        commit(res.L);
        segs.push({ floor: f, type, from: { x: cur.x, y: cur.y, z: cur.z, h: cur.h, half: cur.half }, h, end: res.end, side: res.side || 0, way: res.L.filter(p => ['box', 'mover', 'spin', 'crumble'].includes(p.t) && !p.wallPanel && !p.pole || p.pole) });
        if (res.sign && !signed.has(res.sign) && z === 0 && SIGNS[res.sign]) {
          signed.add(res.sign);
          const sx = cur.x + Math.sin(cur.h) * 0 , sz = cur.z;
          push({ t: 'sign', x: sx, y: cur.y, z: sz, yaw: res.end.h, lines: SIGNS[res.sign], behind: { x: cur.x, z: cur.z, h, half: cur.half } });
        }
        const lastPlat = res.L.filter(p => p.t === 'box').pop();
        lastId = lastPlat ? lastPlat.id : lastId;
        cur = res.end; done = true;
      }
    }
    // gap to the next checkpoint
    const h = tangentHeading(cur), F = frame(cur, h); const e = F.W(2.0 + 2.2, 0);
    cur = { x: e.x, y: cur.y + 0.6, z: e.z, h, half: 2.2 };
  }
  // summit
  const sL = []; const sp = plat(sL, cur.x, cur.y, cur.z, 8, 8, cur.h, 'white', { summit: true }); commit(sL);
  push({ t: 'summit', x: cur.x, y: cur.y, z: cur.z, yaw: cur.h });
  const top = cur.y;
  return { pieces, floors, segs, top, summit: { x: cur.x, y: cur.y, z: cur.z } };
}
