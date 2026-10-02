// Procedural 3D models in a chunky, toy-like style: white and ice-blue drum buildings with coloured roofs,
// terracotta domes, red-and-white towers and tiny robots. Everything is built from simple three.js shapes,
// so there are no model or image files to load.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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

const toy = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, ...extra });
const glow = (color, k = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
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
// white hatch and one of three rooftop props (solar panel, stacked crates, cubes), like the reference.
export function buildTower(status, variant = 0) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const roof = toy(s.body, { roughness: 0.35 }), windows = glow(s.glow, 1.1);
  g.add(mesh(DRUM(0.44, 0.47, 0.5), toy(PALETTE.ice), 0, 0.25, 0));
  g.add(mesh(DRUM(0.485, 0.485, 0.06), toy(PALETTE.white), 0, 0.3, 0));
  for (const [x, z, r] of [[0.45, 0, 0], [-0.45, 0, 0], [0, 0.45, Math.PI / 2], [0, -0.45, Math.PI / 2]]) {
    const w = mesh(round(0.06, 0.14, 0.17, 0.02), windows, x, 0.2, z); w.rotation.y = r; g.add(w);
  }
  g.add(mesh(DRUM(0.34, 0.45, 0.14), roof, 0, 0.57, 0));
  g.add(mesh(DRUM(0.22, 0.26, 0.07), toy(PALETTE.white), 0, 0.66, 0));
  if (variant === 0) {
    const panel = mesh(round(0.32, 0.05, 0.22, 0.02), toy(PALETTE.blue, { roughness: 0.25 }), 0, 0.78, 0); panel.rotation.set(-0.35, 0.4, 0); g.add(panel);
    g.add(mesh(round(0.12, 0.12, 0.12), toy(PALETTE.teal), 0.2, 0.74, 0.1));
  } else if (variant === 1) {
    g.add(mesh(round(0.2, 0.12, 0.2), toy(PALETTE.red), 0.02, 0.74, 0.02));
    g.add(mesh(round(0.2, 0.1, 0.2), toy(PALETTE.white), 0.02, 0.85, 0.02));
    g.add(mesh(round(0.12, 0.1, 0.12), toy(PALETTE.red), 0.02, 0.95, 0.02));
  } else {
    g.add(mesh(round(0.14, 0.14, 0.14), toy(PALETTE.teal), -0.1, 0.77, 0));
    g.add(mesh(round(0.14, 0.14, 0.14), toy(PALETTE.red), 0.1, 0.77, 0.04));
  }
  g.userData.mats = { body: roof, ring: windows };
  return g;
}

// The building for Claude and the auto-commit bot: a red tripod rig carrying an ice-blue drum, like the
// "design-system" rig in the reference.
export function buildRig(status) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const cap = toy(s.body), windows = glow(s.glow, 1.1), legs = toy(PALETTE.red);
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group(); pivot.rotation.y = (i * Math.PI * 2) / 3;
    const leg = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.72, 8), legs, 0.2, 0.36, 0); leg.rotation.z = 0.36; pivot.add(leg); g.add(pivot);
  }
  g.add(mesh(DRUM(0.2, 0.26, 0.3), toy(PALETTE.ice), 0, 0.72, 0));
  g.add(mesh(DRUM(0.27, 0.27, 0.05), windows, 0, 0.76, 0));
  g.add(mesh(DRUM(0.14, 0.2, 0.1), cap, 0, 0.93, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), toy(PALETTE.white), 0, 1.09, 0));
  g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), glow(s.glow, 1.4), 0, 1.22, 0));
  g.userData.mats = { body: cap, ring: windows };
  return g;
}

// A terracotta drum with a brown dome: the building for Claude, the auto-commit bot and each repo's headquarters.
export function buildPod(status, scale = 1) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const dome = toy(PALETTE.brown, { roughness: 0.4 }), stripe = glow(s.glow, 1.0);
  g.add(mesh(DRUM(0.46, 0.5, 0.42), toy(PALETTE.terracotta), 0, 0.21, 0));
  g.add(mesh(DRUM(0.505, 0.505, 0.05), toy(0xb85f2c), 0, 0.12, 0));
  g.add(mesh(DRUM(0.475, 0.475, 0.04), stripe, 0, 0.38, 0));
  g.add(mesh(HALF(0.44), dome, 0, 0.4, 0));
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), toy(PALETTE.white), 0.1, 0.83, 0.05));
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6), toy(PALETTE.white), -0.08, 0.95, -0.05));
  g.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), glow(PALETTE.red, 1.2), -0.08, 1.12, -0.05));
  g.scale.setScalar(scale);
  g.userData.mats = { body: dome, ring: stripe };
  return g;
}

