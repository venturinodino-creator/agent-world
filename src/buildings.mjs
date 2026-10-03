// The buildings, modelled after the moon-base reference sheet. Workflows are habitats: a geodesic dome, a tube, a barrel, a
// round bunker, a greenhouse, a storage block, a hangar, a water tower or a pod. Claude is a rocket, the auto-commit bot a
// six-wheeled rover, you a cabin with a flag, Cowork agents satellite dishes, and each island has a "base" with a glass
// dome. Every building shows its agent's status in an accent band (the `body` material) and a glowing door or window (the
// `ring` material). Models are about a unit across; the scene scales them up.
import { THREE, ORANGE, shared, glowShared, toy, glow, skinned, mesh, flatten, hull, hullD, steel, blueM, orangeM, darkM, glassM, C, B,
  adder, padOf, statusMats } from './kit.mjs';
import { concreteSkin, flagSkin, plaqueSkin } from './textures.mjs';

const finish = (g, band, ring) => { g.userData.mats = { body: band, ring }; return flatten(g); };
// small recurring parts
const doorway = (put, ring, frame, x, y, z, w, h) => { put(B(w + 0.06, h + 0.04, 0.07), frame, x, y, z); put(B(w, h, 0.075), ring, x, y - 0.01, z + 0.005); };
const steps = (put, x, z, w = 0.3) => { put(B(w, 0.03, 0.12), steel(), x, 0.045, z); put(B(w * 0.85, 0.02, 0.08), steel(), x, 0.025, z + 0.08); };
const grille = (put, x, y, z, rotY = 0, n = 4) => { for (let k = 0; k < n; k++) put(B(0.12, 0.012, 0.03), darkM(), x, y + k * 0.03, z, [0, rotY, 0]); };
const antenna = (put, x, y, z, h = 0.2) => { put(C(0.007, 0.007, h, 5), steel(), x, y + h / 2, z); put(new THREE.SphereGeometry(0.02, 6, 5), glowShared(ORANGE, 1.4), x, y + h, z); };
const strut = (a, b, r, mat) => {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), len = d.length();
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 6), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
};
const glassDome = (put, r, y, seg = 20) => put(new THREE.SphereGeometry(r, seg, 9, 0, Math.PI * 2, 0, Math.PI / 2), glassM(), 0, y, 0);

// 1. Geodesic dome: a drum under a glass dome with machinery inside, window panels round the wall, a blue-and-orange door.
function buildHabDome(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  padOf(put);
  put(C(0.53, 0.53, 0.06, 20), hullD(), 0, 0.06, 0);
  put(C(0.48, 0.52, 0.3, 20), hull(), 0, 0.2, 0);
  put(C(0.492, 0.492, 0.04, 20), band, 0, 0.29, 0);
  put(C(0.45, 0.48, 0.06, 20), hullD(), 0, 0.34, 0);
  for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3 + 0.5; put(B(0.1, 0.08, 0.03), darkM(), Math.sin(a) * 0.5, 0.2, Math.cos(a) * 0.5, [0, a, 0]); put(B(0.06, 0.012, 0.035), ring, Math.sin(a) * 0.505, 0.2, Math.cos(a) * 0.505, [0, a, 0]); }
  put(C(0.12, 0.14, 0.22, 10), steel(), 0, 0.48, 0); put(new THREE.SphereGeometry(0.05, 8, 6), ring, 0, 0.64, 0);
  glassDome(put, 0.42, 0.37);
  put(C(0.04, 0.05, 0.03, 10), steel(), 0, 0.8, 0); antenna(put, 0, 0.8, 0, 0.18);
  doorway(put, ring, blueM(), 0, 0.15, 0.5, 0.13, 0.19); put(B(0.2, 0.26, 0.05), orangeM(), 0, 0.15, 0.49);
  steps(put, 0, 0.58);
  return finish(g, band, ring);
}

