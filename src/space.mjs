// The setting: an alien planet. Violet, magenta and rust terrain with striped rock layers, mesas, ridges and glowing teal
// canyons; clusters of glowing crystals and luminous plants; under a nebula sky with a huge ringed gas giant
// and two moons. Browser only (it builds three.js objects).
import * as THREE from 'three';
import { alienSkin, veinsMap, planetMap, ringMap } from './textures.mjs';

const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// ---- the sky: a violet-magenta horizon rising to indigo, nebula clouds in teal and magenta, and stars
export function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p){
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = mix(vec3(0.34, 0.12, 0.40), vec3(0.025, 0.02, 0.10), smoothstep(-0.05, 0.62, h));
        float cloud = smoothstep(0.38, 0.85, fbm(d * 2.6 + vec3(3.0, 1.0, 7.0)));
        vec3 tint = mix(vec3(0.10, 0.55, 0.62), vec3(0.78, 0.16, 0.52), fbm(d * 3.2 + 5.0));
        c += tint * cloud * 0.6 * smoothstep(-0.1, 0.35, h + 0.2);
        float star = step(0.9962, hash(floor(d * 240.0))) * (0.35 + 0.65 * hash(floor(d * 240.0) + 3.1));
        c += vec3(star) * (1.0 - cloud * 0.6);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
}

// A huge banded gas giant with a tilted ring and a warm glow, and two small moons. Far away and unlit (painted, not lit by
// the sun). They sit where you only see them once you tilt the camera towards the horizon.
export function planets() {
  const group = new THREE.Group();
  const giant = new THREE.Mesh(new THREE.SphereGeometry(190, 48, 32), new THREE.MeshBasicMaterial({ map: planetMap('gas'), fog: false }));
  giant.position.set(-560, 290, -950); giant.rotation.z = 0.3;
  const ring = new THREE.Mesh(new THREE.RingGeometry(250, 420, 96), new THREE.MeshBasicMaterial({ map: ringMap(), transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  ring.position.copy(giant.position); ring.rotation.set(Math.PI / 2 - 0.5, 0.25, 0.3);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 30, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,170,90,0.45)'); g.addColorStop(1, 'rgba(255,170,90,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  halo.position.copy(giant.position); halo.scale.set(560, 560, 1); halo.renderOrder = -1;
  const moon = (r, pos, tint) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ map: planetMap('moon'), color: tint, fog: false })); m.position.set(...pos); return m; };
  group.add(halo, giant, ring, moon(55, [640, 340, -1000], 0xc7b4ff), moon(28, [250, 180, -1150], 0xffc99a));
  return group;
}

// ---- terrain
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, o = 4) => { let a = 0.5, s = 0, f = 1; for (let i = 0; i < o; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; } return s / (1 - 0.5 ** o); };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// How much of the landscape's height is actually raised: 0 is a perfectly flat plain (the colours, rock layers and canyons
// are still painted on it), 1 brings back the full hills and mesas.
const RELIEF = 0;

// the raw landscape at a point: ridged hills stepped into mesas, with winding canyons cut into them
function land(x, z) {
  const ridge = 1 - Math.abs(fbm(x * 0.022 + 3, z * 0.022 + 7, 3) * 2 - 1);
  let y = ridge * ridge * 26 + fbm(x * 0.05, z * 0.05, 3) * 6;
  const step = 3, terraced = Math.floor(y / step) * step + smooth(0.6, 1, (y / step) % 1) * step;
  y = y * 0.45 + terraced * 0.55;
  const canyon = smooth(0.07, 0, Math.abs(fbm(x * 0.017 + 11, z * 0.017 + 5, 3) - 0.5));
  return { y: (y - canyon * 8) * RELIEF, h: y - canyon * 8, canyon };   // y is the height drawn, h the height the colours follow
}
// the height the surface is drawn at: flat under the islands, rising into the landscape beyond them
function surfaceY(x, z, R) {
  const d = Math.hypot(x, z), k = Math.min(1, Math.max(0, (d - (R + 2)) / 16));
  return -0.4 + k * k * (3 - 2 * k) * land(x, z).y;
}

const STOPS = [[0.0, '#5d3a8c'], [0.35, '#a5457a'], [0.62, '#c9683e'], [1.0, '#dca85e']].map(([t, c]) => [t, new THREE.Color(c)]);
const palette = (t, out) => {
  for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) { const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i]; return out.copy(c0).lerp(c1, (t - t0) / (t1 - t0)); }
  return out.copy(STOPS[STOPS.length - 1][1]);
};

