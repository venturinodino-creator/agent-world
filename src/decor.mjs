// The things scattered round the islands on tiles that have no agent, taken from the reference sheet: landing pads and slabs,
// boulders, lamp posts and beacons, flags and road signs, cargo crates and tanks, a generator with a solar panel, solar
// arrays, dish tripods, a buggy and a truck. Each kind is built once (flattened, shared materials) and cloned wherever it is
// placed, then the scene merges every copy in the world into a few draw calls. Browser only.
import { THREE, ORANGE, shared, glowShared, toy, mesh, flatten, hull, hullD, steel, blueM, orangeM, darkM, C, B, adder } from './kit.mjs';
import { signSkin, solarSkin, flagSkin } from './textures.mjs';

const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const panelM = () => shared({ map: solarSkin(0xffffff).map, bumpMap: solarSkin(0xffffff).bumpMap, bumpScale: 1.2, color: 0x2f55b8, metalness: 0.35, roughness: 0.28 });
const rockM = () => toy(0x7b7684, { roughness: 0.96, flatShading: true });
const signM = kind => shared({ map: signSkin(kind).map, side: THREE.DoubleSide, roughness: 0.6 });
const wheel = (put, x, y, z, r = 0.07) => { put(C(r, r, 0.07, 12).rotateX(Math.PI / 2), darkM(), x, y, z); put(C(r * 0.5, r * 0.5, 0.075, 8).rotateX(Math.PI / 2), steel(), x, y, z); };

