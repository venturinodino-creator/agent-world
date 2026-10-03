// Procedural 3D models in a chunky, toy-like style: white and ice-blue drum buildings with coloured roofs,
// terracotta domes, red-and-white towers and tiny robots. Everything is built from simple three.js shapes and
// dressed with procedural textures (panels, plaster, shingles, wood), so there are no model or image files to load.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { panelSkin, solarSkin, crateSkin, concreteSkin, fabricSkin, visorSkin, glassSkin, flagSkin } from './textures.mjs';

export const PALETTE = { white: 0xf3f6ff, ice: 0xa9d3ff, iceDark: 0x78b4f0, blue: 0x3b72f2, red: 0xe2493a, teal: 0x2fb89b,
  brown: 0x7a4130, terracotta: 0xe08a4a, slate: 0x2c3050, yellow: 0xf2c94c, orange: 0xf0a030, grey: 0x8f97a3 };
// Accent-band colour (body) and window/door glow by status. "ok" is the blue roof of the reference.
export const STATUS = {
  ok: { body: 0x3b72f2, glow: 0x7fd6ff },
  running: { body: 0x2fb8ff, glow: 0xd4fbff },
  fail: { body: 0xe2493a, glow: 0xff5a4a },
  idle: { body: 0xe8b13a, glow: 0xffd36b },
  asleep: { body: 0x7b86a6, glow: 0x9aa6c8 },
};
// Rim colour of an island by its health.
export const HEALTH = { ok: 0x2fd6a0, running: 0x3fd7e8, fail: 0xff6a3d, idle: 0xf2d24a, dormant: 0x5a6080 };
const BOT = { workflow: 0xdbeaff, builder: 0xff7ab8, bot: 0xff5a5a, human: 0x3b72f2, local: 0xffa24a };

// The glossy clear-coat shader is the expensive one, so only parts that ask for a `clearcoat` (helmets, hard hats,
// roofs and domes) get it; everything else uses the cheaper standard material.
const make = p => (p.clearcoat ? new THREE.MeshPhysicalMaterial(p) : new THREE.MeshStandardMaterial(p));
// Materials that never change are shared by everything that asks for the same one, which is what lets flatten() below
// merge a whole building into a few draw calls. A part that gets tinted or flashed per agent asks for its `own`.
const sharedMats = new Map(), sharedSet = new Set();
const shared = p => {
  const key = JSON.stringify(p, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (!sharedMats.has(key)) { const m = make(p); sharedMats.set(key, m); sharedSet.add(m); }
  return sharedMats.get(key);
};
const glowShared = (color, k = 1) => shared({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
// Gives a geometry one colour per vertex, so parts of different colours can share one material and merge into one mesh.
const paint = (geo, hex) => {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
};
const toy = (color, extra = {}, own = false) => (own ? make : shared)({ color, roughness: 0.5, metalness: 0.05, ...extra });
const glow = (color, k = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
// A surface with a procedural skin: the colour is baked into the map, a bump map gives the seams real relief.
const skinned = (sk, extra = {}, own = false) => (own ? make : shared)({ map: sk.map, bumpMap: sk.bumpMap, bumpScale: 1.4, roughness: 0.55, metalness: 0.08, ...extra });

// Bakes every mesh of a model into one mesh per material (about 30 small meshes become 5 or 6), because thousands of
// separate draw calls per frame, not triangles, is what makes a scene like this stutter. Parts under a group listed in
// `keep` (swinging arms) stay separate. Call it before the model is scaled or moved.
function flatten(g, keep = []) {
  g.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(g.matrixWorld).invert(), byMat = new Map(), gone = [];
  g.traverse(o => {
    if (!o.isMesh || keep.some(k => k === o || k.getObjectById(o.id))) return;
    // rounded boxes come without an index and the other shapes with one, and merging needs them all alike
    const flat = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const geo = flat.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, { geos: [], cast: false });
    const e = byMat.get(o.material); e.geos.push(geo); e.cast ||= o.castShadow; gone.push(o);
  });
  const built = [...byMat].map(([material, e]) => [material, e, mergeGeometries(e.geos)]);
  if (built.some(b => !b[2])) return g;            // attributes did not line up; leave the model as it was
  gone.forEach(o => { o.geometry.dispose(); o.removeFromParent(); });
  for (const [material, e, geo] of built) { const m = new THREE.Mesh(geo, material); m.castShadow = e.cast; m.userData.shared = sharedSet.has(material); g.add(m); }
  return g;
}

// Buildings never move, so the parts of every building that use a shared material are merged once more, across all of
// them: dozens of draw calls per material become one. Parts with their own material (the roofs and windows that pulse
// per agent) stay put. A merged building can no longer be clicked on its walls, so each gets an invisible stand-in the
// size of the building for picking. Call it after every building has been placed.
const invisible = new THREE.MeshBasicMaterial({ visible: false });
export function bakeStatics(root, groups) {
  const byMat = new Map(), moved = [];
  for (const g of groups) {
    g.updateMatrixWorld(true);
    for (const m of [...g.children]) {
      if (!m.isMesh || !m.userData.shared) continue;
      if (!byMat.has(m.material)) byMat.set(m.material, { geos: [], cast: false });
      const e = byMat.get(m.material); e.geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld)); e.cast ||= m.castShadow; moved.push(m);
    }
  }
  const built = [...byMat].map(([material, e]) => [material, e, mergeGeometries(e.geos)]);
  if (built.some(b => !b[2])) return;   // attributes did not line up; leave everything as it was
  moved.forEach(m => { m.geometry.dispose(); m.removeFromParent(); });
  for (const [material, e, geo] of built) { const m = new THREE.Mesh(geo, material); m.castShadow = e.cast; root.add(m); }
  for (const g of groups) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 8), invisible); p.position.y = 0.5; g.add(p); }
}
const DARK = 0x262b38;
// Only parts big enough to matter cast a shadow; the many tiny ones would just cost frames.
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  geo.computeBoundingSphere(); m.castShadow = geo.boundingSphere.radius >= 0.3;
  return m;
};