// 2. Tube module: a long pod on feet with a dark tunnel mouth at one end, blue rings and a lit side window.
function buildHabTube(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(C(0.25, 0.25, 0.86, 18).rotateZ(Math.PI / 2), hull(), 0, 0.32, 0);
  for (const sx of [-1, 1]) {
    put(C(0.255, 0.255, 0.06, 18).rotateZ(Math.PI / 2), blueM(), sx * 0.3, 0.32, 0);
    put(B(0.1, 0.1, 0.42), steel(), sx * 0.26, 0.05, 0);
  }
  put(C(0.2, 0.25, 0.08, 18).rotateZ(Math.PI / 2), hullD(), -0.45, 0.32, 0);
  put(C(0.25, 0.22, 0.07, 18).rotateZ(Math.PI / 2), hullD(), 0.45, 0.32, 0);
  put(C(0.2, 0.2, 0.04, 16).rotateZ(Math.PI / 2), blueM(), 0.49, 0.32, 0); put(C(0.16, 0.16, 0.045, 16).rotateZ(Math.PI / 2), darkM(), 0.495, 0.32, 0);
  put(C(0.252, 0.252, 0.05, 18).rotateZ(Math.PI / 2), band, 0, 0.32, 0);
  put(B(0.34, 0.16, 0.03), darkM(), -0.04, 0.34, 0.25); put(B(0.28, 0.11, 0.035), ring, -0.04, 0.34, 0.255);
  put(B(0.16, 0.05, 0.12), hullD(), 0.12, 0.58, 0); put(C(0.035, 0.035, 0.05, 8), steel(), -0.16, 0.59, 0.02); grille(put, -0.1, 0.4, -0.25, Math.PI);
  return finish(g, band, ring);
}

// 3. Barrel: a fat pill-shaped tank with two wide blue bands, domed ends with a spiral cap, a top hatch and feet.
function buildBarrel(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(C(0.27, 0.27, 0.78, 18).rotateZ(Math.PI / 2), hull(), 0, 0.34, 0);
  for (const sx of [-1, 1]) {
    put(C(0.275, 0.275, 0.15, 18).rotateZ(Math.PI / 2), blueM(), sx * 0.22, 0.34, 0);
    put(new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-sx * Math.PI / 2), hullD(), sx * 0.39, 0.34, 0);
    put(B(0.1, 0.12, 0.4), steel(), sx * 0.27, 0.06, 0);
  }
  for (let k = 0; k < 3; k++) put(new THREE.TorusGeometry(0.06 + k * 0.05, 0.008, 5, 18).rotateY(Math.PI / 2), steel(), 0.5 - k * 0.012, 0.34, 0);
  put(C(0.277, 0.277, 0.05, 18).rotateZ(Math.PI / 2), band, 0, 0.34, 0);
  put(B(0.26, 0.04, 0.16), hullD(), 0, 0.62, 0); put(B(0.12, 0.03, 0.08), ring, 0, 0.645, 0); grille(put, 0.1, 0.48, 0.27, 0, 3);
  put(B(0.12, 0.1, 0.03), darkM(), -0.1, 0.34, 0.27); put(B(0.08, 0.06, 0.035), ring, -0.1, 0.34, 0.275);
  return finish(g, band, ring);
}

// 4. Round bunker: a squat silo with a blue ring on top, a central vent, a blue door and lit slit windows.
function buildSilo(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  padOf(put, 0.46);
  put(C(0.4, 0.43, 0.14, 18), hullD(), 0, 0.09, 0);
  put(C(0.36, 0.4, 0.44, 18), hull(), 0, 0.31, 0);
  put(C(0.37, 0.37, 0.05, 18), band, 0, 0.55, 0);
  put(C(0.3, 0.36, 0.08, 18), hullD(), 0, 0.62, 0);
  put(C(0.17, 0.17, 0.05, 14), steel(), 0, 0.68, 0); put(C(0.1, 0.1, 0.03, 12), darkM(), 0, 0.7, 0);
  doorway(put, ring, blueM(), 0, 0.2, 0.395, 0.11, 0.2); steps(put, 0, 0.47, 0.24);
  for (const sx of [-1, 1]) { put(B(0.07, 0.045, 0.04), ring, sx * 0.2, 0.42, 0.3, [0, sx * 0.6, 0]); put(B(0.08, 0.1, 0.05), darkM(), sx * 0.33, 0.24, 0.17, [0, sx * 1.0, 0]); }
  put(C(0.016, 0.016, 0.36, 6), steel(), -0.3, 0.3, -0.2); antenna(put, 0.18, 0.7, -0.1, 0.16);
  return finish(g, band, ring);
}

