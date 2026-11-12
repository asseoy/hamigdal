// Procedural canvas textures + materials. Everything tiles in world metres (UVs are scaled per box).
import * as THREE from 'three';
import { rng } from './ctx.js';

const R = rng(7);
function canvas(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); return c; }
function tex(c, rep = true) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
const noise = (g, w, h, n, a, col = '0,0,0') => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${col},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } };

function planks(base, dark, light, seam = 4) {
  return canvas(512, 512, (g, w, h) => {
    const ph = h / seam;
    for (let i = 0; i < seam; i++) {
      const sh = (Math.random() - 0.5) * 18;
      g.fillStyle = shade(base, sh); g.fillRect(0, i * ph, w, ph);
      for (let k = 0; k < 26; k++) {                      // grain
        g.strokeStyle = `rgba(${dark},${0.08 + Math.random() * 0.14})`; g.lineWidth = 1 + Math.random() * 1.5;
        const y = i * ph + Math.random() * ph; g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 3 + (Math.random() - 0.5) * 2);
        g.stroke();
      }
      if (Math.random() < 0.6) { const x = Math.random() * w, y = i * ph + ph * (0.3 + Math.random() * 0.4); g.fillStyle = `rgba(${dark},.5)`; g.beginPath(); g.ellipse(x, y, 7, 4, 0, 0, 7); g.fill(); }
      g.fillStyle = `rgba(${dark},.55)`; g.fillRect(0, i * ph, w, 3);         // seam
      g.fillStyle = `rgba(${light},.18)`; g.fillRect(0, i * ph + 3, w, 2);
      for (const x of [w * 0.12, w * 0.88]) { g.fillStyle = 'rgba(40,40,40,.7)'; g.beginPath(); g.arc(x, i * ph + ph / 2 - 8, 3, 0, 7); g.arc(x, i * ph + ph / 2 + 8, 3, 0, 7); g.fill(); }  // nails
    }
    noise(g, w, h, 5000, 0.08);
  });
}
function shade(hex, d) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, d / 255); return '#' + c.getHexString(); }

export function makeMaterials() {
  const M = {};
  const std = (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.85, metalness: 0 }, o));
  M.pine = std(tex(planks('#c49563', '70,40,15', '255,230,190')));
  M.wood = std(tex(planks('#8a6440', '40,22,8', '230,200,160')));
  M.dark = std(tex(planks('#4e3a2a', '15,8,3', '200,170,130')));
  M.white = std(tex(planks('#e3dccd', '120,105,85', '255,255,255')));
  M.blue = std(tex(planks('#3c64a0', '10,20,50', '200,220,255')));
  M.log = std(tex(canvas(256, 512, (g, w, h) => {
    g.fillStyle = '#9b7347'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(50,28,10,${0.08 + Math.random() * 0.2})`; g.lineWidth = 1 + Math.random() * 3; const x = Math.random() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.6, x + 3, h); g.stroke(); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,35,15,.55)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 6, 10, 0, 0, 7); g.fill(); }
    noise(g, w, h, 3000, 0.1);
  })));
  M.rope = std(tex(canvas(64, 256, (g, w, h) => {
    g.fillStyle = '#c4ab7c'; g.fillRect(0, 0, w, h);
    for (let y = -64; y < h + 64; y += 14) { g.strokeStyle = 'rgba(90,65,30,.55)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 28); g.stroke(); g.strokeStyle = 'rgba(255,240,200,.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y + 5); g.lineTo(w, y + 33); g.stroke(); }
  })), { roughness: 1 });
  const netC = canvas(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#c9b183'; g.lineWidth = 7; g.lineCap = 'round';
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    g.fillStyle = '#8a6c40'; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { g.beginPath(); g.arc(i * 64, j * 64, 7, 0, 7); g.fill(); }
  });
  M.net = std(tex(netC), { transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  const tarp = (a, b) => tex(canvas(256, 256, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 3) { g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(x, 0, 1, h); }
    g.fillStyle = b; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    for (let x = 16; x < w; x += 48) { g.fillStyle = '#ccc'; g.beginPath(); g.arc(x, 5, 3.5, 0, 7); g.fill(); g.beginPath(); g.arc(x, h - 5, 3.5, 0, 7); g.fill(); }
    noise(g, w, h, 2500, 0.08);
  }));
  M.tarp = std(tarp('#5f6e3b', '#46522a'), { side: THREE.DoubleSide, roughness: 0.95 });
  M.tarpO = std(tarp('#b8582a', '#8e3f1b'), { side: THREE.DoubleSide, roughness: 0.95 });
  M.sand = std(tex(canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#c99d66'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,70,30' : '255,220,170'},${Math.random() * 0.12})`; g.fillRect(0, y, w, 2 + Math.random() * 4); }
    for (let i = 0; i < 18; i++) { g.strokeStyle = 'rgba(90,55,25,.35)'; g.lineWidth = 2; g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 60; y += Math.random() * 30; g.lineTo(x, y); } g.stroke(); }
    noise(g, w, h, 9000, 0.12);
  })), { roughness: 0.95 });
  M.stone = std(tex(canvas(256, 256, (g, w, h) => { g.fillStyle = '#8d877d'; g.fillRect(0, 0, w, h); noise(g, w, h, 9000, 0.18); noise(g, w, h, 3000, 0.1, '255,255,255'); })), { roughness: 1 });
  M.ground = std(tex(canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#8f7a55'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '95,105,55' : '120,95,60'},${0.2 + Math.random() * 0.3})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 20, 3 + Math.random() * 12, Math.random() * 3, 0, 7); g.fill(); }
    noise(g, w, h, 12000, 0.15);
  })), { roughness: 1 });
  M.cloud = new THREE.MeshStandardMaterial({ color: 0xf7f4f0, roughness: 1, emissive: 0x3a3a40 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.35, metalness: 0.7 });
  M.candle = std(tex(canvas(64, 128, (g, w, h) => { g.fillStyle = '#f0e9da'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(60,100,170,.55)'; g.fillRect(0, y, w, 5); } })), { roughness: 0.6 });
  M.flame = new THREE.MeshBasicMaterial({ color: 0xffc35a, transparent: true, opacity: 0.95 });
  M.lanternGlass = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffa53a, emissiveIntensity: 2.2, roughness: 0.4 });
  M.metal = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.6 });
  M.redPaint = new THREE.MeshStandardMaterial({ color: 0xa8121b, roughness: 0.7 });
  M.yellowPaint = new THREE.MeshStandardMaterial({ color: 0xf3e03b, roughness: 0.7 });
  M.dreidel = dreidelMats(std);
  return M;
}