// ---- the moon base: pale panelled hulls with blue and orange trim, glass geodesic domes, steel struts, glowing doors.
// Each building has its status in two places: an accent band (the `body` material, blue / cyan / red / amber / grey) and
// a glowing door or window (the `ring` material), which is what pulses when the agent is working.
const HULL = 0xdfe3ea, HULL_D = 0xa3abb8, STEEL = 0x5a6270, BLUE = 0x2f6fe0, ORANGE = 0xf0a030, DARKM = 0x2a2f3a;
const hull = () => skinned(panelSkin(HULL), { roughness: 0.55, metalness: 0.12 });
const hullD = () => skinned(panelSkin(HULL_D), { roughness: 0.5, metalness: 0.2 });
const steel = () => toy(STEEL, { metalness: 0.65, roughness: 0.38 });
const blueM = () => toy(BLUE, { roughness: 0.35, metalness: 0.2 });
const orangeM = () => toy(ORANGE, { roughness: 0.4, metalness: 0.15 });
const darkM = () => toy(DARKM, { roughness: 0.6 });
const glassM = () => shared({ map: glassSkin().map, transparent: true, depthWrite: false, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide });
const C = (rt, rb, h, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// adds a part to a group in one call: geometry, material, position, optional rotation
const adder = g => (geo, mat, x = 0, y = 0, z = 0, rot) => { const m = mesh(geo, mat, x, y, z); if (rot) m.rotation.set(...rot); g.add(m); return m; };
const padOf = (put, r = 0.52) => put(C(r, r + 0.03, 0.05), skinned(concreteSkin(0x6a7080), { roughness: 0.9 }), 0, 0.025, 0);
// the accent band and glowing door every building shares
const statusMats = status => { const s = STATUS[status] || STATUS.ok; return { band: toy(s.body, { roughness: 0.35, metalness: 0.2 }, true), ring: glow(s.glow, 1.1) }; };

// Habitat dome: a drum with a glass geodesic dome, blue-framed glowing door, antenna. (workflow, variant 1)
function buildHabDome(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  padOf(put);
  put(C(0.46, 0.5, 0.26), hull(), 0, 0.18, 0);
  put(C(0.472, 0.472, 0.04), band, 0, 0.27, 0);
  put(C(0.44, 0.47, 0.06), hullD(), 0, 0.33, 0);
  put(C(0.12, 0.14, 0.2, 10), steel(), 0, 0.47, 0);                  // the machinery you can see through the glass
  put(new THREE.SphereGeometry(0.05, 8, 6), ring, 0, 0.62, 0);
  put(new THREE.SphereGeometry(0.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), glassM(), 0, 0.36, 0);
  put(C(0.007, 0.007, 0.2, 5), steel(), 0, 0.86, 0); put(new THREE.SphereGeometry(0.018, 6, 5), glowShared(ORANGE, 1.4), 0, 0.97, 0);
  put(B(0.2, 0.24, 0.07), blueM(), 0, 0.15, 0.48); put(B(0.13, 0.19, 0.075), ring, 0, 0.14, 0.485); put(B(0.26, 0.03, 0.1), steel(), 0, 0.045, 0.53);
  g.userData.mats = { body: band, ring };
  return flatten(g);
}

// Habitat tube: a long pod lying on feet, blue end bands, a door in the side and a vent on top. (workflow, variant 2)
function buildHabTube(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(C(0.24, 0.24, 0.8).rotateZ(Math.PI / 2), hull(), 0, 0.3, 0);
  for (const sx of [-1, 1]) {
    put(C(0.2, 0.245, 0.07).rotateZ(Math.PI / 2), hullD(), sx * 0.42, 0.3, 0);   // end caps
    put(C(0.25, 0.25, 0.07).rotateZ(Math.PI / 2), blueM(), sx * 0.22, 0.3, 0);   // blue rings
    put(B(0.1, 0.1, 0.34), steel(), sx * 0.28, 0.05, 0);                          // feet
  }
  put(C(0.248, 0.248, 0.05).rotateZ(Math.PI / 2), band, 0, 0.3, 0);
  put(B(0.2, 0.2, 0.05), blueM(), 0, 0.27, 0.235); put(B(0.13, 0.14, 0.055), ring, 0, 0.27, 0.24);
  put(B(0.16, 0.05, 0.12), hullD(), 0.12, 0.56, 0); put(C(0.03, 0.03, 0.05, 8), steel(), -0.14, 0.57, 0);
  g.userData.mats = { body: band, ring };
  return flatten(g);
}

// Round control building: a silo with a status ring at the top, a hatch, a door and small lit windows. (workflow, variant 3)
function buildSilo(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  padOf(put, 0.46);
  put(C(0.36, 0.4, 0.52), hull(), 0, 0.31, 0);
  put(C(0.37, 0.37, 0.05), band, 0, 0.55, 0);
  put(C(0.3, 0.36, 0.08), hullD(), 0, 0.62, 0);
  put(C(0.14, 0.14, 0.05, 12), steel(), 0, 0.68, 0);
  put(B(0.17, 0.25, 0.06), blueM(), 0, 0.18, 0.385); put(B(0.11, 0.2, 0.065), ring, 0, 0.17, 0.39);
  for (const sx of [-1, 1]) put(B(0.07, 0.045, 0.04), ring, sx * 0.19, 0.4, 0.31, [0, sx * 0.55, 0]);
  put(C(0.016, 0.016, 0.34, 6), steel(), -0.3, 0.26, -0.18);
  g.userData.mats = { body: band, ring };
  return flatten(g);
}

// Rocket on a landing pad, for Claude: white hull, blue fins and band, round windows, orange landing legs.
function buildRocket(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(C(0.56, 0.6, 0.04, 20), darkM(), 0, 0.02, 0);
  put(new THREE.TorusGeometry(0.5, 0.014, 5, 28), orangeM(), 0, 0.045, 0, [Math.PI / 2, 0, 0]);
  put(C(0.14, 0.17, 0.66), hull(), 0, 0.52, 0);
  put(C(0.155, 0.155, 0.05), band, 0, 0.72, 0);
  put(new THREE.ConeGeometry(0.14, 0.36, 14), hull(), 0, 1.03, 0);
  put(new THREE.ConeGeometry(0.04, 0.1, 8), blueM(), 0, 1.26, 0);
  for (const y of [0.6, 0.8]) { put(C(0.05, 0.05, 0.03, 10).rotateX(Math.PI / 2), steel(), 0, y, 0.15); put(C(0.036, 0.036, 0.035, 10).rotateX(Math.PI / 2), ring, 0, y, 0.155); }
  put(B(0.1, 0.16, 0.03), steel(), 0, 0.32, 0.168); put(B(0.07, 0.12, 0.035), ring, 0, 0.32, 0.172);
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group(); pivot.rotation.y = (i * Math.PI * 2) / 3;
    const leg = mesh(C(0.014, 0.014, 0.36, 6), orangeM(), 0.24, 0.2, 0); leg.rotation.z = -0.55; pivot.add(leg);
    pivot.add(mesh(B(0.07, 0.02, 0.07), orangeM(), 0.34, 0.03, 0));
    const fin = mesh(B(0.14, 0.3, 0.03), blueM(), 0.2, 0.32, 0); fin.rotation.z = -0.2; const finPivot = new THREE.Group(); finPivot.rotation.y = (i * Math.PI * 2) / 3 + Math.PI / 3; finPivot.add(fin);
    g.add(pivot, finPivot);
  }
  g.userData.mats = { body: band, ring };
  return flatten(g);
}

