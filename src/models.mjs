// Procedural 3D models in a chunky, toy-like style: white and ice-blue drum buildings with coloured roofs,
// terracotta domes, red-and-white towers and tiny robots. Everything is built from simple three.js shapes and
// dressed with procedural textures (panels, plaster, shingles, wood), so there are no model or image files to load.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { panelSkin, ribSkin, plasterSkin, domeSkin, shingleSkin, solarSkin, crateSkin, concreteSkin, fabricSkin, faceSkin } from './textures.mjs';

export const PALETTE = { white: 0xf3f6ff, ice: 0xa9d3ff, iceDark: 0x78b4f0, blue: 0x3b72f2, red: 0xe2493a, teal: 0x2fb89b,
  brown: 0x7a4130, terracotta: 0xe08a4a, slate: 0x2c3050, yellow: 0xf2c94c };
// Roof colour (body) and window/stripe glow by status. "ok" is the blue roof of the reference.
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
const sharedMats = new Map();
const shared = p => {
  const key = JSON.stringify(p, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (!sharedMats.has(key)) sharedMats.set(key, make(p));
  return sharedMats.get(key);
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
  for (const [material, e, geo] of built) { const m = new THREE.Mesh(geo, material); m.castShadow = e.cast; g.add(m); }
  return g;
}
const DARK = 0x262b38;
// Only parts big enough to matter cast a shadow; the many tiny ones would just cost frames.
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  geo.computeBoundingSphere(); m.castShadow = geo.boundingSphere.radius >= 0.3;
  return m;
};
const HALF = (r, seg = 24) => new THREE.SphereGeometry(r, seg, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const DRUM = (rTop, rBot, h) => new THREE.CylinderGeometry(rTop, rBot, h, 8);   // an octagonal drum

const round = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, r);

// The building for a GitHub Actions workflow: an ice-blue drum with a status-coloured roof and windows, a
// white hatch and one of three rooftop props (solar panel, stacked crates, cubes), like the reference. It now has
// a concrete plinth, riveted panels, framed windows, a drain pipe and a roof vent.
export function buildTower(status, variant = 0) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const roof = skinned(ribSkin(s.body), { roughness: 0.35, metalness: 0.25, clearcoat: 0.4, clearcoatRoughness: 0.3 }, true), windows = glow(s.glow, 1.1), frame = toy(DARK, { roughness: 0.6 });
  const white = () => skinned(panelSkin(PALETTE.white)), crate = c => skinned(crateSkin(c), { roughness: 0.7 });
  g.add(mesh(DRUM(0.5, 0.53, 0.05), skinned(concreteSkin(0x8d93a3), { roughness: 0.9 }), 0, 0.025, 0));
  g.add(mesh(DRUM(0.44, 0.47, 0.5), skinned(panelSkin(PALETTE.ice)), 0, 0.25, 0));
  g.add(mesh(DRUM(0.485, 0.485, 0.06), white(), 0, 0.3, 0));
  for (const [x, z, r] of [[0.45, 0, 0], [-0.45, 0, 0], [0, 0.45, Math.PI / 2], [0, -0.45, Math.PI / 2]]) {
    const f = mesh(round(0.05, 0.17, 0.2, 0.012), frame, x * 0.97, 0.2, z * 0.97); f.rotation.y = r; g.add(f);
    const w = mesh(round(0.06, 0.14, 0.17, 0.02), windows, x, 0.2, z); w.rotation.y = r; g.add(w);
  }
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 6), toy(0x9aa3b4, { metalness: 0.6, roughness: 0.35 }), 0.4, 0.28, 0.17));
  g.add(mesh(DRUM(0.34, 0.45, 0.14), roof, 0, 0.57, 0));
  g.add(mesh(DRUM(0.22, 0.26, 0.07), white(), 0, 0.66, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8), frame, -0.15, 0.7, -0.1));
  if (variant === 0) {
    const panel = mesh(round(0.32, 0.05, 0.22, 0.02), skinned(solarSkin(PALETTE.blue), { roughness: 0.2, metalness: 0.3 }), 0, 0.78, 0); panel.rotation.set(-0.35, 0.4, 0); g.add(panel);
    g.add(mesh(round(0.12, 0.12, 0.12), crate(PALETTE.teal), 0.2, 0.74, 0.1));
  } else if (variant === 1) {
    g.add(mesh(round(0.2, 0.12, 0.2), crate(PALETTE.red), 0.02, 0.74, 0.02));
    g.add(mesh(round(0.2, 0.1, 0.2), crate(PALETTE.white), 0.02, 0.85, 0.02));
    g.add(mesh(round(0.12, 0.1, 0.12), crate(PALETTE.red), 0.02, 0.95, 0.02));
  } else {
    g.add(mesh(round(0.14, 0.14, 0.14), crate(PALETTE.teal), -0.1, 0.77, 0));
    g.add(mesh(round(0.14, 0.14, 0.14), crate(PALETTE.red), 0.1, 0.77, 0.04));
  }
  g.userData.mats = { body: roof, ring: windows };
  return flatten(g);
}