// The ground: vertex colours blend violet, magenta, rust and ochre across big regions; layered stripes follow the height;
// canyon floors turn teal. A tiled grit texture adds detail up close and a tiled network of glowing cracks lights it.
export function alienGround(R) {
  const size = 1600, seg = 112, geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color(), teal = new THREE.Color('#1f8f94');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z), k = Math.min(1, Math.max(0, (d - (R + 2)) / 16)), l = land(x, z);
    pos.setY(i, -0.4 + k * k * (3 - 2 * k) * l.y);
    palette(Math.min(1, Math.max(0, fbm(x * 0.02 + 1, z * 0.02 + 9, 3) * 1.4 - 0.2)), c);
    c.multiplyScalar(0.8 + 0.26 * Math.sin(l.h * 2.8 + fbm(x * 0.05, z * 0.05, 2) * 3)).lerp(teal, Math.min(0.9, l.canyon * 0.95 * k));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const grit = alienSkin(), veins = veinsMap();
  grit.map.repeat.set(220, 220); grit.bumpMap.repeat.set(220, 220); veins.repeat.set(70, 70);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: grit.map, bumpMap: grit.bumpMap, bumpScale: 1.0, emissiveMap: veins, emissive: 0x4fd8ff, emissiveIntensity: 0.28 }));
  m.receiveShadow = true;
  return m;
}

// What grows out of the ground around the islands: clusters of glowing crystals in three colours and luminous plants
// (a stalk with a glowing bulb). All instanced, so about six draw calls in total.
export function alienProps(R) {
  const group = new THREE.Group(), rnd = lcg(33), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const spot = (minD, maxD) => { const a = rnd() * Math.PI * 2, d = minD + (maxD - minD) * rnd() ** 1.8; return [Math.cos(a) * d, Math.sin(a) * d]; };
  const place = (mesh, i, x, z, lift, s, tilt) => {
    e.set((rnd() - 0.5) * tilt, rnd() * 6.28, (rnd() - 0.5) * tilt); q.setFromEuler(e);
    mesh.setMatrixAt(i, m4.compose(p.set(x, surfaceY(x, z, R) + lift, z), q, sc.set(s[0], s[1], s[2])));
  };

  // crystals
  const crystalGeo = new THREE.ConeGeometry(0.28, 1.5, 5); crystalGeo.translate(0, 0.75, 0);
  const crystalColors = [0x4ff0ff, 0xff4fd8, 0xb6ff4f];
  const crystals = crystalColors.map(color => new THREE.InstancedMesh(crystalGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.3, flatShading: true }), 220));
  const nCrystal = [0, 0, 0];
  for (let cl = 0; cl < 100; cl++) {
    const [cx, cz] = cl < 34 ? spot(R + 4, R + 40) : spot(R + 6, R + 220), ci = cl % 3, n = 3 + Math.floor(rnd() * 5), big = 0.8 + rnd() * 2.6;
    for (let k = 0; k < n && nCrystal[ci] < 220; k++) {
      const s = big * (0.5 + rnd() * 0.9);
      place(crystals[ci], nCrystal[ci]++, cx + (rnd() - 0.5) * 5, cz + (rnd() - 0.5) * 5, -0.1, [s, s * (0.9 + rnd() * 1.2), s], 0.7);
    }
  }
  crystals.forEach((mesh, i) => { mesh.count = nCrystal[i]; mesh.instanceMatrix.needsUpdate = true; group.add(mesh); });

  // luminous plants: a dark stalk and a glowing bulb on top, in teal and pink
  const stalkGeo = new THREE.CylinderGeometry(0.035, 0.06, 1.2, 5), bulbGeo = new THREE.SphereGeometry(0.2, 8, 6); stalkGeo.translate(0, 0.6, 0);
  const stalks = new THREE.InstancedMesh(stalkGeo, new THREE.MeshStandardMaterial({ color: 0x2a3a48, roughness: 0.8 }), 300);
  const bulbColors = [0x38ffd2, 0xff62c8], bulbs = bulbColors.map(color => new THREE.InstancedMesh(bulbGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3 }), 150)), nBulb = [0, 0];
  for (let i = 0; i < 300; i++) {
    const [x, z] = i < 110 ? spot(R + 4, R + 36) : spot(R + 5, R + 110), h = 0.6 + rnd() * 1.4, bi = i % 2, y = surfaceY(x, z, R);
    stalks.setMatrixAt(i, m4.compose(p.set(x, y, z), q.identity(), sc.set(1, h, 1)));
    bulbs[bi].setMatrixAt(nBulb[bi]++, m4.compose(p.set(x, y + 1.2 * h, z), q.identity(), sc.set(h, h, h)));
  }
  stalks.instanceMatrix.needsUpdate = true; group.add(stalks);
  bulbs.forEach((mesh, i) => { mesh.count = nBulb[i]; mesh.instanceMatrix.needsUpdate = true; group.add(mesh); });
  return group;
}