// Six-wheeled rover, for the auto-commit bot: boxy hull, dark cab, orange stripe, antenna dish and headlights.
function buildRover(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(B(0.5, 0.14, 0.28), hull(), 0, 0.2, 0);
  put(B(0.5, 0.025, 0.285), orangeM(), 0, 0.245, 0);
  put(B(0.1, 0.03, 0.285), band, 0.14, 0.285, 0);
  put(B(0.24, 0.12, 0.24), hullD(), -0.08, 0.33, 0); put(B(0.02, 0.085, 0.2), darkM(), 0.047, 0.335, 0);
  for (const sx of [-0.18, 0, 0.18]) for (const sz of [-1, 1]) put(C(0.075, 0.075, 0.07, 10).rotateX(Math.PI / 2), darkM(), sx, 0.08, sz * 0.17);
  put(C(0.007, 0.007, 0.26, 5), steel(), -0.2, 0.42, -0.08); put(new THREE.SphereGeometry(0.075, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), hull(), -0.2, 0.54, -0.08, [-0.9, 0, 0]);
  for (const sz of [-1, 1]) put(B(0.02, 0.04, 0.06), ring, 0.255, 0.22, sz * 0.09);
  g.userData.mats = { body: band, ring };
  return flatten(g);
}

// A small cabin with a flagpole, for you: a pale module with an orange door, a lit window and a flag.
function buildCabin(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  padOf(put, 0.5);
  put(B(0.62, 0.3, 0.46), hull(), 0, 0.2, 0);
  put(B(0.64, 0.04, 0.48), band, 0, 0.36, 0);
  put(B(0.5, 0.04, 0.34), hullD(), 0, 0.4, 0); put(C(0.04, 0.04, 0.05, 8), steel(), -0.12, 0.44, 0);
  put(B(0.17, 0.25, 0.05), orangeM(), -0.1, 0.18, 0.24); put(B(0.11, 0.2, 0.055), ring, -0.1, 0.18, 0.245);
  put(B(0.15, 0.1, 0.03), ring, 0.15, 0.25, 0.235);
  put(C(0.008, 0.008, 0.72, 5), steel(), 0.28, 0.55, -0.16);
  put(new THREE.PlaneGeometry(0.24, 0.16), shared({ map: flagSkin().map, side: THREE.DoubleSide, roughness: 0.8 }), 0.4, 0.82, -0.16);
  g.userData.mats = { body: band, ring };
  return flatten(g);
}

