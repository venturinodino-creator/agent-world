// Procedural 3D models in a glossy cartoon style: blue towers, orange domed pods, little robots.
// Everything is built from simple three.js shapes, so there are no model or image files to load.
import * as THREE from 'three';

// Body and glow colour by status. "ok" is the glossy blue of the reference; trouble turns the building red.
export const STATUS = {
  ok: { body: 0x3f7cff, glow: 0x59d6ff },
  running: { body: 0x35b6ff, glow: 0xc4f7ff },
  fail: { body: 0xd9455f, glow: 0xff5a72 },
  idle: { body: 0xe0a93b, glow: 0xffd36b },
  asleep: { body: 0x6f7aa5, glow: 0x8ea0d6 },
};
// Outline colour of an island by its health.
export const HEALTH = { ok: 0x41e08a, running: 0x3fd7e8, fail: 0xff5d6c, idle: 0xf2d24a, dormant: 0x4a5272 };
const BOT = { workflow: 0x8fc0ff, builder: 0xff7ab8, bot: 0xff5a5a, human: 0x3f7cff, local: 0xffa24a };

const gloss = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.2, ...extra });
const glow = (color, k = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
// Only parts big enough to matter cast a shadow; the many tiny ones (arms, eyes, antennas) would just cost frames.
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  geo.computeBoundingSphere(); m.castShadow = geo.boundingSphere.radius >= 0.3;
  return m;
};
const HALF = (r, seg = 24) => new THREE.SphereGeometry(r, seg, 12, 0, Math.PI * 2, 0, Math.PI / 2);
// A flat ring lying on the ground plane at height y.
const ringAt = (radius, tube, mat, y) => { const m = mesh(new THREE.TorusGeometry(radius, tube, 10, 36), mat, 0, y, 0); m.rotation.x = Math.PI / 2; return m; };

// A glossy tower with a glowing ring: the building for a GitHub Actions workflow.
export function buildTower(status) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const body = gloss(s.body), ring = glow(s.glow, 1.2);
  g.add(mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.18, 24), gloss(0x1d2a63), 0, 0.09, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.0, 24), body, 0, 0.68, 0));
  g.add(ringAt(0.38, 0.05, ring, 0.95));
  g.add(mesh(HALF(0.34), body, 0, 1.18, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), gloss(0xdfe8ff), 0, 1.45, 0));
  g.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), glow(s.glow, 1.6), 0, 1.62, 0));
  g.userData.mats = { body, ring };
  return g;
}

// An orange domed pod with a pink top: the building for Claude, the auto-commit bot and each repo's headquarters.
export function buildPod(status, scale = 1) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const body = gloss(0xe8803a, { roughness: 0.35 }), ring = glow(s.glow, 1.1);
  g.add(mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.26, 24), gloss(0xa94d24), 0, 0.13, 0));
  g.add(mesh(HALF(0.46), body, 0, 0.26, 0));
  g.add(ringAt(0.47, 0.04, ring, 0.27));
  g.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), gloss(0xff9ec0, { roughness: 0.2 }), 0, 0.66, 0));
  g.scale.setScalar(scale);
  g.userData.mats = { body, ring };
  return g;
}

// A small white house with a pink roof: the building for a person.
export function buildHouse(status) {
  const s = STATUS[status] || STATUS.ok, g = new THREE.Group();
  const roof = gloss(0xff7a8a), ring = glow(s.glow, 1.1);
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.45, 0.62), gloss(0xf3f6ff), 0, 0.225, 0));
  const top = mesh(new THREE.ConeGeometry(0.6, 0.38, 4), roof, 0, 0.64, 0); top.rotation.y = Math.PI / 4; g.add(top);
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.26, 0.04), ring, 0, 0.14, 0.32));
  g.userData.mats = { body: roof, ring };
  return g;
}

// A tilted dish on a stand: the building for a Cowork / local agent.
export function buildDish(status) {
  const s = STATUS[status] || STATUS.asleep, g = new THREE.Group();
  const body = gloss(0xffa24a), ring = glow(s.glow, 0.9);
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.22, 20), gloss(0x2c3a73), 0, 0.11, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 10), gloss(0xdfe8ff), 0, 0.45, 0));
  const dish = mesh(HALF(0.36, 20), body, 0, 0.78, 0); dish.rotation.x = -0.9; g.add(dish);
  g.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), ring, 0, 0.92, 0.18));
  g.userData.mats = { body, ring };
  return g;
}

// The little character that works at a building. Arms are kept so they can swing while typing.
export function buildRobot(kind, name) {
  const color = kind === 'builder' ? (name === 'Auto-commit bot' ? BOT.bot : BOT.builder) : BOT[kind] || BOT.workflow;
  const g = new THREE.Group(), body = gloss(color, { roughness: 0.3 });
  const human = kind === 'human';
  g.add(mesh(new THREE.CapsuleGeometry(0.1, 0.14, 6, 12), body, 0, 0.2, 0));
  const head = mesh(new THREE.SphereGeometry(0.115, 18, 14), gloss(human ? 0xffd9b0 : 0xeaf2ff, { roughness: 0.4 }), 0, 0.44, 0);
  g.add(head);
  const eye = glow(human ? 0x222233 : 0x59d6ff, 1.4);
  for (const x of [-0.045, 0.045]) g.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), eye, x, 0.455, 0.1));
  if (!human) {
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), gloss(0xdfe8ff), 0, 0.6, 0));
    g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), glow(color, 1.2), 0, 0.665, 0));
  }
  const arms = [-1, 1].map(side => { const a = mesh(new THREE.CapsuleGeometry(0.03, 0.09, 4, 8), body, side * 0.14, 0.22, 0); g.add(a); return a; });
  g.userData = { arms, body };
  return g;
}

// The hub in the middle of the world: a tall tower that pages fly to.
export function buildHub() {
  const g = new THREE.Group(), ring = glow(0x59d6ff, 1.3);
  g.add(mesh(new THREE.CylinderGeometry(2.7, 3, 0.5, 6), gloss(0x232e6b), 0, 0.25, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.1, 1.5, 4.4, 24), gloss(0x3f7cff), 0, 2.7, 0));
  for (const y of [1.6, 3.1, 4.4]) g.add(ringAt(1.25 - y * 0.02, 0.07, ring, y));
  g.add(mesh(HALF(1.1, 32), gloss(0x3f7cff), 0, 4.9, 0));
  const orb = glow(0x9ff3ff, 1.8);
  g.add(mesh(new THREE.SphereGeometry(0.55, 24, 18), orb, 0, 6.3, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), gloss(0xdfe8ff), 0, 5.55, 0));
  g.userData = { orb, ring };
  return g;
}

// Small text symbols ("!", "z") that float above characters.
export function symbolSprite(text, color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = '#0b1230'; x.strokeText(text, 32, 34); x.fillStyle = color; x.fillText(text, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  s.scale.set(0.34, 0.34, 1); s.renderOrder = 10;
  return s;
}

export const buildingFor = (agent, status) =>
  agent.kind === 'workflow' ? buildTower(status) : agent.kind === 'human' ? buildHouse(status) : agent.kind === 'local' ? buildDish(status) : buildPod(status, 0.9);
export { THREE };