// The building for Claude and the auto-commit bot: a red tripod rig carrying an ice-blue drum, like the
// "design-system" rig in the reference.
export function buildRig(status) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const cap = skinned(ribSkin(s.body), { metalness: 0.25 }, true), windows = glow(s.glow, 1.1), legs = toy(PALETTE.red, { metalness: 0.35, roughness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group(); pivot.rotation.y = (i * Math.PI * 2) / 3;
    const leg = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.72, 8), legs, 0.2, 0.36, 0); leg.rotation.z = 0.36; pivot.add(leg);
    pivot.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), toy(DARK, { metalness: 0.5 }), 0.37, 0.015, 0));   // foot plate
    g.add(pivot);
  }
  g.add(mesh(DRUM(0.2, 0.26, 0.3), skinned(panelSkin(PALETTE.ice)), 0, 0.72, 0));
  g.add(mesh(DRUM(0.27, 0.27, 0.05), windows, 0, 0.76, 0));
  g.add(mesh(DRUM(0.14, 0.2, 0.1), cap, 0, 0.93, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), toy(PALETTE.white, { metalness: 0.5 }), 0, 1.09, 0));
  g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), glow(s.glow, 1.4), 0, 1.22, 0));
  g.userData.mats = { body: cap, ring: windows };
  return flatten(g);
}

// A terracotta drum with a brown dome: the building for Claude, the auto-commit bot and each repo's headquarters.
// Plastered walls, a segmented dome, a plinth, a doorway and side vents.
export function buildPod(status, scale = 1) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const dome = skinned(domeSkin(PALETTE.brown), { roughness: 0.4, metalness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.25 }, true), stripe = glow(s.glow, 1.0);
  g.add(mesh(DRUM(0.5, 0.54, 0.05), skinned(concreteSkin(0x9a8f84), { roughness: 0.9 }), 0, 0.025, 0));
  g.add(mesh(DRUM(0.46, 0.5, 0.42), skinned(plasterSkin(PALETTE.terracotta), { roughness: 0.85 }), 0, 0.21, 0));
  g.add(mesh(DRUM(0.505, 0.505, 0.05), skinned(plasterSkin(0xb85f2c), { roughness: 0.85 }), 0, 0.12, 0));
  g.add(mesh(DRUM(0.475, 0.475, 0.04), stripe, 0, 0.38, 0));
  g.add(mesh(HALF(0.44), dome, 0, 0.4, 0));
  g.add(mesh(round(0.19, 0.25, 0.05, 0.02), toy(0xf0d8b8, { roughness: 0.8 }), 0, 0.17, 0.465));          // door frame
  g.add(mesh(round(0.14, 0.2, 0.06, 0.02), toy(0x3a2418, { roughness: 0.7 }), 0, 0.155, 0.47));            // door
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const v = mesh(new THREE.BoxGeometry(0.1, 0.012, 0.03), toy(0x4a2a1c), sx * 0.34, 0.24 + k * 0.035, 0.3); v.rotation.y = sx * 0.9; g.add(v);   // vent slats
  }
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), skinned(panelSkin(PALETTE.white)), 0.1, 0.83, 0.05));
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6), toy(PALETTE.white, { metalness: 0.5 }), -0.08, 0.95, -0.05));
  g.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), glow(PALETTE.red, 1.2), -0.08, 1.12, -0.05));
  flatten(g);
  g.scale.setScalar(scale);
  g.userData.mats = { body: dome, ring: stripe };
  return g;
}