// Satellite dish on a round base, for Cowork agents: a big white dish on a yoke, with a feed arm.
export function buildDish(status) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(C(0.3, 0.34, 0.14), hullD(), 0, 0.09, 0);
  put(C(0.31, 0.31, 0.03), band, 0, 0.16, 0);
  put(C(0.2, 0.2, 0.02), ring, 0, 0.18, 0);
  put(C(0.07, 0.09, 0.3, 10), steel(), 0, 0.33, 0);
  put(B(0.22, 0.05, 0.08), steel(), 0, 0.5, 0);
  put(new THREE.SphereGeometry(0.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), hull(), 0, 0.7, 0, [-0.95, 0, 0]);
  put(C(0.01, 0.01, 0.36, 5), steel(), 0, 0.86, 0.2, [0.5, 0, 0]); put(new THREE.SphereGeometry(0.03, 6, 5), glowShared(ORANGE, 1.4), 0, 1.0, 0.33);
  g.userData.mats = { body: band, ring };
  return flatten(g);
}

// The headquarters of each island, "moon base": a wide drum with a glass geodesic dome, an entrance block with a glowing
// door and steps, a connector tube each side, and a dish on top.
export function buildPod(status, scale = 1) {
  const g = new THREE.Group(), put = adder(g), { band, ring } = statusMats(status);
  put(C(0.58, 0.62, 0.05, 18), skinned(concreteSkin(0x6a7080), { roughness: 0.9 }), 0, 0.025, 0);
  put(C(0.5, 0.54, 0.3, 18), hull(), 0, 0.2, 0);
  put(C(0.512, 0.512, 0.045, 18), band, 0, 0.3, 0);
  put(C(0.52, 0.52, 0.03, 18), blueM(), 0, 0.12, 0);
  put(C(0.44, 0.5, 0.06, 18), hullD(), 0, 0.37, 0);
  put(C(0.16, 0.18, 0.28, 10), steel(), 0, 0.54, 0); put(new THREE.SphereGeometry(0.06, 8, 6), ring, 0, 0.7, 0);
  put(new THREE.SphereGeometry(0.42, 22, 9, 0, Math.PI * 2, 0, Math.PI / 2), glassM(), 0, 0.4, 0);
  put(C(0.012, 0.012, 0.22, 5), steel(), 0.1, 0.9, 0); put(new THREE.SphereGeometry(0.11, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), hull(), 0.1, 1.03, 0, [-0.8, 0, 0]);
  put(B(0.34, 0.27, 0.2), hull(), 0, 0.17, 0.5); put(B(0.22, 0.21, 0.04), blueM(), 0, 0.15, 0.61); put(B(0.15, 0.18, 0.045), ring, 0, 0.14, 0.615);
  put(B(0.3, 0.03, 0.1), steel(), 0, 0.045, 0.7); put(B(0.26, 0.02, 0.07), steel(), 0, 0.025, 0.76);
  put(B(0.26, 0.05, 0.02), darkM(), 0, 0.3, 0.605);
  for (const sx of [-1, 1]) { put(C(0.12, 0.12, 0.34, 10).rotateZ(Math.PI / 2), hull(), sx * 0.58, 0.16, 0.05); put(C(0.125, 0.125, 0.06, 10).rotateZ(Math.PI / 2), blueM(), sx * 0.5, 0.16, 0.05); }
  flatten(g);
  g.scale.setScalar(scale);
  g.userData.mats = { body: band, ring };
  return g;
}

