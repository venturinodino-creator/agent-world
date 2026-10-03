// The setting: a black starry sky, Earth and a small grey moon hanging in it, and the lunar ground with craters and
// rolling dust. Browser only (it builds three.js objects).
import * as THREE from 'three';
import { regolithSkin, planetMap } from './textures.mjs';

const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// Black sky with a faint glow at the horizon, thousands of stars (a hash of the view direction picks which ones) and a
// soft milky band. It is a big inside-out sphere that follows nothing: the camera is always inside it.
export function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = mix(vec3(0.06, 0.09, 0.17), vec3(0.008, 0.012, 0.035), smoothstep(-0.05, 0.55, h));
        vec3 cell = floor(d * 240.0);
        float star = step(0.9962, hash(cell)) * (0.35 + 0.65 * hash(cell + 3.1));
        float band = smoothstep(0.32, 0.0, abs(dot(d, normalize(vec3(0.3, 0.5, 0.8)))));
        c += vec3(0.07, 0.08, 0.12) * band * 0.6 + vec3(star);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
}

// Earth with a blue halo, and a small grey moon, far away and unlit (they are lit by painting, not by the sun).
export function planets() {
  const group = new THREE.Group();
  const earth = new THREE.Mesh(new THREE.SphereGeometry(150, 40, 24), new THREE.MeshBasicMaterial({ map: planetMap('earth'), fog: false }));
  earth.position.set(-520, 260, -900); earth.rotation.y = 2.2;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 40, 64, 64, 64);
  g.addColorStop(0, 'rgba(90,150,255,0.55)'); g.addColorStop(1, 'rgba(90,150,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  halo.position.copy(earth.position); halo.scale.set(420, 420, 1); halo.renderOrder = -1;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(55, 24, 16), new THREE.MeshBasicMaterial({ map: planetMap('moon'), fog: false }));
  moon.position.set(620, 330, -1000);
  group.add(halo, earth, moon);
  return group;
}

// The lunar surface: flat under the islands, rolling away to the horizon with craters (a bowl and a raised rim) scattered
// beyond them. Vertex colours give the grey variation; a tiled grit-and-crater texture adds detail up close.
export function moonGround(R) {
  const size = 2400, seg = 96, geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), a = new THREE.Color('#a9a9b0'), b = new THREE.Color('#74747c'), c = new THREE.Color(), dark = new THREE.Color('#4d4d54');
  const flatUntil = R + 14, rnd = lcg(19);
  const craters = Array.from({ length: 70 }, () => { const ang = rnd() * Math.PI * 2, d = flatUntil + 14 + rnd() * 900; return { x: Math.cos(ang) * d, z: Math.sin(ang) * d, r: 6 + rnd() * rnd() * 70, depth: 0.5 + rnd() * 2.2 }; });
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z), k = Math.min(1, Math.max(0, (d - flatUntil) / 60));
    let y = Math.sin(x * 0.02) * 3.2 + Math.sin(z * 0.03 + 1.3) * 2.6 + Math.sin((x + z) * 0.009) * 9, pit = 0;
    for (const cr of craters) {
      const dd = Math.hypot(x - cr.x, z - cr.z) / cr.r;
      if (dd > 2.2) continue;
      const t = (dd - 1) / 0.3, bowl = Math.exp(-dd * dd * 2.2) * cr.depth, rim = Math.exp(-t * t) * cr.depth * 0.35;
      y += rim - bowl; pit += bowl;
    }
    pos.setY(i, -0.4 + k * k * (3 - 2 * k) * y);
    c.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(x * 0.035 + z * 0.02 + Math.sin(z * 0.05) * 2)).lerp(dark, Math.min(0.6, pit * 0.28) * k);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const grit = regolithSkin(); grit.map.repeat.set(300, 300); grit.bumpMap.repeat.set(300, 300);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: grit.map, bumpMap: grit.bumpMap, bumpScale: 0.9 }));
  m.receiveShadow = true;
  return m;
}