// A small white house with a blue roof: the building for a person. Rendered walls, shingles, a brick chimney,
// a framed door and a window with mullions.
export function buildHouse(status) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const roof = skinned(shingleSkin(s.body), { roughness: 0.7 }, true), door = glow(s.glow, 1.0), trim = toy(0xe6e2da, { roughness: 0.7 });
  g.add(mesh(round(0.72, 0.42, 0.62, 0.05), skinned(plasterSkin(PALETTE.white), { roughness: 0.85 }), 0, 0.21, 0));
  const top = mesh(new THREE.ConeGeometry(0.62, 0.36, 4), roof, 0, 0.6, 0); top.rotation.y = Math.PI / 4; g.add(top);
  g.add(mesh(round(0.1, 0.2, 0.1, 0.01), skinned(plasterSkin(0xb5533c), { roughness: 0.9 }), 0.2, 0.66, -0.12));   // chimney
  g.add(mesh(round(0.2, 0.28, 0.04, 0.015), trim, 0, 0.14, 0.31));
  g.add(mesh(round(0.16, 0.24, 0.04, 0.015), door, 0, 0.13, 0.32));
  g.add(mesh(round(0.19, 0.17, 0.04, 0.015), trim, 0.22, 0.26, 0.31));
  g.add(mesh(round(0.14, 0.12, 0.04, 0.015), door, 0.22, 0.26, 0.32));
  g.add(mesh(new THREE.BoxGeometry(0.014, 0.12, 0.05), trim, 0.22, 0.26, 0.335));
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.014, 0.05), trim, 0.22, 0.26, 0.335));
  g.add(mesh(round(0.28, 0.03, 0.12, 0.01), skinned(concreteSkin(0x9aa0ad)), 0, 0.015, 0.4));                          // step
  g.userData.mats = { body: roof, ring: door };
  return flatten(g);
}

// A white dish on a drum: the building for a Cowork / local agent.
export function buildDish(status) {
  const s = STATUS[status] || STATUS.asleep, g = new THREE.Group();
  const dish = skinned(panelSkin(PALETTE.white), { metalness: 0.15, roughness: 0.4 }, true), ring = glow(s.glow, 0.9);
  g.add(mesh(DRUM(0.36, 0.42, 0.26), skinned(panelSkin(PALETTE.ice)), 0, 0.13, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.46, 8), toy(PALETTE.white, { metalness: 0.4, roughness: 0.4 }), 0, 0.47, 0));
  const d = mesh(HALF(0.38, 20), dish, 0, 0.74, 0); d.rotation.x = -0.9; g.add(d);
  g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), ring, 0, 0.9, 0.18));
  g.userData.mats = { body: dish, ring };
  return flatten(g);
}