// An astronaut for every agent: a chunky white suit with stripes and a mission patch in the agent's colour (blue for
// workflows, pink for Claude, red for the bot, orange for Cowork), a big round helmet with a dark glass visor, ear
// pods, a chest control box with a hose to the backpack, puffy gloves and boots. No face: the visor is just glass.
// The patch is a plain coloured disc, not any real agency's badge.
export function buildRobot(kind, name) {
  const trim = kind === 'builder' ? (name === 'Auto-commit bot' ? BOT.bot : BOT.builder) : BOT[kind] || BOT.workflow;
  const WHITE = 0xf3f5f9, GREY = 0xdfe4ec, STEEL = 0x8b94a3, DARK = 0x4a5160;
  // One vertex-coloured fabric material (its own, because the alarm flashes it red) covers the whole suit, so every
  // part of it merges into a single mesh.
  const g = new THREE.Group(), suit = skinned(fabricSkin(), { color: 0xffffff, vertexColors: true, roughness: 0.8, bumpScale: 0.6 }, true);
  const at = (geo, hex, x, y, z, rot) => { const m = mesh(paint(geo, hex), suit, x, y, z); if (rot) m.rotation.set(...rot); g.add(m); return m; };
  for (const x of [-0.047, 0.047]) {
    at(new THREE.CylinderGeometry(0.047, 0.042, 0.2, 8), WHITE, x, 0.11, 0);              // leg
    at(new THREE.CylinderGeometry(0.0485, 0.0485, 0.022, 8), trim, x, 0.13, 0);            // knee stripe
    at(new THREE.BoxGeometry(0.088, 0.07, 0.14), GREY, x, 0.035, 0.02);                    // boot
    at(new THREE.BoxGeometry(0.094, 0.02, 0.146), DARK, x, 0.01, 0.02);                    // sole
  }
  at(new THREE.CapsuleGeometry(0.095, 0.12, 3, 10), WHITE, 0, 0.31, 0);                    // torso
  at(new THREE.CylinderGeometry(0.0975, 0.0975, 0.024, 12), trim, 0, 0.2, 0);              // waist stripe
  at(new THREE.CylinderGeometry(0.075, 0.088, 0.03, 12), STEEL, 0, 0.465, 0);              // neck ring
  at(new THREE.BoxGeometry(0.125, 0.095, 0.05), GREY, 0, 0.34, 0.1);                       // chest control box
  at(new THREE.CylinderGeometry(0.027, 0.027, 0.01, 12), trim, -0.03, 0.352, 0.127, [Math.PI / 2, 0, 0]);   // mission patch
  at(new THREE.BoxGeometry(0.032, 0.012, 0.012), STEEL, 0.03, 0.318, 0.127);               // vent slot
  at(new THREE.BoxGeometry(0.014, 0.014, 0.012), trim, 0.04, 0.352, 0.127);                // indicator button
  at(new THREE.BoxGeometry(0.15, 0.2, 0.08), GREY, 0, 0.33, -0.12);                        // life-support backpack
  at(new THREE.TorusGeometry(0.05, 0.009, 5, 10, Math.PI), STEEL, 0.1, 0.31, 0, [0, Math.PI / 2, 0]);        // hose from chest to backpack
  for (const side of [-1, 1]) at(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10).rotateZ(Math.PI / 2), GREY, side * 0.165, 0.6, 0);   // ear pods
  // the helmet and its glass visor (a cap of a slightly larger sphere, facing front)
  g.add(mesh(new THREE.SphereGeometry(0.158, 18, 14), toy(0xffffff, { roughness: 0.22, metalness: 0.08, clearcoat: 0.9, clearcoatRoughness: 0.12 }), 0, 0.6, 0));
  const glass = visorSkin();
  g.add(mesh(new THREE.SphereGeometry(0.162, 14, 8, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.78, 1.3),
    skinned(glass, { color: 0xffffff, emissiveMap: glass.map, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.08, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.04 }), 0, 0.6, 0));
  flatten(g);
  // each arm hangs from a shoulder pivot, so swinging it looks like an arm and not a spinning stick
  const arms = [-1, 1].map(side => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.135, 0.43, 0);
    shoulder.add(mesh(paint(new THREE.CapsuleGeometry(0.037, 0.1, 2, 6), WHITE), suit, 0, -0.07, 0));              // sleeve
    shoulder.add(mesh(paint(new THREE.CylinderGeometry(0.0385, 0.0385, 0.022, 8), trim), suit, 0, -0.045, 0));      // arm stripe
    shoulder.add(mesh(paint(new THREE.BoxGeometry(0.012, 0.034, 0.05), trim), suit, side * 0.038, -0.015, 0));       // shoulder patch
    shoulder.add(mesh(paint(new THREE.SphereGeometry(0.044, 6, 5), GREY), suit, 0, -0.165, 0));                      // puffy glove
    flatten(shoulder);   // the whole arm becomes one mesh
    g.add(shoulder); return shoulder;
  });
  g.userData = { arms, body: suit };
  return g;
}

