// The shared kit for every procedural 3D model: palettes, materials (shared ones merge into few draw calls), the
// flatten and bake steps that do the merging, and the small helpers the building, decor and character files use.
// There are no model or image files to load.
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
export function bakeStatics(root, groups, pickable = groups) {
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
  for (const g of pickable) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 8), invisible); p.position.y = 0.5; g.add(p); }
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


export { BOT, make, shared, glowShared, paint, toy, glow, skinned, flatten, mesh, DARK, HULL, HULL_D, STEEL, BLUE, ORANGE, DARKM,
  hull, hullD, steel, blueM, orangeM, darkM, glassM, C, B, adder, padOf, statusMats, THREE };