// The little character that works at a building. Arms are kept so they can swing while typing.
// A fully dressed little character: dyed work clothes with a reflective vest stripe, belt, backpack, trousers, boots
// and hands. People get a face and a hard hat in their colour; the machines (workflows, Claude, the bot, Cowork)
// get a glossy white helmet with a dark visor, glowing eyes and an antenna.
export function buildRobot(kind, name) {
  const color = kind === 'builder' ? (name === 'Auto-commit bot' ? BOT.bot : BOT.builder) : BOT[kind] || BOT.workflow;
  const cloth = fabricSkin(), human = kind === 'human';
  const g = new THREE.Group(), body = skinned(cloth, { color, roughness: 0.7, bumpScale: 0.6 }, true);
  const trousers = skinned(cloth, { color: 0x333a52, roughness: 0.8, bumpScale: 0.6 }), boot = toy(0x2a211c, { roughness: 0.65 });
  const skinTone = toy(0xffd9b0, { roughness: 0.55 }), metal = toy(PALETTE.white, { metalness: 0.4, roughness: 0.35 });
  for (const x of [-0.04, 0.04]) {
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.2, 8), trousers, x, 0.1, 0));
    g.add(mesh(new THREE.BoxGeometry(0.058, 0.045, 0.1), boot, x, 0.022, 0.012));
  }
  g.add(mesh(new THREE.CapsuleGeometry(0.08, 0.12, 6, 12), body, 0, 0.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.0825, 0.0825, 0.028, 12), toy(0x3a2e26, { roughness: 0.6 }), 0, 0.215, 0));                      // belt
  g.add(mesh(new THREE.CylinderGeometry(0.0815, 0.0815, 0.024, 12), toy(0xdfe6f0, { roughness: 0.25, metalness: 0.35, emissive: 0x28303a }), 0, 0.33, 0)); // vest stripe
  g.add(mesh(round(0.11, 0.14, 0.05, 0.015), skinned(cloth, { color: human ? 0x4d5a3a : 0x394560, roughness: 0.85 }), 0, 0.31, -0.095));       // backpack
  if (human) {
    g.add(mesh(new THREE.SphereGeometry(0.118, 20, 16), skinned(faceSkin(), { color: 0xffd9b0, roughness: 0.55, bumpScale: 0.4 }), 0, 0.52, 0));
    const hat = toy(color, { roughness: 0.25, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.12 });
    g.add(mesh(new THREE.SphereGeometry(0.13, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 0.55, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.014, 14), hat, 0, 0.553, 0.014));
  } else {
    g.add(mesh(new THREE.SphereGeometry(0.12, 22, 18), toy(PALETTE.white, { roughness: 0.18, metalness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.1 }), 0, 0.52, 0));
    const visor = mesh(new THREE.SphereGeometry(0.095, 16, 12), toy(0x10151f, { roughness: 0.1, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.05 }), 0, 0.52, 0.055); visor.scale.set(1.05, 0.7, 0.62); g.add(visor);
    const eye = glow(0x59d6ff, 1.6);
    for (const x of [-0.042, 0.042]) g.add(mesh(new THREE.SphereGeometry(0.019, 10, 8), eye, x, 0.525, 0.106));
    g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.1, 6), metal, 0, 0.68, 0));
    g.add(mesh(new THREE.SphereGeometry(0.028, 10, 8), glow(color, 1.3), 0, 0.74, 0));
  }
  flatten(g);
  // each arm hangs from a shoulder pivot, so swinging it looks like an arm and not a spinning stick
  const arms = [-1, 1].map(side => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.115, 0.38, 0);
    shoulder.add(mesh(new THREE.CapsuleGeometry(0.024, 0.1, 4, 8), body, 0, -0.07, 0));
    shoulder.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), human ? skinTone : metal, 0, -0.15, 0));
    g.add(shoulder); return shoulder;
  });
  g.userData = { arms, body };
  return g;
}

// The hub in the middle of the world: a tall red-and-white radio tower that pages fly to.
export function buildHub() {
  const g = new THREE.Group(), beacon = glow(0xff6a4a, 1.6), ring = glow(0x7fd6ff, 1.2);
  g.add(mesh(DRUM(2.5, 2.8, 0.7), skinned(concreteSkin(PALETTE.slate), { roughness: 0.85 }), 0, 0.35, 0));
  g.add(mesh(DRUM(1.5, 1.7, 1.2), skinned(panelSkin(PALETTE.white)), 0, 1.3, 0));
  g.add(mesh(DRUM(1.2, 1.5, 0.3), skinned(panelSkin(PALETTE.ice)), 0, 2.05, 0));
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.CylinderGeometry(0.42 - i * 0.05, 0.5 - i * 0.05, 0.9, 12), skinned(panelSkin(i % 2 ? PALETTE.white : PALETTE.red), { metalness: 0.2 }), 0, 2.6 + i * 0.9, 0));
  const platform = mesh(DRUM(0.9, 0.9, 0.12), skinned(panelSkin(PALETTE.white)), 0, 4.6, 0); g.add(platform);
  const dish = mesh(HALF(0.5, 20), skinned(panelSkin(PALETTE.white), { metalness: 0.15 }), 0.35, 5.0, 0.2); dish.rotation.set(-0.6, 0.5, 0); g.add(dish);
  g.add(mesh(DRUM(1.28, 1.28, 0.06), ring, 0, 2.2, 0));
  const orb = glow(0xff6a4a, 1.8);
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), toy(PALETTE.white, { metalness: 0.5 }), 0, 5.4, 0));
  g.add(mesh(new THREE.SphereGeometry(0.2, 18, 14), orb, 0, 5.95, 0));
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

// Variety between neighbouring buildings comes from a stable number per agent (0..1).
export const buildingFor = (agent, status, pick = 0) =>
  agent.kind === 'workflow' ? buildTower(status, Math.floor(pick * 3) % 3)
  : agent.kind === 'human' ? buildHouse(status)
  : agent.kind === 'local' ? buildDish(status) : buildRig(status);
export { THREE };