// The hub in the middle of the world: a big rocket on a landing pad, in the same style as Claude's, that pages fly up to.
// `ring` is the glow (the pad's light ring and the round windows) and `orb` the beacon on the nose; the scene pulses both.
const strut = (a, b, r, mat) => {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), len = d.length();
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 6), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
};
export function buildHub() {
  const g = new THREE.Group(), put = adder(g), ring = glow(0x7fd6ff, 1.2), orb = glow(0xff9a3a, 1.8), beacon = glow(0xff9a3a, 1.6);
  const orange = orangeM(), blue = blueM(), rim = steel();
  // the pad
  put(C(2.5, 2.8, 0.7, 16), skinned(concreteSkin(0x4c5262), { roughness: 0.85 }), 0, 0.35, 0);
  put(C(1.9, 2.1, 0.3, 16), hull(), 0, 0.85, 0);
  put(C(1.78, 1.78, 0.05, 16), ring, 0, 1.02, 0);
  put(new THREE.TorusGeometry(1.45, 0.045, 5, 40), orange, 0, 1.06, 0, [Math.PI / 2, 0, 0]);
  // the hull: a tapering body, a nose cone, and blue bands
  put(C(0.86, 0.98, 3.3, 20), hull(), 0, 3.2, 0);
  put(C(1.0, 1.0, 0.2, 20), blue, 0, 2.2, 0);
  put(C(0.93, 0.93, 0.14, 20), blue, 0, 4.55, 0);
  put(new THREE.ConeGeometry(0.87, 1.7, 20), hull(), 0, 5.7, 0);
  put(new THREE.ConeGeometry(0.2, 0.55, 10), blue, 0, 6.5, 0);
  put(C(0.02, 0.02, 0.35, 5), rim, 0, 6.9, 0);
  put(new THREE.SphereGeometry(0.15, 12, 8), orb, 0, 7.12, 0);
  // round windows down the front, each with a steel rim and a glowing pane
  for (const y of [3.05, 3.7, 4.2]) {
    const r = 0.94 - (4.85 - y) * 0.035;
    put(C(0.23, 0.23, 0.08, 14).rotateX(Math.PI / 2), rim, 0, y, r);
    put(C(0.17, 0.17, 0.09, 14).rotateX(Math.PI / 2), ring, 0, y, r + 0.01);
  }
  // an engine hatch low on the front
  put(B(0.62, 0.8, 0.1), rim, 0, 1.95, 0.99); put(B(0.46, 0.64, 0.11), ring, 0, 1.95, 1.0);
  // four orange landing legs with round feet, and four blue fins between them
  for (let i = 0; i < 4; i++) {
    const t = (i * Math.PI) / 2 + Math.PI / 4, c = Math.cos(t), sn = Math.sin(t);
    g.add(strut([c * 0.95, 2.35, sn * 0.95], [c * 2.0, 1.05, sn * 2.0], 0.075, orange));
    put(C(0.32, 0.32, 0.08, 10), orange, c * 2.0, 1.07, sn * 2.0);
    const fin = new THREE.Group(); fin.rotation.y = -(t + Math.PI / 4) + Math.PI / 2;
    const f = mesh(B(0.14, 1.5, 0.95), blue, 1.2, 2.35, 0); f.rotation.z = -0.22; fin.add(f); g.add(fin);
  }
  g.userData = { orb, ring, beacon };
  return flatten(g);
}

