// Parkour controller: run, jump, double jump (flip), slide/long jump, wall run, wall jump, ledge grab + mantle,
// vault, rope swing, net climb, moving/rotating platforms, bounce pads, crumbling planks.
import * as THREE from 'three';
import { G, clamp, lerp, dampAng, smooth } from './ctx.js';
import { input } from './input.js';

export const R = 0.34, H = 1.8;
const RUN = 8.4, GRAV = 30, JUMP = 11.2, DJUMP = 10.4, MAXFALL = 38;
const tmp = { nx: 0, nz: 0, depth: 0 }, windV = new THREE.Vector3();

export function createPlayer() {
  const P = {
    pos: new THREE.Vector3(0, 2, 0), vel: new THREE.Vector3(), yaw: 0, state: 'move',
    grounded: false, ground: null, coyote: 0, jumpBuf: 0, canDouble: true, jumpHeld: false, cutDone: true,
    contacts: [], wallT: 9, wallN: { x: 0, z: 0 }, wallC: null, cool: new Map(),
    wr: { t: 0, tx: 0, tz: 0, speed: 0, side: 1, c: null, lost: 0 },
    ledge: null, mantle: null, rope: null, climb: null, slideT: 0, lockT: 0,
    flipT: -1, rollT: -1, wallJumpT: -1, landT: -1, landK: 0, airT: 0, speedH: 0,
    ev: [], hp: new THREE.Vector3(), hv: new THREE.Vector3(),
  };
  G.player = P;
  const W = () => G.world;
  const emit = (type, o = {}) => { o.type = type; P.ev.push(o); };
  const cooled = (c) => (P.cool.get(c) || 0) > G.t;
  const cool = (c, s) => P.cool.set(c, G.t + s);

  P.place = (x, y, z, yaw = 0) => {
    P.pos.set(x, y, z); P.vel.set(0, 0, 0); P.yaw = yaw; P.state = 'move'; P.grounded = false; P.ground = null;
    P.rope = P.ledge = P.mantle = P.climb = null; P.flipT = P.rollT = -1; P.slideT = 0; P.canDouble = true; P.airT = 0;
  };

  // is a standing cylinder at (x, y..y+h, z) free of solids?
  function free(x, y, z, r, h) {
    const list = W().query(x - r - 1, y, z - r - 1, x + r + 1, y + h, z + r + 1);
    for (const c of list) {
      if (c.tags.ghost) continue;
      const top = c.y + c.hy, bot = c.y - c.hy;
      if (top <= y + 0.02 || bot >= y + h) continue;
      if (W().push(c, x, z, r, tmp)) return false;
    }
    return true;
  }
  P.free = free;

  function wish() {
    const cy = G.cam ? G.cam.yaw : 0;
    // camera looks along (-sin cy, -cos cy); right is (cos cy, -sin cy)
    const fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    let x = fx * input.f + rx * input.s, z = fz * input.f + rz * input.s; const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    return { x, z, l: Math.min(1, l) };
  }

  // ---------------- collision step ----------------
  function collide(dt, opts = {}) {
    const w = W(); P.contacts.length = 0;
    const sp = Math.hypot(P.vel.x, P.vel.y, P.vel.z) * dt;
    const n = Math.max(1, Math.ceil(sp / 0.18));
    const sdt = dt / n; let landed = null, bonk = false;
    const wasGrounded = P.grounded;
    for (let s = 0; s < n; s++) {
      // vertical
      const prevFeet = P.pos.y, prevHead = P.pos.y + H;
      P.pos.y += P.vel.y * sdt;
      let list = w.query(P.pos.x - 1.5, Math.min(prevFeet, P.pos.y) - 1, P.pos.z - 1.5, P.pos.x + 1.5, Math.max(prevHead, P.pos.y + H) + 1, P.pos.z + 1.5);
      for (const c of list) {
        if (c.tags.ghost) continue;
        const top = c.y + c.hy, bot = c.y - c.hy;
        if (!w.over(c, P.pos.x, P.pos.z, R * 0.8)) continue;
        if (P.vel.y <= 0 && prevFeet >= top - 0.08 && P.pos.y < top) { P.pos.y = top; P.vel.y = 0; landed = c; }
        else if (P.vel.y > 0 && prevHead <= bot + 0.08 && P.pos.y + H > bot) { P.pos.y = bot - H; P.vel.y = 0; bonk = true; }
      }
      // horizontal
      P.pos.x += P.vel.x * sdt; P.pos.z += P.vel.z * sdt;
      for (let it = 0; it < 3; it++) {
        list = w.query(P.pos.x - 1.5, P.pos.y - 0.5, P.pos.z - 1.5, P.pos.x + 1.5, P.pos.y + H + 0.5, P.pos.z + 1.5);
        let any = false;
        for (const c of list) {
          if (c.tags.ghost) continue;
          const top = c.y + c.hy, bot = c.y - c.hy;
          if (top <= P.pos.y + 0.03 || bot >= P.pos.y + H) continue;
          const r = w.push(c, P.pos.x, P.pos.z, R, tmp); if (!r) continue;
          const step = top - P.pos.y;
          if ((wasGrounded || landed) && step <= 0.45 && !opts.noStep && free(P.pos.x, top, P.pos.z, R * 0.9, H)) { P.pos.y = top; landed = landed || c; continue; }
          P.pos.x += r.nx * r.depth; P.pos.z += r.nz * r.depth;
          const vn = P.vel.x * r.nx + P.vel.z * r.nz; if (vn < 0) { P.vel.x -= r.nx * vn; P.vel.z -= r.nz * vn; }
          let ct = P.contacts.find(q => q.c === c); if (!ct) P.contacts.push({ c, nx: r.nx, nz: r.nz }); else { ct.nx = r.nx; ct.nz = r.nz; }
          any = true;
        }
        if (!any) break;
      }
    }
    // ground probe (stick to ground / moving platforms going down)
    if (!landed && P.vel.y <= 0 && (wasGrounded || opts.probe)) {
      const list = w.query(P.pos.x - 1.5, P.pos.y - 0.6, P.pos.z - 1.5, P.pos.x + 1.5, P.pos.y + 0.3, P.pos.z + 1.5);
      let best = null, bt = -1e9;
      for (const c of list) {
        if (c.tags.ghost) continue;
        const top = c.y + c.hy;
        if (top > P.pos.y + 0.05 || top < P.pos.y - (wasGrounded ? 0.3 : 0.06)) continue;
        if (!w.over(c, P.pos.x, P.pos.z, R * 0.8)) continue;
        if (top > bt) { bt = top; best = c; }
      }
      if (best) { P.pos.y = bt; P.vel.y = 0; P.ground = best; return { landed: null, ground: best, bonk }; }
    }
    return { landed, ground: landed, bonk };
  }

  // ------------- helpers for wall-ish contacts -------------
  const isWall = c => c.tags.wall || (!c.tags.climb && c.hy * 2 >= 2.2 && c.type === 'box');
  function wallContact(pred) {
    for (const ct of P.contacts) if (pred(ct)) return ct;
    return null;
  }
  function edgePoint(ct) {           // point on the collider surface we touch
    return { x: P.pos.x - ct.nx * R, z: P.pos.z - ct.nz * R };
  }

  function doWallJump(nx, nz, tx = 0, tz = 0, tspeed = 0) {
    P.vel.x = nx * 7.6 + tx * tspeed; P.vel.z = nz * 7.6 + tz * tspeed; P.vel.y = 11.4;
    P.state = 'move'; P.grounded = false; P.canDouble = true; P.lockT = 0.2; P.cutDone = true;
    P.yaw = Math.atan2(P.vel.x, P.vel.z); P.wallJumpT = 0; P.flipT = -1;
    if (P.wallC) cool(P.wallC, 0.32);
    emit('walljump');
  }

  function startMantle(top, nx, nz, kind) {
    const ep = { x: P.pos.x - nx * R, z: P.pos.z - nz * R };
    const inset = kind === 'vault' ? 0.75 : 0.6;
    P.mantle = { t: 0, dur: kind === 'vault' ? 0.3 : 0.44, kind, x0: P.pos.x, y0: P.pos.y, z0: P.pos.z,
      x1: ep.x - nx * inset, y1: top, z1: ep.z - nz * inset, keep: kind === 'vault' ? Math.max(P.speedH, 6) : 2.5, nx, nz };
    P.state = 'mantle'; P.ledge = null; P.vel.set(0, 0, 0); P.yaw = Math.atan2(-nx, -nz); P.flipT = -1;
    emit(kind === 'vault' ? 'vault' : 'mantle');
  }

  function tryLedge(wv) {
    if (P.vel.y > 6) return false;
    for (const ct of P.contacts) {
      const c = ct.c; if (c.tags.climb || c.tags.noLedge || cooled(c)) continue;
      const top = c.y + c.hy, rel = top - P.pos.y;
      if (rel < 0.25 || rel > 2.3) continue;
      const toward = wv.x * -ct.nx + wv.z * -ct.nz, face = Math.sin(P.yaw) * -ct.nx + Math.cos(P.yaw) * -ct.nz;
      if (toward < 0.2 && face < 0.55) continue;
      const ep = edgePoint(ct);
      if (!free(ep.x - ct.nx * 0.6, top + 0.02, ep.z - ct.nz * 0.6, R * 0.8, H - 0.1)) continue;
      if (rel < 1.05) { if (toward > 0.3) { startMantle(top, ct.nx, ct.nz, 'vault'); P.mantle.dur = 0.26; P.mantle.keep = Math.max(3, P.speedH); return true; } continue; }
      P.state = 'ledge'; P.ledge = { c, top, nx: ct.nx, nz: ct.nz, t: 0 };
      P.pos.y = top - 2.0; P.vel.set(0, 0, 0); P.yaw = Math.atan2(-ct.nx, -ct.nz); P.flipT = -1; P.canDouble = true;
      emit('grab');
      return true;
    }
    return false;
  }

  function tryRope() {
    const L = G.level; if (!L || !L.ropes) return false;
    const hx = P.pos.x, hy = P.pos.y + 1.8, hz = P.pos.z;
    for (const rp of L.ropes) {
      if (Math.abs(rp.pivot.x - hx) > 14 || Math.abs(rp.pivot.z - hz) > 14 || cooled(rp)) continue;
      const ax = rp.pivot.x, ay = rp.pivot.y, az = rp.pivot.z, bx = rp.bob.x, by = rp.bob.y, bz = rp.bob.z;
      const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz;
      let t = ((hx - ax) * dx + (hy - ay) * dy + (hz - az) * dz) / l2; t = clamp(t, 0.12, 1);
      const qx = ax + dx * t, qy = ay + dy * t, qz = az + dz * t;
      const d2 = (hx - qx) ** 2 + (hy - qy) ** 2 + (hz - qz) ** 2;
      if (d2 > 0.85 * 0.85) continue;
      P.state = 'rope'; P.rope = rp; P.ropeS = Math.max(1.4, Math.sqrt(l2) * t);
      P.hp.set(qx, qy, qz); P.hv.copy(P.vel);
      rp.held = true; P.canDouble = true; P.flipT = -1;
      emit('ropeGrab');
      return true;
    }
    return false;
  }

  function tryClimb(wv) {
    const ct = wallContact(q => q.c.tags.climb && !cooled(q.c) && (wv.x * -q.nx + wv.z * -q.nz) > 0.35);
    if (!ct) return false;
    P.state = 'climb'; P.climb = { c: ct.c, nx: ct.nx, nz: ct.nz, ph: 0 }; P.vel.set(0, 0, 0); P.yaw = Math.atan2(-ct.nx, -ct.nz); P.flipT = -1; P.canDouble = true;
    emit('grab');
    return true;
  }

  function onLand(c, impact) {
    P.ground = c; P.grounded = true; P.canDouble = true; P.cutDone = true; P.airT = 0;
    if (c.tags.bounce) { P.vel.y = c.tags.bounce; P.grounded = false; P.ground = null; emit('bounce', { c }); P.flipT = 0; P.canDouble = true; return; }
    if (c.tags.crumble) c.tags.crumble.touch();
    if (c.tags.cp) G.onCheckpoint && G.onCheckpoint(c.tags.cp, c);
    if (c.tags.summit) G.onSummit && G.onSummit();
    if (impact > 16.5 && P.speedH > 4.5) { P.rollT = 0; emit('roll', { impact }); }
    else if (impact > 4) { P.landT = 0; P.landK = clamp((impact - 4) / 16, 0.15, 1); }
    if (impact > 3) emit('land', { impact, c });
    P.flipT = -1;
  }

  // ---------------- main update ----------------
  P.update = (dt) => {
    P.ev.length = 0;
    const wv = wish();
    P.jumpBuf = input.jumpPressed ? 0.14 : Math.max(0, P.jumpBuf - dt);
    P.lockT = Math.max(0, P.lockT - dt); P.coyote = Math.max(0, P.coyote - dt); P.wallT += dt;
    if (P.flipT >= 0) { P.flipT += dt; if (P.flipT > 0.62) P.flipT = -1; }
    if (P.rollT >= 0) { P.rollT += dt; if (P.rollT > 0.6) P.rollT = -1; }
    if (P.wallJumpT >= 0) { P.wallJumpT += dt; if (P.wallJumpT > 0.4) P.wallJumpT = -1; }
    if (P.landT >= 0) { P.landT += dt; if (P.landT > 0.3) P.landT = -1; }

    // carried by platform
    if (P.grounded && P.ground && P.ground.dyn) {
      const g = P.ground;
      if (g.dyaw) { const dx = P.pos.x - g.x + g.dx, dz = P.pos.z - g.z + g.dz, c = Math.cos(g.dyaw), s = Math.sin(g.dyaw);
        P.pos.x = g.x - g.dx + dx * c + dz * s; P.pos.z = g.z - g.dz - dx * s + dz * c; P.yaw += g.dyaw; }
      P.pos.x += g.dx; P.pos.y += g.dy; P.pos.z += g.dz;
    }

    const st = P.state;
    if (st === 'move') moveState(dt, wv);
    else if (st === 'wallrun') wallrunState(dt, wv);
    else if (st === 'ledge') ledgeState(dt, wv);
    else if (st === 'mantle') mantleState(dt);
    else if (st === 'rope') ropeState(dt, wv);
    else if (st === 'climb') climbState(dt, wv);
    P.speedH = Math.hypot(P.vel.x, P.vel.z);
  };

  function moveState(dt, wv) {
    const g = P.grounded;
    // slide
    if (g && input.slidePressed && P.speedH > 4.5 && P.slideT <= 0) { P.slideT = 0.7; const s = Math.max(P.speedH, 11.5), a = Math.atan2(P.vel.x, P.vel.z); P.vel.x = Math.sin(a) * s; P.vel.z = Math.cos(a) * s; emit('slide'); }
    if (P.slideT > 0) { P.slideT -= dt; if (!g) P.slideT = Math.min(P.slideT, 0.05); }
    const sliding = P.slideT > 0 && g;

    // horizontal acceleration
    let tx = wv.x * RUN, tz = wv.z * RUN;
    let acc = g ? (wv.l > 0.05 ? 75 : 60) : (P.lockT > 0 ? 4 : 26);
    if (sliding) { acc = 9; tx = P.vel.x * 0.4; tz = P.vel.z * 0.4; }
    const wnd = G.level && G.level.windAt ? G.level.windAt(P.pos, windV) : null;
    if (wnd && g) { tx += wnd.x * 0.45; tz += wnd.z * 0.45; }
    if (!g && wv.l < 0.05) acc = 1.5;                       // keep momentum in the air
    else if (!g && P.lockT <= 0 && (wv.x * P.vel.x + wv.z * P.vel.z) < 0) acc = 40;   // pulling back brakes hard
    const over = !g && P.speedH > RUN && (tx * P.vel.x + tz * P.vel.z) > 0;   // keep (don't add to) speed from ropes/wall jumps
    if (over) { const s = P.speedH; let ux = P.vel.x / s + wv.x * 0.25, uz = P.vel.z / s + wv.z * 0.25; const ul = Math.hypot(ux, uz); tx = ux / ul * s; tz = uz / ul * s; }
    let dx = tx - P.vel.x, dz = tz - P.vel.z; const dl = Math.hypot(dx, dz), mx = acc * dt;
    if (dl > mx) { dx *= mx / dl; dz *= mx / dl; }
    P.vel.x += dx; P.vel.z += dz;
    if (wv.l > 0.1 && !sliding) P.yaw = dampAng(P.yaw, Math.atan2(wv.x, wv.z), g ? 16 : 7, dt);

    // jump / double jump / wall jump
    if (P.jumpBuf > 0) {
      if (g || P.coyote > 0) {
        const long = P.slideT > 0;
        P.vel.y = long ? JUMP * 0.92 : JUMP;
        if (long) { P.vel.x *= 1.08; P.vel.z *= 1.08; P.slideT = 0; }
        if (P.ground && P.ground.dyn) P.vel.y += Math.max(0, P.ground.dy / dt);
        P.grounded = false; P.ground = null; P.coyote = 0; P.jumpBuf = 0; P.cutDone = false;
        emit(long ? 'longjump' : 'jump');
      } else if (P.wallT < 0.14 && P.wallC && !cooled(P.wallC) && (!P.canDouble || (wv.x * P.wallN.x + wv.z * P.wallN.z) > -0.35)) {
        P.jumpBuf = 0; doWallJump(P.wallN.x, P.wallN.z, 0, 0, 0);
      } else if (P.canDouble) {
        P.vel.y = DJUMP; P.canDouble = false; P.jumpBuf = 0; P.cutDone = true; P.flipT = 0;
        if (wv.l > 0.1) { const s = Math.max(P.speedH, RUN * 0.92); P.vel.x = wv.x / wv.l * s; P.vel.z = wv.z / wv.l * s; P.yaw = Math.atan2(wv.x, wv.z); }
        emit('double');
      }
    }
    if (!P.cutDone && !input.jump && P.vel.y > 0) { P.vel.y *= 0.5; P.cutDone = true; }
    if (P.vel.y <= 0) P.cutDone = true;

    if (wnd && !g) { P.vel.x += wnd.x * dt; P.vel.z += wnd.z * dt; }
    // gravity
    if (!P.grounded) { P.vel.y -= GRAV * (P.vel.y < 0 ? 1.28 : 1) * dt; if (P.vel.y < -MAXFALL) P.vel.y = -MAXFALL; P.airT += dt; }
    const vyBefore = P.vel.y;
    const r = collide(dt);
    const wasG = P.grounded;
    if (r.landed) onLand(r.landed, -vyBefore);
    else if (r.ground) { P.grounded = true; P.ground = r.ground; }
    else { if (wasG && P.vel.y <= 0.01) P.coyote = 0.12; P.grounded = false; P.ground = null; }
    if (P.grounded && P.ground && P.ground.tags.bounce) { onLand(P.ground, 0); return; }

    // remember walls for wall jumps
    const wct = wallContact(q => isWall(q.c) || q.c.tags.climb);
    if (wct && !P.grounded) { P.wallT = 0; P.wallN.x = wct.nx; P.wallN.z = wct.nz; P.wallC = wct.c; }
    else if (!P.grounded) {
      const list = W().query(P.pos.x - 1.5, P.pos.y, P.pos.z - 1.5, P.pos.x + 1.5, P.pos.y + H, P.pos.z + 1.5);
      for (const c of list) { if (c.tags.ghost || !(isWall(c) || c.tags.climb)) continue; const top = c.y + c.hy, bot = c.y - c.hy; if (top <= P.pos.y + 0.3 || bot >= P.pos.y + H - 0.3) continue;
        const rr = W().push(c, P.pos.x, P.pos.z, R + 0.22, tmp); if (rr) { P.wallT = 0; P.wallN.x = rr.nx; P.wallN.z = rr.nz; P.wallC = c; break; } }
    }
    // wall slide: falling against a wall slows you a little (feels like grabbing at it)
    if (!P.grounded && P.wallT === 0 && P.vel.y < -4 && wct) P.vel.y = Math.max(P.vel.y, -7);

    if (P.grounded) {
      // vault low obstacles while running
      if (P.speedH > 3.5 && P.slideT <= 0) for (const ct of P.contacts) {
        const top = ct.c.y + ct.c.hy, rel = top - P.pos.y, toward = wv.x * -ct.nx + wv.z * -ct.nz;
        if (rel > 0.45 && rel < 1.35 && toward > 0.6 && !ct.c.tags.climb) { const ep = edgePoint(ct); if (free(ep.x - ct.nx * 0.75, top + 0.02, ep.z - ct.nz * 0.75, R * 0.8, H - 0.1)) { startMantle(top, ct.nx, ct.nz, 'vault'); return; } }
      }
      if (tryClimb(wv)) return;
      return;
    }
    // airborne options
    if (tryRope()) return;
    if (tryClimb(wv)) return;
    // wall run
    if (P.vel.y > -8 && P.lockT <= 0) {
      const ct = wallContact(q => isWall(q.c) && !q.c.tags.noRun && !cooled(q.c));
      if (ct) {
        const vs = Math.hypot(P.vel.x, P.vel.z) || 1, along = Math.abs((P.vel.x * ct.nx + P.vel.z * ct.nz) / vs);
        let tx2 = -ct.nz, tz2 = ct.nx; if (tx2 * P.vel.x + tz2 * P.vel.z < 0) { tx2 = -tx2; tz2 = -tz2; }
        const tsp = P.vel.x * tx2 + P.vel.z * tz2;
        const intent = (wv.x * tx2 + wv.z * tz2) > 0.2 || (wv.x * -ct.nx + wv.z * -ct.nz) > 0.3;
        if (along < 0.85 && tsp > 3.2 && intent) {
          P.state = 'wallrun'; Object.assign(P.wr, { t: 0, tx: tx2, tz: tz2, speed: Math.max(tsp, RUN * 1.02), c: ct.c, nx: ct.nx, nz: ct.nz, lost: 0 });
          P.wr.side = (tx2 * ct.nz - tz2 * ct.nx) > 0 ? 1 : -1;   // which hand is on the wall
          P.vel.y = Math.max(P.vel.y, 3.8); P.canDouble = true; P.flipT = -1;
          emit('wallrun');
          return;
        }
      }
    }
    if (tryLedge(wv)) return;
  }

  function wallrunState(dt, wv) {
    const w = P.wr; w.t += dt;
    w.speed = Math.max(RUN * 0.9, w.speed - dt * 1.2);
    P.vel.x = w.tx * w.speed - w.nx * 2.2; P.vel.z = w.tz * w.speed - w.nz * 2.2;
    P.vel.y -= (w.t < 0.6 ? 5 : 14) * dt;
    P.yaw = dampAng(P.yaw, Math.atan2(w.tx, w.tz), 18, dt);
    if (P.jumpBuf > 0) { P.jumpBuf = 0; P.wallC = w.c; doWallJump(w.nx, w.nz, w.tx, w.tz, w.speed * 0.75); return; }
    const vyb = P.vel.y;
    const r = collide(dt, { noStep: true });
    if (r.landed) { P.state = 'move'; onLand(r.landed, -vyb); return; }
    const ct = wallContact(q => isWall(q.c) && Math.abs(q.nx * w.nx + q.nz * w.nz) > 0.7);
    if (ct) { w.lost = 0; w.nx = ct.nx; w.nz = ct.nz; w.c = ct.c; P.wallT = 0; P.wallN.x = ct.nx; P.wallN.z = ct.nz; P.wallC = ct.c; }
    else w.lost += dt;
    const awayInput = (wv.x * w.nx + wv.z * w.nz) > 0.7;
    if (w.lost > 0.06 || w.t > 1.7 || P.vel.y < -9 || awayInput) {
      P.state = 'move'; cool(w.c, 0.45); P.vel.x = w.tx * w.speed + w.nx * 1.5; P.vel.z = w.tz * w.speed + w.nz * 1.5;
      if (w.lost > 0.06 && w.t > 0.15 && tryLedge(wv)) return;
    }
  }

  function ledgeState(dt, wv) {
    const L = P.ledge; L.t += dt;
    if (L.c.off) { P.state = 'move'; P.ledge = null; return; }
    // follow the collider if it moves
    if (L.c.dyn) { P.pos.x += L.c.dx; P.pos.y += L.c.dy; P.pos.z += L.c.dz; L.top = L.c.y + L.c.hy; }
    const toward = wv.x * -L.nx + wv.z * -L.nz;
    if (P.jumpBuf > 0 && toward < -0.3) { P.jumpBuf = 0; P.wallC = L.c; P.ledge = null; doWallJump(L.nx, L.nz); return; }
    if ((toward > 0.25 || P.jumpBuf > 0 || (input.f > 0 && L.t > 0.05)) && L.t > 0.08) { P.jumpBuf = 0; startMantle(L.top, L.nx, L.nz, 'climb'); return; }
    if (toward < -0.3 && !input.jump || input.slidePressed) { P.state = 'move'; cool(L.c, 0.4); P.ledge = null; P.vel.set(L.nx * 1.5, -1, L.nz * 1.5); }
  }

  function mantleState(dt) {
    const M = P.mantle; M.t += dt; const k = clamp(M.t / M.dur, 0, 1);
    if (M.kind === 'vault') {
      const e = smooth(k);
      P.pos.x = lerp(M.x0, M.x1, e); P.pos.z = lerp(M.z0, M.z1, e);
      P.pos.y = lerp(M.y0, M.y1, Math.min(1, k * 1.6)) + Math.sin(k * Math.PI) * 0.35;
    } else {
      const up = clamp(k / 0.6, 0, 1), fw = clamp((k - 0.45) / 0.55, 0, 1);
      P.pos.y = lerp(M.y0, M.y1, smooth(up)) + (fw > 0 ? 0 : 0);
      P.pos.x = lerp(M.x0, M.x1, smooth(fw)); P.pos.z = lerp(M.z0, M.z1, smooth(fw));
    }
    if (k >= 1) {
      P.state = 'move'; P.mantle = null; P.grounded = true;
      P.vel.set(-M.nx * M.keep, 0, -M.nz * M.keep);
      const r = collide(1 / 120, { probe: true }); if (r.ground || r.landed) { P.ground = r.ground || r.landed; if (P.ground.tags.cp) G.onCheckpoint && G.onCheckpoint(P.ground.tags.cp, P.ground); if (P.ground.tags.summit) G.onSummit && G.onSummit(); }
      emit('land', { impact: 4 });
    }
  }

  function ropeState(dt, wv) {
    const rp = P.rope, pv = rp.pivot;
    P.hv.y -= GRAV * dt;
    P.hv.x += wv.x * 7.5 * dt; P.hv.z += wv.z * 7.5 * dt;
    P.hv.multiplyScalar(1 - 0.1 * dt);
    P.hp.addScaledVector(P.hv, dt);
    const d = P.hp.clone().sub(pv), l = d.length() || 1; d.divideScalar(l);
    P.hp.copy(pv).addScaledVector(d, P.ropeS);
    const rv = P.hv.dot(d); P.hv.addScaledVector(d, -rv);
    // body hangs from the hands along the rope
    P.pos.copy(P.hp).addScaledVector(d, 1.85);
    P.pos.y = P.hp.y - 1.85 * Math.max(0.6, -d.y) - 0.05;
    P.vel.copy(P.hv);
    if (Math.hypot(P.hv.x, P.hv.z) > 0.6) P.yaw = dampAng(P.yaw, Math.atan2(P.hv.x, P.hv.z), 6, dt);
    else if (wv.l > 0.1) P.yaw = dampAng(P.yaw, Math.atan2(wv.x, wv.z), 4, dt);
    rp.bob.copy(pv).addScaledVector(d, rp.L); rp.bobV.copy(P.hv).multiplyScalar(rp.L / P.ropeS);
    if (P.jumpBuf > 0) {
      P.jumpBuf = 0; P.state = 'move'; rp.held = false; cool(rp, 0.6);
      P.vel.copy(P.hv).multiplyScalar(1.05); P.vel.y = Math.max(P.vel.y, 0) + 5.5;
      if (wv.l > 0.1) { P.vel.x += wv.x * 1.5; P.vel.z += wv.z * 1.5; }
      P.canDouble = true; P.rope = null; P.flipT = 0; P.cutDone = true;
      emit('ropeRelease');
      return;
    }
    // bumped into something solid while swinging -> let go
    let hit = false;
    const list = W().query(P.pos.x - 1, P.pos.y, P.pos.z - 1, P.pos.x + 1, P.pos.y + H, P.pos.z + 1);
    for (const c of list) { if (c.tags.ghost) continue; const top = c.y + c.hy, bot = c.y - c.hy; if (top <= P.pos.y + 0.3 || bot >= P.pos.y + H) continue; if (W().push(c, P.pos.x, P.pos.z, R, tmp)) { hit = true; break; } }
    if (hit) { P.state = 'move'; rp.held = false; cool(rp, 0.6); P.rope = null; P.vel.multiplyScalar(-0.2); }
  }

  function climbState(dt, wv) {
    const C = P.climb, c = C.c;
    const up = input.f, side = input.s;
    const cy = G.cam ? G.cam.yaw : 0, rx = Math.cos(cy), rz = -Math.sin(cy);
    let tx = -C.nz, tz = C.nx; if (tx * rx + tz * rz < 0) { tx = -tx; tz = -tz; }
    P.vel.set(tx * side * 2.6 - C.nx * 1.2, up * 3.8, tz * side * 2.6 - C.nz * 1.2);
    C.ph += dt * (Math.abs(up) * 3.8 + Math.abs(side) * 2.6) * 2.2;
    if (P.jumpBuf > 0) { P.jumpBuf = 0; P.state = 'move'; cool(c, 0.4); P.vel.set(C.nx * 6, 9.5, C.nz * 6); P.canDouble = true; P.yaw = Math.atan2(C.nx, C.nz); P.climb = null; emit('jump'); return; }
    const top = c.y + c.hy;
    if (P.pos.y + 1.55 > top && up >= 0) { startMantle(top, C.nx, C.nz, 'climb'); return; }
    const r = collide(dt, { noStep: true });
    if (r.landed && up < 0) { P.state = 'move'; P.climb = null; onLand(r.landed, 0); return; }
    const ct = P.contacts.find(q => q.c.tags.climb);
    if (!ct) { P.state = 'move'; P.climb = null; P.vel.set(0, 0, 0); return; }
    C.nx = ct.nx; C.nz = ct.nz; C.c = ct.c; P.yaw = dampAng(P.yaw, Math.atan2(-ct.nx, -ct.nz), 12, dt);
  }

  return P;
}
