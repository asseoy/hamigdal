// Sky dome, sun/moon with following shadows, fog and clouds. Everything blends by how high the runner is:
// afternoon at the camp -> golden desert -> Hanukkah dusk -> starry night -> sunrise above the clouds.
import * as THREE from 'three';
import { G, clamp, lerp, smooth, save } from './ctx.js';
import { cloudSprite } from './tex.js';

const Z = [
  { top: '#5b8cc6', hor: '#d3dcdc', fog: '#c6d0d2', dens: 0.0042, sun: '#ffe7c8', si: 3.0, el: 48, az: 0.6, hs: '#c4d6ea', hg: '#6d5c42', hi: 0.95, exp: 1.0, stars: 0, cloud: '#ffffff' },
  { top: '#6c9ccc', hor: '#f2d09c', fog: '#e8c89c', dens: 0.0048, sun: '#ffd49c', si: 3.2, el: 30, az: 1.2, hs: '#f4dfc4', hg: '#8c6c42', hi: 0.85, exp: 1.0, stars: 0, cloud: '#fff4e4' },
  { top: '#22325e', hor: '#d9876a', fog: '#86707a', dens: 0.0052, sun: '#ffa468', si: 2.3, el: 11, az: 2.0, hs: '#909fcc', hg: '#5a4448', hi: 1.15, exp: 1.15, stars: 0.35, cloud: '#e8b4a4' },
  { top: '#040711', hor: '#1c2544', fog: '#141a2c', dens: 0.0075, sun: '#a8bcff', si: 0.8, el: 52, az: 2.6, hs: '#40507e', hg: '#16121a', hi: 0.6, exp: 1.2, stars: 1, cloud: '#4a5270' },
  { top: '#4a7cc0', hor: '#ffd4b4', fog: '#f4d8c8', dens: 0.0026, sun: '#fff0dc', si: 3.3, el: 12, az: 3.4, hs: '#ffe6d6', hg: '#c8a8a4', hi: 1.05, exp: 1.0, stars: 0, cloud: '#ffffff' },
];
const C = k => new THREE.Color(k);
Z.forEach(z => { for (const k of ['top', 'hor', 'fog', 'sun', 'hs', 'hg', 'cloud']) z[k] = C(z[k]); });

export function createSky() {
  const S = G.scene;
  const uni = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color() }, uStars: { value: 0 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(950, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 uTop,uHor,uFog,uSunC,uSun; uniform float uStars; varying vec3 vD;
      float h3(vec3 p){ p=fract(p*0.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){ vec3 d=normalize(vD); float h=d.y;
        vec3 col = h>0. ? mix(uHor,uTop,pow(h,0.55)) : mix(uHor,uFog*0.85,clamp(-h*6.,0.,1.));
        float s=max(dot(d,normalize(uSun)),0.);
        col += uSunC*(pow(s,900.)*6. + pow(s,60.)*0.35 + pow(s,6.)*0.12);
        if(uStars>0.01 && h>0.){ vec3 g=floor(d*420.); float n=h3(g); if(n>0.9965){ float tw=0.6+0.4*sin(n*900.+g.x); col += vec3(0.85,0.9,1.)*uStars*tw*smoothstep(0.,0.25,h); } }
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  dome.renderOrder = -10; dome.frustumCulled = false; S.add(dome);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); S.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true;
  sun.shadow.camera.left = -26; sun.shadow.camera.right = 26; sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26; sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
  S.add(sun); S.add(sun.target);
  S.fog = new THREE.FogExp2(0xcccccc, 0.004);

  // clouds: a thick layer you climb through into the sky zone, plus far clouds around lower floors
  const ctex = cloudSprite();
  const cloudMat = new THREE.SpriteMaterial({ map: ctex, transparent: true, depthWrite: false, opacity: 0.9, color: 0xffffff, fog: true });
  const layerY = G.data.floors[39] ? G.data.floors[39].y + 8 : 280;
  const clouds = [];
  const R = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 260; i++) {
    const s = new THREE.Sprite(cloudMat); const a = Math.random() * Math.PI * 2, rr = R(32, 360);
    s.position.set(Math.sin(a) * rr, layerY + R(-5, 6), Math.cos(a) * rr); const k = R(14, 34); s.scale.set(k * 1.6, k, 1); S.add(s); clouds.push(s);
  }
  for (let i = 0; i < 70; i++) {
    const s = new THREE.Sprite(cloudMat); const a = Math.random() * Math.PI * 2, rr = R(200, 520);
    s.position.set(Math.sin(a) * rr, R(60, layerY - 30), Math.cos(a) * rr); const k = R(30, 60); s.scale.set(k * 2, k, 1); S.add(s); clouds.push(s);
  }

  const cur = {}; for (const k in Z[0]) cur[k] = Z[0][k] && Z[0][k].isColor ? new THREE.Color() : 0;
  const sunDir = new THREE.Vector3();
  const floorYs = G.data.floors.map(f => f.y);
  function floorAt(y) { // continuous floor index (0-based) from height
    let i = 0; while (i < floorYs.length - 1 && floorYs[i + 1] <= y) i++;
    const a = floorYs[i], b = floorYs[i + 1] ?? a + 7; return i + clamp((y - a) / Math.max(1, b - a), 0, 1);
  }
  const K = { floorAt, layerY };
  K.update = (dt, force) => {
    const P = G.player, f = floorAt(P.pos.y);
    // blend across the last ~2 floors of each zone
    const zi = Math.min(4, Math.floor(f / 10)), within = f - zi * 10, t = zi < 4 ? smooth(clamp((within - 8) / 2, 0, 1)) : 0;
    const A = Z[zi], B = Z[Math.min(4, zi + 1)];
    for (const k in A) { if (A[k].isColor) cur[k].copy(A[k]).lerp(B[k], t); else cur[k] = lerp(A[k], B[k], t); }
    // in the cloud layer itself everything goes milky
    const inCloud = 1 - clamp(Math.abs(P.pos.y + 1 - layerY) / 9, 0, 1);
    uni.uTop.value.copy(cur.top); uni.uHor.value.copy(cur.hor); uni.uFog.value.copy(cur.fog); uni.uSunC.value.copy(cur.sun); uni.uStars.value = cur.stars;
    const el = cur.el * Math.PI / 180, az = cur.az; sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)); uni.uSun.value.copy(sunDir);
    S.fog.color.copy(cur.fog).lerp(new THREE.Color(0xf4f2f0), inCloud * 0.6); S.fog.density = cur.dens + inCloud * 0.03;
    hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = cur.hi;
    sun.color.copy(cur.sun); sun.intensity = cur.si;
    G.renderer.toneMappingExposure = cur.exp;
    cloudMat.color.copy(cur.cloud);
    // shadow box follows the runner (snapped to texels to avoid shimmering)
    const tx = Math.round(P.pos.x * 4) / 4, ty = Math.round(P.pos.y * 4) / 4, tz = Math.round(P.pos.z * 4) / 4;
    sun.target.position.set(tx, ty, tz); sun.position.set(tx + sunDir.x * 90, ty + sunDir.y * 90, tz + sunDir.z * 90);
    dome.position.copy(G.camera.position);
    G.zoneBlend = { zi, t, f };
  };
  K.applyQuality = (q) => {
    const size = G.touch ? (q >= 2 ? 1024 : 512) : q >= 2 ? 2048 : q === 1 ? 1536 : 1024;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    sun.castShadow = !(G.touch && q === 0);
  };
  G.sky = K;
  return K;
}