// Small text symbols ("!", "z") that float above characters.
export function symbolSprite(text, color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = '#1b1d28'; x.strokeText(text, 32, 34); x.fillStyle = color; x.fillText(text, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  s.scale.set(0.34, 0.34, 1); s.renderOrder = 10;
  return s;
}

// A big bold "z Z Z" that floats over an agent that is not working, climbing and growing like a cartoon sleeper's.
export function sleepSprite() {
  const c = document.createElement('canvas'); c.width = 192; c.height = 96;
  const x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round'; x.lineWidth = 10; x.strokeStyle = '#1b2236';
  for (const [ch, px, py, size] of [['z', 36, 74, 40], ['Z', 90, 54, 56], ['Z', 148, 36, 74]]) {
    x.font = `bold ${size}px sans-serif`; x.strokeText(ch, px, py); x.fillStyle = '#eaf0ff'; x.fillText(ch, px, py);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  s.scale.set(1.4, 0.7, 1); s.renderOrder = 10;
  return s;
}

// The cyan speech-bubble icon that floats over an agent that is working right now.
export function workingIcon() {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#bff6ff'; x.strokeStyle = '#2fc8f0'; x.lineWidth = 6;
  x.beginPath(); x.roundRect(10, 8, 76, 62, 16); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(30, 68); x.lineTo(24, 90); x.lineTo(48, 70); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#1b89b4'; for (const px of [30, 48, 66]) { x.beginPath(); x.arc(px, 39, 6, 0, Math.PI * 2); x.fill(); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  s.scale.set(0.5, 0.5, 1); s.renderOrder = 10;
  return s;
}

// Variety between neighbouring buildings comes from a stable number per agent (0..1). Workflows are habitats (dome, tube
// or silo), Claude is a rocket, the auto-commit bot a rover, you a cabin with a flag, and Cowork agents are dishes.
const HABITATS = [buildHabDome, buildHabTube, buildSilo];
export const buildingFor = (agent, status, pick = 0) =>
  agent.kind === 'workflow' ? HABITATS[Math.floor(pick * 3) % 3](status)
  : agent.kind === 'human' ? buildCabin(status)
  : agent.kind === 'local' ? buildDish(status)
  : agent.name === 'Auto-commit bot' ? buildRover(status) : buildRocket(status);
export { THREE };