const KINDS = {
  landingPad(g) {
    const put = adder(g);
    put(C(0.5, 0.54, 0.04, 24), darkM(), 0, 0.02, 0); put(new THREE.TorusGeometry(0.42, 0.012, 5, 36), orangeM(), 0, 0.045, 0, [Math.PI / 2, 0, 0]);
    put(new THREE.TorusGeometry(0.2, 0.008, 5, 28), steel(), 0, 0.045, 0, [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 4; k++) put(B(0.06, 0.012, 0.03), orangeM(), Math.sin((k * Math.PI) / 2) * 0.47, 0.045, Math.cos((k * Math.PI) / 2) * 0.47, [0, (k * Math.PI) / 2, 0]);
  },
  hexSlab(g) { const put = adder(g); put(C(0.5, 0.52, 0.05, 6), steel(), 0, 0.025, 0); put(C(0.4, 0.4, 0.015, 6), hullD(), 0, 0.055, 0); },
  boulder(g) {
    const put = adder(g);
    put(new THREE.IcosahedronGeometry(0.3, 1).scale(1, 0.7, 0.85), rockM(), 0, 0.17, 0, [0.2, 0.7, 0]);
    put(new THREE.IcosahedronGeometry(0.15, 0).scale(1, 0.7, 1), rockM(), 0.32, 0.07, 0.12); put(new THREE.IcosahedronGeometry(0.09, 0).scale(1, 0.7, 1), rockM(), -0.28, 0.05, 0.2);
  },
  lampPost(g) {
    const put = adder(g);
    put(C(0.035, 0.05, 0.05, 8), steel(), 0, 0.025, 0); put(C(0.015, 0.02, 0.75, 6), steel(), 0, 0.4, 0); put(B(0.14, 0.03, 0.05), hullD(), 0.05, 0.78, 0);
    put(new THREE.SphereGeometry(0.035, 8, 6), glowShared(0xfff2c0, 1.8), 0.1, 0.75, 0);
  },
  beacon(g) {
    const put = adder(g);
    put(C(0.04, 0.06, 0.06, 8), steel(), 0, 0.03, 0); put(C(0.018, 0.018, 0.42, 6), steel(), 0, 0.27, 0); put(new THREE.SphereGeometry(0.04, 8, 6), glowShared(ORANGE, 1.7), 0, 0.5, 0);
  },
  flag(g) {
    const put = adder(g);
    put(C(0.035, 0.05, 0.05, 8), steel(), 0, 0.025, 0); put(C(0.01, 0.01, 0.9, 5), steel(), 0, 0.47, 0);
    put(new THREE.PlaneGeometry(0.3, 0.2), shared({ map: flagSkin().map, side: THREE.DoubleSide, roughness: 0.8 }), 0.16, 0.8, 0);
  },
  signs(g) {
    const put = adder(g), kinds = ['arrow', 'caution', 'orange'];
    kinds.forEach((kind, i) => { const x = (i - 1) * 0.3; put(C(0.012, 0.012, 0.42, 5), steel(), x, 0.21, 0); put(new THREE.PlaneGeometry(0.2, 0.2), signM(kind), x, 0.46, 0.01, [0, (i - 1) * 0.35, i === 1 ? Math.PI / 4 : 0]); });
  },
  cargo(g) {
    const put = adder(g);
    put(B(0.36, 0.28, 0.36), hull(), 0, 0.14, 0); put(B(0.38, 0.05, 0.38), orangeM(), 0, 0.3, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(B(0.03, 0.28, 0.03), steel(), sx * 0.18, 0.14, sz * 0.18);
    put(B(0.3, 0.26, 0.3), orangeM(), 0.34, 0.13, 0.12, [0, 0.4, 0]); put(B(0.18, 0.14, 0.03), darkM(), 0.4, 0.15, 0.26, [0, 0.4, 0]);
    put(B(0.26, 0.22, 0.26), hullD(), 0.02, 0.43, 0, [0, 0.3, 0]);
  },
  tank(g) {
    const put = adder(g);
    put(C(0.2, 0.22, 0.04, 16), steel(), 0, 0.02, 0); put(C(0.2, 0.2, 0.32, 18), hull(), 0, 0.2, 0); put(C(0.205, 0.205, 0.08, 18), orangeM(), 0, 0.2, 0);
    put(C(0.12, 0.2, 0.05, 18), hullD(), 0, 0.385, 0); put(C(0.06, 0.06, 0.04, 12), steel(), 0, 0.43, 0); put(C(0.02, 0.02, 0.2, 6).rotateZ(Math.PI / 2), steel(), 0.28, 0.1, 0);
  },
  generator(g) {
    const put = adder(g);
    put(B(0.46, 0.3, 0.32), hull(), 0, 0.17, 0); put(B(0.48, 0.035, 0.34), blueM(), 0, 0.33, 0);
    for (let k = 0; k < 4; k++) put(B(0.2, 0.012, 0.03), darkM(), -0.06, 0.12 + k * 0.035, 0.165);
    put(B(0.14, 0.2, 0.03), orangeM(), 0.14, 0.14, 0.165);
    put(B(0.44, 0.015, 0.3), panelM(), 0, 0.46, -0.02, [-0.4, 0, 0]); put(B(0.03, 0.14, 0.03), steel(), 0, 0.4, -0.12);
  },
  solarArray(g) {
    const put = adder(g);
    for (const sx of [-1, 1]) { put(B(0.46, 0.015, 0.32), panelM(), sx * 0.26, 0.26, 0, [-0.5, 0, 0]); put(B(0.03, 0.26, 0.03), steel(), sx * 0.26 + 0.2, 0.13, -0.1); put(B(0.03, 0.2, 0.03), steel(), sx * 0.26 - 0.2, 0.1, 0.08); }
    put(B(0.98, 0.03, 0.05), steel(), 0, 0.03, 0.1);
  },
  dishTripod(g) {
    const put = adder(g);
    for (let k = 0; k < 3; k++) { const a = (k * Math.PI * 2) / 3; g.add(strutOf([Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2], [Math.cos(a) * 0.04, 0.36, Math.sin(a) * 0.04])); }
    put(C(0.04, 0.05, 0.06, 8), steel(), 0, 0.38, 0); put(new THREE.SphereGeometry(0.2, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), hull(), 0, 0.5, 0, [-0.9, 0.4, 0]);
    put(C(0.008, 0.008, 0.2, 5), steel(), 0.04, 0.58, 0.1, [0.6, 0.4, 0]);
  },
  buggy(g) {
    const put = adder(g);
    put(B(0.46, 0.08, 0.26), hull(), 0, 0.15, 0); put(B(0.18, 0.1, 0.2), hullD(), -0.1, 0.23, 0); put(B(0.2, 0.012, 0.22), steel(), -0.1, 0.4, 0);
    for (const sx of [-0.1, 0.06]) put(B(0.08, 0.1, 0.18), darkM(), sx - 0.05, 0.23, 0);
    for (const sx of [-0.15, 0.15]) for (const sz of [-1, 1]) wheel(put, sx, 0.09, sz * 0.15, 0.09);
    put(C(0.006, 0.006, 0.28, 5), steel(), -0.2, 0.32, -0.08); put(new THREE.SphereGeometry(0.07, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), hull(), -0.2, 0.46, -0.08, [-0.8, 0, 0]);
    for (const sz of [-1, 1]) put(B(0.02, 0.035, 0.05), glowShared(0xfff2c0, 1.5), 0.235, 0.17, sz * 0.08);
  },
  truck(g) {
    const put = adder(g);
    put(B(0.6, 0.12, 0.28), hull(), 0, 0.17, 0); put(B(0.62, 0.025, 0.285), orangeM(), 0, 0.225, 0); put(B(0.22, 0.12, 0.25), hullD(), 0.16, 0.29, 0); put(B(0.02, 0.07, 0.2), darkM(), 0.27, 0.3, 0);
    put(B(0.24, 0.1, 0.22), steel(), -0.14, 0.28, 0); put(B(0.05, 0.1, 0.24), blueM(), -0.27, 0.27, 0);
    for (const sx of [-0.2, 0, 0.2]) for (const sz of [-1, 1]) wheel(put, sx, 0.075, sz * 0.17);
    put(B(0.02, 0.03, 0.18), glowShared(0x7fd6ff, 1.5), 0.315, 0.2, 0);
  },
};

// a leg between two points (the tripod's); built like the buildings' struts
function strutOf(a, b) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A);
  const m = mesh(new THREE.CylinderGeometry(0.014, 0.014, d.length(), 5), steel(), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

// what turns up, and how often, on an empty tile
const BAG = ['boulder', 'boulder', 'cargo', 'cargo', 'solarArray', 'solarArray', 'generator', 'tank', 'tank', 'lampPost', 'lampPost', 'beacon', 'flag', 'signs', 'dishTripod', 'buggy', 'truck', 'landingPad', 'hexSlab', 'boulder'];
const LOW = ['landingPad', 'hexSlab', 'solarArray', 'signs', 'flag', 'landingPad'];   // what a crowded island keeps: nothing tall or bulky
const FLAT = new Set(['landingPad', 'hexSlab']);   // flat things sit in the middle of the tile and take no company
const templates = new Map();
const template = kind => { if (!templates.has(kind)) { const g = new THREE.Group(); KINDS[kind](g); templates.set(kind, flatten(g)); } return templates.get(kind); };

// Decor for every tile of every live island that has no agent: one big piece or a couple of small ones, spun every which way.
// `tiles(rings)` gives the tile offsets (tile 0 is the base, tiles 1..agentCount have agents), `size` how big a piece is drawn.
export function scatterDecor(world, tiles, size) {
  const out = [];
  world.islands.forEach((isl, n) => {
    if (isl.dormant) return;
    const r2 = lcg(101 + n * 53), all = tiles(isl.rings), crowded = isl.agentCount / (all.length - 1) > 0.5, bag = crowded ? LOW : BAG;
    all.forEach((t, i) => {
      if (i <= isl.agentCount) return;
      const count = crowded || r2() < 0.55 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const kind = bag[Math.floor(r2() * bag.length)], flat = FLAT.has(kind), spread = flat || count === 1 ? 0.18 : 0.62;
        const g = template(kind).clone(), s = size * (0.85 + r2() * 0.35) * (count === 2 && !flat ? 0.8 : 1);
        g.position.set(isl.x + t.x + (r2() - 0.5) * spread * size, 0.14, isl.z + t.z + (r2() - 0.5) * spread * size);
        g.rotation.y = r2() * Math.PI * 2; g.scale.setScalar(s);
        out.push(g);
      }
    });
  });
  return out;
}