// 5. Greenhouse: a glass vault on a low base with ribs and bushes inside, a small connecting pod at one end.
function buildGreenhouse(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(B(0.86, 0.1, 0.56), hullD(), 0.04, 0.06, 0);
  put(B(0.88, 0.03, 0.58), band, 0.04, 0.115, 0);
  put(new THREE.CylinderGeometry(0.27, 0.27, 0.72, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), glassM(), 0.04, 0.12, 0);
  for (const sx of [-1, 1]) put(new THREE.CircleGeometry(0.27, 16, 0, Math.PI).rotateY(sx * Math.PI / 2), glassM(), 0.04 + sx * 0.36, 0.12, 0);
  for (const x of [-0.3, -0.1, 0.1, 0.3, 0.4]) put(new THREE.TorusGeometry(0.272, 0.012, 5, 14, Math.PI).rotateY(Math.PI / 2), steel(), 0.04 + x, 0.12, 0);
  const leaf = toy(0x3fae4a, { roughness: 0.8 });
  for (let k = 0; k < 9; k++) put(new THREE.SphereGeometry(0.07 + (k % 3) * 0.015, 8, 6), leaf, -0.28 + k * 0.075, 0.2 + (k % 2) * 0.03, ((k * 7) % 5 - 2) * 0.06);
  put(C(0.17, 0.2, 0.22, 14).rotateZ(Math.PI / 2), hull(), -0.55, 0.2, 0); put(C(0.205, 0.205, 0.05, 14).rotateZ(Math.PI / 2), blueM(), -0.5, 0.2, 0);
  put(B(0.08, 0.08, 0.03), darkM(), -0.58, 0.22, 0.2); put(B(0.05, 0.05, 0.035), ring, -0.58, 0.22, 0.205);
  put(B(0.12, 0.1, 0.2), steel(), 0.5, 0.17, 0.2);
  return finish(g, band, ring);
}

// 6. Storage block: a boxy module with a blue top edge, a roof hatch, an orange door, vents and a skirt.
function buildStorage(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(B(0.78, 0.06, 0.58), steel(), 0, 0.04, 0);
  put(B(0.72, 0.34, 0.52), hull(), 0, 0.24, 0);
  put(B(0.74, 0.04, 0.54), band, 0, 0.43, 0);
  put(B(0.58, 0.04, 0.38), hullD(), 0, 0.47, 0); put(C(0.1, 0.1, 0.04, 14), steel(), -0.1, 0.5, 0); put(C(0.04, 0.04, 0.08, 8), steel(), 0.16, 0.52, 0.04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(B(0.04, 0.34, 0.04), blueM(), sx * 0.36, 0.24, sz * 0.26);
  doorway(put, ring, orangeM(), -0.14, 0.2, 0.265, 0.16, 0.24); steps(put, -0.14, 0.34, 0.24);
  grille(put, 0.18, 0.2, 0.27, 0, 5); put(B(0.18, 0.13, 0.03), darkM(), 0.18, 0.26, 0.268);
  put(B(0.03, 0.2, 0.3), darkM(), 0.375, 0.26, 0); put(B(0.025, 0.14, 0.2), ring, 0.378, 0.26, 0);
  return finish(g, band, ring);
}

// 7. Hangar: a wide arched roof over a low block, a slatted roll-up door with a light strip, blue ribs and corner braces.
function buildHangar(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(B(0.84, 0.06, 0.6), steel(), 0, 0.04, 0);
  put(B(0.8, 0.22, 0.56), hull(), 0, 0.18, 0);
  put(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.62, 0.93), hull(), 0, 0.29, 0);
  for (const sx of [-1, 1]) put(new THREE.CircleGeometry(0.3, 18, 0, Math.PI).scale(0.93, 0.62, 1).rotateY(sx * Math.PI / 2), hullD(), sx * 0.4, 0.29, 0);
  for (const x of [-0.28, 0, 0.28]) put(new THREE.TorusGeometry(0.305, 0.014, 5, 16, Math.PI).scale(0.93, 0.62, 1).rotateY(Math.PI / 2), blueM(), x, 0.29, 0);
  put(B(0.8, 0.03, 0.04), band, 0, 0.3, 0.29);
  put(B(0.46, 0.2, 0.04), darkM(), 0, 0.17, 0.29); for (let k = 0; k < 6; k++) put(B(0.44, 0.012, 0.045), steel(), 0, 0.09 + k * 0.03, 0.293);
  put(B(0.38, 0.025, 0.045), ring, 0, 0.3, 0.293);
  for (const sx of [-1, 1]) g.add(strut([sx * 0.4, 0.07, 0.3], [sx * 0.34, 0.2, 0.3], 0.015, steel()));
  return finish(g, band, ring);
}

