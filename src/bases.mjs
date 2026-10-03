// The base in the middle of each island. Every island has its own design, so the plates never look alike: a glass dome (the
// original), an observation tower, a hangar with silos, a ring station, a stepped ziggurat, a solar farm and a reactor with
// cooling towers. They all show the island's health in an accent band (the `body` material) and a glowing door (the `ring`
// material), carry the "AGENT BASE" name plate and stay inside their tile at the scales the scene uses.
import { THREE, shared, glowShared, skinned, mesh, flatten, hull, hullD, steel, blueM, darkM, glassM, C, B, adder, statusMats, ORANGE } from './kit.mjs';
import { concreteSkin, plaqueSkin, solarSkin } from './textures.mjs';
import { buildBase } from './buildings.mjs';

const concrete = () => skinned(concreteSkin(0x6a7080), { roughness: 0.9 });
const plate = () => shared({ map: plaqueSkin('AGENT BASE').map, roughness: 0.6 });
const panelM = () => shared({ map: solarSkin(0xffffff).map, bumpMap: solarSkin(0xffffff).bumpMap, bumpScale: 1.2, color: 0x2f55b8, metalness: 0.35, roughness: 0.28 });
const dome = (r, seg = 20) => new THREE.SphereGeometry(r, seg, 9, 0, Math.PI * 2, 0, Math.PI / 2);
const ball = r => new THREE.SphereGeometry(r, 10, 7);
const strut = (a, b, r, mat) => {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), len = d.length();
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 6), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
};
const start = status => { const g = new THREE.Group(), put = adder(g), mats = statusMats(status); put(C(0.62, 0.66, 0.05, 24), concrete(), 0, 0.025, 0); return { g, put, ...mats }; };
const door = (put, ring, x, y, z, w = 0.16, h = 0.19) => { put(B(w + 0.08, h + 0.05, 0.05), blueM(), x, y, z); put(B(w, h, 0.055), ring, x, y - 0.01, z + 0.004); };
const sign = (put, x, y, z) => put(B(0.34, 0.085, 0.02), plate(), x, y, z);
const done = (g, band, ring, scale) => { flatten(g); g.scale.setScalar(scale); g.userData.mats = { body: band, ring }; return g; };

// 1. Observation tower: a drum, a tall ringed shaft, a flared deck with a glass cabin and a mast.
function tower(status, scale) {
  const { g, put, band, ring } = start(status);
  put(C(0.5, 0.54, 0.16, 20), hull(), 0, 0.13, 0); put(C(0.52, 0.52, 0.035, 20), band, 0, 0.2, 0);
  put(C(0.17, 0.23, 0.78, 14), hull(), 0, 0.62, 0);
  for (let k = 0; k < 3; k++) put(C(0.2 - k * 0.02, 0.2 - k * 0.02, 0.03, 14), blueM(), 0, 0.36 + k * 0.22, 0);
  for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; put(B(0.05, 0.1, 0.025), ring, Math.sin(a) * 0.19, 0.74, Math.cos(a) * 0.19, [0, a, 0]); }
  put(C(0.36, 0.2, 0.14, 18), hullD(), 0, 1.06, 0); put(C(0.37, 0.37, 0.04, 18), band, 0, 1.15, 0);
  put(C(0.3, 0.3, 0.17, 18), glassM(), 0, 1.25, 0); put(C(0.32, 0.32, 0.03, 18), hullD(), 0, 1.35, 0);
  put(C(0.015, 0.015, 0.34, 5), steel(), 0, 1.55, 0); put(ball(0.04), ring, 0, 1.74, 0);
  put(B(0.36, 0.26, 0.22), hull(), 0, 0.16, 0.5); door(put, ring, 0, 0.14, 0.62); sign(put, 0, 0.34, 0.61);
  put(B(0.3, 0.03, 0.1), steel(), 0, 0.045, 0.72);
  return done(g, band, ring, scale);
}

// 2. Hangar base: a wide block under a barrel roof with a big lit door, two silos and vents.
function hangarBase(status, scale) {
  const { g, put, band, ring } = start(status);
  put(B(0.8, 0.3, 0.64), hull(), 0, 0.18, 0); put(B(0.82, 0.04, 0.66), band, 0, 0.27, 0);
  put(C(0.33, 0.33, 0.8, 18).rotateZ(Math.PI / 2), hullD(), 0, 0.36, 0);
  put(B(0.5, 0.26, 0.04), darkM(), 0, 0.17, 0.33); put(B(0.44, 0.21, 0.045), ring, 0, 0.16, 0.335);
  for (let k = 0; k < 3; k++) put(B(0.1, 0.05, 0.14), steel(), -0.25 + k * 0.25, 0.7, 0);
  for (const sx of [-1, 1]) { put(C(0.14, 0.14, 0.5, 14), hull(), sx * 0.46, 0.27, -0.1); put(dome(0.14, 12), hullD(), sx * 0.46, 0.52, -0.1); put(C(0.145, 0.145, 0.04, 14), blueM(), sx * 0.46, 0.3, -0.1); }
  sign(put, 0, 0.5, 0.2);
  return done(g, band, ring, scale);
}