// four painted faces with נ ג ה פ
function dreidelMats(std) {
  const letters = ['נ', 'ג', 'ה', 'פ'], cols = ['#2f5d9e', '#e8e2d2', '#2f5d9e', '#e8e2d2'];
  return letters.map((l, i) => std(tex(canvas(256, 256, (g, w, h) => {
    g.fillStyle = cols[i]; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a23a'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = i % 2 ? '#2f5d9e' : '#f1efeb'; g.font = '900 170px "Frank Ruhl Libre", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(l, w / 2, h / 2 + 10);
    noise(g, w, h, 2000, 0.08);
  }), false), { roughness: 0.6 }));
}

export function signTexture(lines, opts = {}) {
  const w = opts.w || 512, h = opts.h || 256;
  const c = canvas(w, h, (g) => {
    g.fillStyle = opts.bg || '#5a4029'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += h / 3) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y, w, 3); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(0,0,0,.12)'; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 8); g.stroke(); }
    g.textAlign = 'center'; g.direction = 'rtl'; g.textBaseline = 'middle';
    lines.forEach((ln, i) => { g.fillStyle = ln.color || '#f1efeb'; g.font = ln.font || '700 64px "Frank Ruhl Libre", serif'; g.fillText(ln.text, w / 2, ln.y != null ? ln.y : h / 2); });
    noise(g, w, h, 3000, 0.1);
  });
  return tex(c, false);
}

export function flagTexture(logo, floorNum) {
  const c = canvas(512, 320, (g, w, h) => {
    g.fillStyle = '#f1efeb'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#a8121b'; g.fillRect(0, 0, w, 34); g.fillRect(0, h - 34, w, 34);
    if (logo) { const s = 200, hh = s * logo.height / logo.width; g.drawImage(logo, w / 2 - s / 2 + (floorNum ? 80 : 0), h / 2 - hh / 2, s, hh); }
    if (floorNum) { g.fillStyle = '#111'; g.font = '700 190px "Karantina", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(floorNum), 130, h / 2 + 14); }
  });
  return tex(c, false);
}
export function cloudSprite() {
  const c = canvas(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  return tex(c, false);
}
export function dustSprite() {
  const c = canvas(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  return tex(c, false);
}