// 8. Water tower: a tank with a domed top on a braced steel frame, a blue band and a ladder.
function buildWaterTower(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  padOf(put, 0.44);
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) g.add(strut([sx * 0.26, 0.05, sz * 0.26], [sx * 0.15, 0.62, sz * 0.15], 0.022, steel()));
  for (const y of [0.22, 0.42]) { const w = 0.26 - (y - 0.05) * 0.19; for (let k = 0; k < 4; k++) { const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4]; g.add(strut([ax * w, y, az * w], [bx * w, y, bz * w], 0.012, steel())); g.add(strut([ax * w, y, az * w], [bx * (w - 0.04), y + 0.2, bz * (w - 0.04)], 0.01, steel())); } }
  put(C(0.2, 0.2, 0.05, 16), steel(), 0, 0.64, 0);
  put(C(0.2, 0.2, 0.36, 18), hull(), 0, 0.84, 0);
  put(C(0.205, 0.205, 0.05, 18), band, 0, 0.78, 0);
  put(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hull(), 0, 1.02, 0);
  put(C(0.04, 0.04, 0.05, 8), steel(), 0, 1.22, 0);
  put(B(0.06, 0.1, 0.03), ring, 0, 0.88, 0.2); put(C(0.014, 0.014, 0.5, 5), steel(), 0.2, 0.9, 0.0); antenna(put, 0, 1.24, 0, 0.14);
  return finish(g, band, ring);
}

// 9. Pod: a round module with a flat deck and a central cylinder on top, a blue arch door and side vents.
function buildHabPod(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  padOf(put, 0.5);
  put(C(0.44, 0.48, 0.24, 20), hull(), 0.0, 0.17, 0);
  put(C(0.455, 0.455, 0.04, 20), band, 0, 0.27, 0);
  put(C(0.38, 0.44, 0.06, 20), hullD(), 0, 0.32, 0);
  put(C(0.24, 0.3, 0.07, 18), hull(), 0, 0.38, 0); put(C(0.14, 0.14, 0.09, 14), steel(), 0, 0.45, 0); put(C(0.1, 0.1, 0.025, 14), ring, 0, 0.5, 0);
  doorway(put, ring, blueM(), 0, 0.14, 0.46, 0.14, 0.17); steps(put, 0, 0.55, 0.26);
  for (const sx of [-1, 1]) grille(put, sx * 0.34, 0.14, 0.2, sx * 1.0, 4);
  antenna(put, -0.2, 0.34, -0.2, 0.2);
  return finish(g, band, ring);
}

