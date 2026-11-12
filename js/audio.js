// All sound is synthesized: footsteps, whooshes, thuds, rope creaks, wind, and a fingerpicked campfire
// guitar that changes chords per zone.
import { G, clamp, save } from './ctx.js';

export function createAudio() {
  const A = { ctx: null, ok: false };
  let ctx, master, sfxBus, musicBus, noiseBuf, windGain, windFilter, speedGain;
  A.start = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    A.ctx = ctx; master = ctx.createGain(); master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(comp); musicBus = ctx.createGain(); musicBus.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.6 + b * 3; }
    // wind bed
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 400; windFilter.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0; src.connect(windFilter); windFilter.connect(windGain); windGain.connect(sfxBus); src.start();
    const src2 = ctx.createBufferSource(); src2.buffer = noiseBuf; src2.loop = true; src2.playbackRate.value = 1.3;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; speedGain = ctx.createGain(); speedGain.gain.value = 0;
    src2.connect(hp); hp.connect(speedGain); speedGain.connect(sfxBus); src2.start();
    A.ok = true; A.volumes();
    musicNext = ctx.currentTime + 0.3;
  };
  A.volumes = () => { if (!ctx) return; sfxBus.gain.value = save.settings.sfx; musicBus.gain.value = save.settings.music * 0.55; };

  function noise(t, dur, f0, f1, q, vol, type = 'bandpass', bus = sfxBus) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function tone(t, dur, f0, f1, vol, type = 'sine', bus = sfxBus) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  const surf = () => { const z = G.zoneBlend ? G.zoneBlend.zi : 0; return z === 1 ? 'sand' : z === 4 ? 'soft' : 'wood'; };

  A.play = (name, k = 1) => {
    if (!A.ok) return; const t = ctx.currentTime; const s = surf();
    switch (name) {
      case 'step': { const f = s === 'sand' ? 900 : s === 'soft' ? 500 : 1500; noise(t, 0.07, f, f * 0.6, 1.2, 0.22 * k); if (s === 'wood') tone(t, 0.06, 180 + Math.random() * 40, 120, 0.06 * k); break; }
      case 'wallstep': noise(t, 0.06, 1100, 700, 1.5, 0.2); tone(t, 0.05, 140, 90, 0.08); break;
      case 'jump': noise(t, 0.18, 600, 1600, 0.8, 0.12); break;
      case 'double': noise(t, 0.32, 400, 2400, 0.7, 0.18); noise(t + 0.05, 0.25, 1800, 3500, 2, 0.06); break;
      case 'land': { const v = clamp(k / 20, 0.15, 1); tone(t, 0.18 + v * 0.1, 95, 45, 0.5 * v); noise(t, 0.15 + v * 0.1, s === 'sand' ? 700 : 1100, 300, 0.9, 0.35 * v); break; }
      case 'roll': noise(t, 0.45, 500, 200, 0.7, 0.3); tone(t, 0.2, 90, 50, 0.3); break;
      case 'slide': noise(t, 0.6, 1400, 500, 0.6, 0.22); break;
      case 'walljump': noise(t, 0.2, 800, 2000, 1, 0.16); tone(t, 0.07, 160, 100, 0.12); break;
      case 'grab': noise(t, 0.05, 2200, 1500, 1.5, 0.25); tone(t, 0.04, 260, 200, 0.06); break;
      case 'mantle': noise(t, 0.25, 700, 400, 0.8, 0.12); break;
      case 'vault': noise(t, 0.2, 900, 1600, 0.9, 0.14); noise(t, 0.04, 2400, 1800, 1.5, 0.18); break;
      case 'ropeGrab': tone(t, 0.25, 110, 70, 0.12, 'sawtooth'); noise(t, 0.12, 1800, 1200, 2, 0.15); break;
      case 'ropeRelease': noise(t, 0.35, 500, 2600, 0.7, 0.18); break;
      case 'bounce': tone(t, 0.35, 140, 520, 0.28, 'triangle'); noise(t, 0.1, 400, 300, 1, 0.2); break;
      case 'creak': tone(t, 0.3, 220, 160, 0.06, 'sawtooth'); tone(t + 0.12, 0.25, 180, 140, 0.05, 'sawtooth'); break;
      case 'crack': noise(t, 0.25, 2500, 400, 0.6, 0.45); tone(t, 0.15, 110, 40, 0.3); break;
      case 'checkpoint': [0, 4, 7, 12].forEach((s2, i) => pluck(t + i * 0.07, 392 * Math.pow(2, s2 / 12), 0.28, sfxBus, 1.6)); break;
      case 'zone': [0, 4, 7, 12, 16, 19].forEach((s2, i) => pluck(t + i * 0.09, 294 * Math.pow(2, s2 / 12), 0.3, sfxBus, 2.4)); break;
      case 'respawn': noise(t, 0.5, 2600, 300, 0.7, 0.2); break;
      case 'summit': [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s2, i) => pluck(t + i * 0.12, 262 * Math.pow(2, s2 / 12), 0.35, sfxBus, 2.8)); break;
    }
  };
  // plucked string: two detuned oscillators through a closing low-pass
  function pluck(t, f, vol, bus = musicBus, len = 1.4) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(Math.min(9000, f * 9), t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.6), t + 0.35);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    for (const [type, det, v] of [['sawtooth', 0, 0.5], ['triangle', 4, 0.8]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; const og = ctx.createGain(); og.gain.value = v; o.connect(og); og.connect(lp); o.start(t); o.stop(t + len + 0.1); }
    lp.connect(g); g.connect(bus);
  }

  // ---------- music ----------
  const N = n => 440 * Math.pow(2, (n - 69) / 12);
  const SONGS = [
    { bpm: 96, chords: [[43, 50, 55, 59, 62], [38, 50, 54, 57, 62], [40, 52, 55, 59, 64], [36, 48, 52, 55, 60]] },          // G D Em C
    { bpm: 92, chords: [[38, 50, 53, 57, 62], [36, 48, 52, 55, 60], [34, 46, 50, 53, 58], [36, 48, 52, 55, 60]] },          // Dm C Bb C
    { bpm: 84, chords: [[45, 52, 57, 60, 64], [41, 53, 57, 60, 65], [36, 52, 55, 60, 64], [43, 50, 55, 59, 62]] },          // Am F C G
    { bpm: 72, chords: [[40, 52, 55, 59, 64], [36, 52, 55, 60, 64], [43, 50, 55, 59, 62], [38, 50, 54, 57, 62]] },          // Em C G D
    { bpm: 100, chords: [[36, 48, 52, 55, 60], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [41, 53, 57, 60, 65]] },         // C G Am F
  ];
  const PATTERN = [0, 3, 2, 4, 1, 3, 2, 4];   // fingerpicking: bass, then strings
  let musicNext = 0, step = 0;
  A.update = (dt) => {
    if (!A.ok) return;
    const P = G.player, t = ctx.currentTime;
    // wind louder the higher you are, whoosh with speed
    const hk = clamp(P.pos.y / 300, 0, 1), sp = Math.hypot(P.vel.x, P.vel.y, P.vel.z);
    windGain.gain.setTargetAtTime(0.025 + hk * 0.09, t, 0.5); windFilter.frequency.setTargetAtTime(300 + hk * 500, t, 0.5);
    speedGain.gain.setTargetAtTime(clamp((sp - 9) / 20, 0, 0.18), t, 0.1);
    if (!G.running || G.paused) { musicNext = Math.max(musicNext, t + 0.1); return; }
    const zi = G.zoneBlend ? G.zoneBlend.zi : 0, song = SONGS[zi], eighth = 60 / song.bpm / 2;
    while (musicNext < t + 0.2) {
      const bar = Math.floor(step / 8) % 4, ch = song.chords[bar], s = step % 8, idx = PATTERN[s];
      const note = ch[idx], v = idx === 0 ? 0.16 : 0.09;
      pluck(musicNext, N(note), v * (zi === 3 ? 0.8 : 1), musicBus, idx === 0 ? 1.8 : 1.2);
      if (s === 0 && step % 32 === 0) pluck(musicNext, N(ch[0] - 12), 0.12, musicBus, 2.5);
      musicNext += eighth * (s % 2 ? 0.94 : 1.06); step++;      // a little swing
    }
  };
  G.sfx = A.play;
  return A;
}