// A small white house with a blue roof: the building for a person.
export function buildHouse(status) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const roof = toy(s.body), door = glow(s.glow, 1.0);
  g.add(mesh(round(0.72, 0.42, 0.62, 0.05), toy(PALETTE.white), 0, 0.21, 0));
  const top = mesh(new THREE.ConeGeometry(0.62, 0.36, 4), roof, 0, 0.6, 0); top.rotation.y = Math.PI / 4; g.add(top);
  g.add(mesh(round(0.16, 0.24, 0.04, 0.015), door, 0, 0.13, 0.32));
  g.add(mesh(round(0.14, 0.12, 0.04, 0.015), door, 0.22, 0.26, 0.32));
  g.userData.mats = { body: roof, ring: door };
  return g;
}

// A white dish on a drum: the building for a Cowork / local agent.
export function buildDish(status) {
  const s = STATUS[status] || STATUS.asleep, g = new THREE.Group();
  const dish = toy(PALETTE.white), ring = glow(s.glow, 0.9);
  g.add(mesh(DRUM(0.36, 0.42, 0.26), toy(PALETTE.ice), 0, 0.13, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.46, 8), toy(PALETTE.white), 0, 0.47, 0));
  const d = mesh(HALF(0.38, 20), dish, 0, 0.74, 0); d.rotation.x = -0.9; g.add(d);
  g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), ring, 0, 0.9, 0.18));
  g.userData.mats = { body: dish, ring };
  return g;
}

// The little character that works at a building. Arms are kept so they can swing while typing.
export function buildRobot(kind, name) {
  const color = kind === 'builder' ? (name === 'Auto-commit bot' ? BOT.bot : BOT.builder) : BOT[kind] || BOT.workflow;
  const g = new THREE.Group(), body = toy(color, { roughness: 0.4 }), white = toy(PALETTE.white), human = kind === 'human';
  for (const x of [-0.04, 0.04]) g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), white, x, 0.1, 0));
  g.add(mesh(new THREE.CapsuleGeometry(0.08, 0.12, 6, 12), body, 0, 0.3, 0));
  g.add(mesh(new THREE.SphereGeometry(0.095, 16, 12), toy(human ? 0xffd9b0 : PALETTE.white, { roughness: 0.4 }), 0, 0.5, 0));
  const eye = glow(human ? 0x222233 : 0x59d6ff, 1.4);
  for (const x of [-0.035, 0.035]) g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), eye, x, 0.51, 0.082));
  if (!human) {
    g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 6), white, 0, 0.64, 0));
    g.add(mesh(new THREE.SphereGeometry(0.026, 8, 6), glow(color, 1.2), 0, 0.7, 0));
  }
  const arms = [-1, 1].map(side => { const a = mesh(new THREE.CapsuleGeometry(0.022, 0.1, 4, 8), body, side * 0.115, 0.3, 0); g.add(a); return a; });
  g.userData = { arms, body };
  return g;
}

// The hub in the middle of the world: a tall red-and-white radio tower that pages fly to.
export function buildHub() {
  const g = new THREE.Group(), beacon = glow(0xff6a4a, 1.6), ring = glow(0x7fd6ff, 1.2);
  g.add(mesh(DRUM(2.5, 2.8, 0.7), toy(PALETTE.slate), 0, 0.35, 0));
  g.add(mesh(DRUM(1.5, 1.7, 1.2), toy(PALETTE.white), 0, 1.3, 0));
  g.add(mesh(DRUM(1.2, 1.5, 0.3), toy(PALETTE.ice), 0, 2.05, 0));
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.CylinderGeometry(0.42 - i * 0.05, 0.5 - i * 0.05, 0.9, 12), toy(i % 2 ? PALETTE.white : PALETTE.red), 0, 2.6 + i * 0.9, 0));
  const platform = mesh(DRUM(0.9, 0.9, 0.12), toy(PALETTE.white), 0, 4.6, 0); g.add(platform);
  const dish = mesh(HALF(0.5, 20), toy(PALETTE.white), 0.35, 5.0, 0.2); dish.rotation.set(-0.6, 0.5, 0); g.add(dish);
  g.add(mesh(DRUM(1.28, 1.28, 0.06), ring, 0, 2.2, 0));
  const orb = glow(0xff6a4a, 1.8);
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), toy(PALETTE.white), 0, 5.4, 0));
  g.add(mesh(new THREE.SphereGeometry(0.2, 18, 14), orb, 0, 5.95, 0));
  g.userData = { orb, ring, beacon };
  return g;
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