// ---- the rocket, after the reference: a lathe-turned hull with a rounded blue-tipped nose, a blue band, three round windows,
// an arched glowing door, three big swept fins with blue tips, an orange engine bell and gold landing legs, on a round pad.
const HULL_PROFILE = [[0.0, 0.1], [0.12, 0.1], [0.16, 0.16], [0.175, 0.3], [0.17, 0.55], [0.155, 0.78], [0.12, 0.95], [0.07, 1.07], [0.0, 1.14]];
const hullRadius = y => { for (let i = 1; i < HULL_PROFILE.length; i++) { const [r0, y0] = HULL_PROFILE[i - 1], [r1, y1] = HULL_PROFILE[i]; if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0); } return 0; };
function rocketParts(g, { band, ring, pad = true }) {
  const put = adder(g), rim = steel(), gold = orangeM();
  put(new THREE.LatheGeometry(HULL_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 24), hull(), 0, 0, 0);
  put(new THREE.ConeGeometry(0.058, 0.13, 12), blueM(), 0, 1.09, 0);
  put(C(0.158, 0.158, 0.05, 24), band, 0, 0.84, 0);
  for (const y of [0.7, 0.54, 0.38]) {
    const r = hullRadius(y) - 0.004;
    put(C(0.052, 0.052, 0.03, 16).rotateX(Math.PI / 2), rim, 0, y, r); put(C(0.037, 0.037, 0.034, 16).rotateX(Math.PI / 2), ring, 0, y, r + 0.006);
  }
  const r0 = hullRadius(0.2);
  put(B(0.1, 0.12, 0.05), rim, 0, 0.2, r0); put(C(0.05, 0.05, 0.05, 14).rotateX(Math.PI / 2), rim, 0, 0.26, r0);
  put(B(0.072, 0.1, 0.055), ring, 0, 0.2, r0 + 0.004); put(C(0.036, 0.036, 0.055, 14).rotateX(Math.PI / 2), ring, 0, 0.25, r0 + 0.004);
  put(C(0.07, 0.1, 0.13, 14), gold, 0, 0.065, 0);
  // fins: a swept triangle with a blue tip, three of them round the hull
  const finShape = new THREE.Shape([new THREE.Vector2(0.13, 0.66), new THREE.Vector2(0.42, 0.08), new THREE.Vector2(0.13, 0.14)]);
  const tipShape = new THREE.Shape([new THREE.Vector2(0.34, 0.2), new THREE.Vector2(0.42, 0.08), new THREE.Vector2(0.29, 0.1)]);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Group(); fin.rotation.y = (i * Math.PI * 2) / 3;
    fin.add(mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.035, bevelEnabled: false }).translate(0, 0, -0.0175), hull(), 0, 0, 0));
    fin.add(mesh(new THREE.ExtrudeGeometry(tipShape, { depth: 0.042, bevelEnabled: false }).translate(0, 0, -0.021), blueM(), 0, 0, 0));
    g.add(fin);
    const t = (i * Math.PI * 2) / 3 + Math.PI / 3, c = Math.cos(t), s = Math.sin(t);
    g.add(strut([c * 0.19, 0.3, s * 0.19], [c * 0.5, 0.035, s * 0.5], 0.017, gold));
    put(C(0.06, 0.06, 0.02, 12), gold, c * 0.5, 0.025, s * 0.5);
  }
  if (pad) {
    put(C(0.52, 0.56, 0.045, 28), darkM(), 0, 0.022, 0);
    put(new THREE.TorusGeometry(0.43, 0.013, 5, 40), gold, 0, 0.05, 0, [Math.PI / 2, 0, 0]);
    put(new THREE.TorusGeometry(0.24, 0.008, 5, 30), rim, 0, 0.05, 0, [Math.PI / 2, 0, 0]);
  }
}

// Claude: the rocket on its pad.
function buildRocket(status) {
  const g = new THREE.Group(), { band, ring } = statusMats(status);
  rocketParts(g, { band, ring, pad: true });
  return finish(g, band, ring);
}

// Six-wheeled rover, for the auto-commit bot: a boxy hull with an orange stripe, a roof rack and dish, light bar and headlights.
function buildRover(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(B(0.56, 0.14, 0.3), hull(), 0, 0.21, 0);
  put(B(0.56, 0.025, 0.305), orangeM(), 0, 0.255, 0);
  put(B(0.12, 0.03, 0.305), band, 0.16, 0.295, 0);
  put(B(0.26, 0.13, 0.26), hullD(), -0.1, 0.34, 0); put(B(0.02, 0.09, 0.22), darkM(), 0.035, 0.345, 0);
  for (const sz of [-1, 1]) put(B(0.12, 0.07, 0.02), darkM(), -0.1, 0.35, sz * 0.131);
  put(B(0.24, 0.012, 0.2), steel(), -0.1, 0.41, 0);
  for (const sx of [-0.2, 0, 0.2]) for (const sz of [-1, 1]) { put(C(0.08, 0.08, 0.075, 12).rotateX(Math.PI / 2), darkM(), sx, 0.085, sz * 0.18); put(C(0.04, 0.04, 0.08, 8).rotateX(Math.PI / 2), steel(), sx, 0.085, sz * 0.18); }
  put(C(0.007, 0.007, 0.26, 5), steel(), -0.22, 0.46, -0.09); put(new THREE.SphereGeometry(0.075, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), hull(), -0.22, 0.58, -0.09, [-0.9, 0, 0]);
  for (const sz of [-1, 1]) put(B(0.02, 0.04, 0.07), ring, 0.285, 0.22, sz * 0.1);
  put(B(0.02, 0.025, 0.16), ring, 0.04, 0.4, 0);
  return finish(g, band, ring);
}