// 3. Ring station: a core on legs, a big ring around it joined by spokes, windows round the ring, a mast on top.
function ringStation(status, scale) {
  const { g, put, band, ring } = start(status);
  put(C(0.14, 0.2, 0.55, 14), hull(), 0, 0.32, 0); put(C(0.145, 0.145, 0.04, 14), band, 0, 0.5, 0);
  put(new THREE.TorusGeometry(0.46, 0.09, 10, 30), hull(), 0, 0.42, 0, [Math.PI / 2, 0, 0]);
  put(new THREE.TorusGeometry(0.46, 0.028, 6, 30), band, 0, 0.5, 0, [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + Math.PI / 4; g.add(strut([0, 0.42, 0], [Math.sin(a) * 0.46, 0.42, Math.cos(a) * 0.46], 0.035, steel())); }
  for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6; put(B(0.07, 0.05, 0.025), ring, Math.sin(a) * 0.55, 0.42, Math.cos(a) * 0.55, [0, a, 0]); }
  for (let k = 0; k < 3; k++) { const a = (k * Math.PI * 2) / 3 + 0.5; put(C(0.05, 0.07, 0.4, 8), steel(), Math.sin(a) * 0.46, 0.22, Math.cos(a) * 0.46); }
  put(C(0.015, 0.015, 0.34, 5), steel(), 0, 0.77, 0); put(ball(0.05), ring, 0, 0.96, 0);
  put(B(0.22, 0.04, 0.34), steel(), 0, 0.07, 0.4); door(put, ring, 0, 0.14, 0.2, 0.1, 0.14);
  sign(put, 0, 0.17, 0.62);
  return done(g, band, ring, scale);
}

// 4. Ziggurat: four stepped tiers with glowing seams, a lit door and stairs, a glass pyramid and a beacon on top.
function ziggurat(status, scale) {
  const { g, put, band, ring } = start(status);
  for (let i = 0; i < 4; i++) { const w = 1.0 - i * 0.2; put(B(w, 0.14, w), i % 2 ? hullD() : hull(), 0, 0.1 + i * 0.14, 0); put(B(w + 0.012, 0.025, w + 0.012), i === 1 ? band : blueM(), 0, 0.17 + i * 0.14, 0); }
  put(C(0.0, 0.14, 0.24, 4), glassM(), 0, 0.78, 0, [0, Math.PI / 4, 0]); put(ball(0.05), ring, 0, 0.95, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(ball(0.035), ring, sx * 0.5, 0.22, sz * 0.5);
  door(put, ring, 0, 0.14, 0.51, 0.14, 0.17); put(B(0.26, 0.03, 0.12), steel(), 0, 0.045, 0.6); put(B(0.22, 0.02, 0.08), steel(), 0, 0.025, 0.67);
  sign(put, 0, 0.36, 0.41);
  return done(g, band, ring, scale);
}

// 5. Solar farm: a glass-topped drum with four solar wings on arms, a lit door and a dish.
function solarBase(status, scale) {
  const { g, put, band, ring } = start(status);
  put(C(0.3, 0.36, 0.42, 18), hull(), 0, 0.26, 0); put(C(0.31, 0.31, 0.04, 18), band, 0, 0.31, 0); put(C(0.27, 0.3, 0.06, 18), hullD(), 0, 0.5, 0);
  put(dome(0.26, 16), glassM(), 0, 0.52, 0); put(ball(0.07), ring, 0, 0.6, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4, sx = Math.sin(a), sz = Math.cos(a);
    g.add(strut([sx * 0.3, 0.3, sz * 0.3], [sx * 0.5, 0.3, sz * 0.5], 0.022, steel()));
    put(B(0.36, 0.025, 0.24), panelM(), sx * 0.64, 0.3, sz * 0.64, [0, a, 0]); put(B(0.04, 0.2, 0.04), steel(), sx * 0.64, 0.17, sz * 0.64);
  }
  put(C(0.012, 0.012, 0.2, 5), steel(), 0.1, 0.78, 0); put(dome(0.1, 10), hull(), 0.1, 0.9, 0, [-0.8, 0, 0]);
  put(B(0.3, 0.24, 0.16), hull(), 0, 0.15, 0.4); door(put, ring, 0, 0.13, 0.49); sign(put, 0, 0.3, 0.49);
  return done(g, band, ring, scale);
}

// 6. Reactor: two tapering cooling towers with glowing tops, a core sphere on a pedestal, pipes between them.
function reactor(status, scale) {
  const { g, put, band, ring } = start(status);
  for (const sx of [-1, 1]) {
    put(C(0.16, 0.27, 0.72, 18), hull(), sx * 0.3, 0.4, -0.12); put(C(0.17, 0.17, 0.04, 18), band, sx * 0.3, 0.72, -0.12);
    put(C(0.15, 0.15, 0.025, 18), ring, sx * 0.3, 0.77, -0.12); put(C(0.275, 0.275, 0.04, 18), blueM(), sx * 0.3, 0.1, -0.12);
  }
  put(C(0.2, 0.26, 0.16, 16), hullD(), 0, 0.13, 0.16); put(ball(0.22), hull(), 0, 0.42, 0.16);
  put(new THREE.TorusGeometry(0.235, 0.022, 6, 28), ring, 0, 0.42, 0.16, [Math.PI / 2, 0, 0]); put(new THREE.TorusGeometry(0.235, 0.022, 6, 28), band, 0, 0.42, 0.16, [0, 0, 0]);
  for (const sx of [-1, 1]) g.add(strut([sx * 0.3, 0.3, -0.12], [sx * 0.12, 0.36, 0.16], 0.03, steel()));
  put(B(0.28, 0.2, 0.14), hull(), 0, 0.12, 0.5); door(put, ring, 0, 0.1, 0.58, 0.14, 0.15); sign(put, 0, 0.27, 0.58);
  put(C(0.012, 0.012, 0.2, 5), steel(), 0, 0.78, 0.16); put(ball(0.03), glowShared(ORANGE, 1.4), 0, 0.89, 0.16);
  return done(g, band, ring, scale);
}

// Design 0 is the glass-dome base; the others follow in the order above. One per island, wrapping round.
const BASES = [buildBase, tower, hangarBase, ringStation, ziggurat, solarBase, reactor];
export const baseFor = (design, status, scale) => BASES[design % BASES.length](status, scale);