// A small cabin with a flagpole, for you: a pale module with a roof panel, an orange door, a lit window and a flag.
function buildCabin(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  padOf(put, 0.5);
  put(B(0.64, 0.32, 0.48), hull(), 0, 0.21, 0);
  put(B(0.66, 0.04, 0.5), band, 0, 0.38, 0);
  put(B(0.52, 0.04, 0.36), hullD(), 0, 0.42, 0); put(C(0.04, 0.04, 0.05, 8), steel(), -0.12, 0.46, 0);
  put(B(0.3, 0.012, 0.2), shared({ color: 0x1d3f8a, metalness: 0.4, roughness: 0.3 }), 0.1, 0.455, -0.02, [0.2, 0, 0]);
  doorway(put, ring, orangeM(), -0.12, 0.19, 0.245, 0.16, 0.24); steps(put, -0.12, 0.33, 0.24);
  put(B(0.17, 0.11, 0.03), darkM(), 0.17, 0.26, 0.24); put(B(0.13, 0.08, 0.035), ring, 0.17, 0.26, 0.245);
  put(C(0.008, 0.008, 0.74, 5), steel(), 0.3, 0.57, -0.17);
  put(new THREE.PlaneGeometry(0.25, 0.17), shared({ map: flagSkin().map, side: THREE.DoubleSide, roughness: 0.8 }), 0.43, 0.86, -0.17);
  return finish(g, band, ring);
}

// Satellite dish on a round base, for Cowork agents: a big white dish on a yoke, with a feed arm.
export function buildDish(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(C(0.34, 0.38, 0.12, 20), skinned(concreteSkin(0x6a7080), { roughness: 0.9 }), 0, 0.06, 0);
  put(C(0.3, 0.34, 0.12, 20), hullD(), 0, 0.17, 0);
  put(C(0.31, 0.31, 0.03, 20), band, 0, 0.24, 0);
  put(C(0.2, 0.2, 0.02, 18), ring, 0, 0.26, 0);
  put(C(0.07, 0.09, 0.3, 10), steel(), 0, 0.42, 0);
  put(B(0.24, 0.06, 0.09), steel(), 0, 0.58, 0); put(B(0.04, 0.14, 0.09), steel(), -0.1, 0.64, 0); put(B(0.04, 0.14, 0.09), steel(), 0.1, 0.64, 0);
  put(new THREE.SphereGeometry(0.42, 20, 9, 0, Math.PI * 2, 0, Math.PI / 2), hull(), 0, 0.82, 0, [-0.95, 0, 0]);
  put(new THREE.TorusGeometry(0.42, 0.012, 5, 28), steel(), 0, 0.82, 0, [-0.95 + Math.PI / 2, 0, 0]);
  put(C(0.01, 0.01, 0.4, 5), steel(), 0, 1.0, 0.2, [0.5, 0, 0]); put(new THREE.SphereGeometry(0.03, 6, 5), glowShared(ORANGE, 1.4), 0, 1.14, 0.35);
  return finish(g, band, ring);
}

// The base on each island: a wide drum under a glass geodesic dome, an entrance block with a name plate, a glowing door and
// steps, a connector tube each side and a dish on top. (Built so it stays inside its tile, whatever the scale.)
export function buildBase(status, scale = 1) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(C(0.58, 0.62, 0.05, 22), skinned(concreteSkin(0x6a7080), { roughness: 0.9 }), 0, 0.025, 0);
  put(C(0.5, 0.54, 0.3, 22), hull(), 0, 0.2, 0);
  put(C(0.512, 0.512, 0.045, 22), band, 0, 0.3, 0);
  put(C(0.52, 0.52, 0.03, 22), blueM(), 0, 0.12, 0);
  put(C(0.44, 0.5, 0.06, 22), hullD(), 0, 0.37, 0);
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4 + 0.2; put(B(0.1, 0.09, 0.03), darkM(), Math.sin(a) * 0.52, 0.22, Math.cos(a) * 0.52, [0, a, 0]); put(B(0.06, 0.014, 0.035), ring, Math.sin(a) * 0.525, 0.22, Math.cos(a) * 0.525, [0, a, 0]); }
  put(C(0.16, 0.18, 0.28, 10), steel(), 0, 0.54, 0); put(new THREE.SphereGeometry(0.06, 8, 6), ring, 0, 0.7, 0);
  put(new THREE.SphereGeometry(0.42, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), glassM(), 0, 0.4, 0);
  put(C(0.012, 0.012, 0.22, 5), steel(), 0.1, 0.9, 0); put(new THREE.SphereGeometry(0.11, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), hull(), 0.1, 1.03, 0, [-0.8, 0, 0]);
  put(B(0.36, 0.28, 0.2), hull(), 0, 0.17, 0.5); put(B(0.24, 0.22, 0.04), blueM(), 0, 0.15, 0.61); put(B(0.16, 0.19, 0.045), ring, 0, 0.14, 0.615);
  put(B(0.3, 0.03, 0.1), steel(), 0, 0.045, 0.7); put(B(0.26, 0.02, 0.07), steel(), 0, 0.025, 0.76);
  put(B(0.34, 0.085, 0.02), shared({ map: plaqueSkin('AGENT BASE').map, roughness: 0.6 }), 0, 0.33, 0.605);
  for (const sx of [-1, 1]) { put(C(0.12, 0.12, 0.22, 12).rotateZ(Math.PI / 2), hull(), sx * 0.54, 0.16, 0.05); put(C(0.125, 0.125, 0.05, 12).rotateZ(Math.PI / 2), blueM(), sx * 0.5, 0.16, 0.05); put(B(0.04, 0.1, 0.1), steel(), sx * 0.66, 0.16, 0.05); }
  flatten(g);
  g.scale.setScalar(scale);
  g.userData.mats = { body: band, ring };
  return g;
}
export { buildBase as buildPod };

// The hub in the middle of the world: the same slim rocket, much bigger, on a landing pad, that pages fly up to.
// `ring` is the glow (the pad's light ring and the round windows) and `orb` the beacon on the nose; the scene pulses both.
export function buildHub() {
  const g = new THREE.Group(), put = adder(g), ring = glow(0x7fd6ff, 1.2), orb = glow(0xff9a3a, 1.8), beacon = glow(0xff9a3a, 1.6);
  put(C(2.6, 2.9, 0.7, 20), skinned(concreteSkin(0x4c5262), { roughness: 0.85 }), 0, 0.35, 0);
  put(C(2.0, 2.2, 0.3, 20), hull(), 0, 0.85, 0);
  put(C(1.88, 1.88, 0.05, 20), ring, 0, 1.02, 0);
  put(new THREE.TorusGeometry(1.55, 0.05, 5, 48), orangeM(), 0, 1.07, 0, [Math.PI / 2, 0, 0]);
  const rocket = new THREE.Group(); rocket.scale.setScalar(4.9); rocket.position.y = 1.04; g.add(rocket);
  rocketParts(rocket, { band: toy(0x2f6fe0, { roughness: 0.35 }), ring, pad: false });
  put(C(0.02, 0.02, 0.45, 5), steel(), 0, 7.0, 0); put(new THREE.SphereGeometry(0.15, 12, 8), orb, 0, 7.3, 0);
  g.userData = { orb, ring, beacon };
  return flatten(g);
}

// Variety between neighbouring buildings comes from a stable number per agent (0..1). Workflows are one of nine habitats,
// Claude is a rocket, the auto-commit bot a rover, you a cabin with a flag, and Cowork agents are dishes.
const HABITATS = [buildHabDome, buildHabTube, buildBarrel, buildSilo, buildGreenhouse, buildStorage, buildHangar, buildWaterTower, buildHabPod];
export const buildingFor = (agent, status, pick = 0) =>
  agent.kind === 'workflow' ? HABITATS[Math.floor(pick * HABITATS.length) % HABITATS.length](status)
  : agent.kind === 'human' ? buildCabin(status)
  : agent.kind === 'local' ? buildDish(status)
  : agent.name === 'Auto-commit bot' ? buildRover(status) : buildRocket(status);
