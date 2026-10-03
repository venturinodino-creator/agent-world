// The characters and the floating symbols: an astronaut for every agent, the "!" and zzz, the working icon. The buildings
// live in buildings.mjs and the shared helpers in kit.mjs.
import { THREE, PALETTE, toy, skinned, mesh, paint, flatten } from './kit.mjs';
import { fabricSkin, visorSkin } from './textures.mjs';
export { PALETTE, STATUS, HEALTH, bakeStatics } from './kit.mjs';
export { buildPod, buildHub, buildingFor } from './buildings.mjs';

// An astronaut for every agent: a chunky suit in a saturated colour that tells the kind of agent apart and stands out
// from the white and grey buildings (orange for workflows, pink for Claude, red for the bot, violet for Cowork, blue for
// you), with white stripes and a mission patch, a big helmet in the suit colour with a dark glass visor, ear pods, a chest control
// box with a hose to the backpack, dark puffy gloves and boots. No face: the visor is just glass.
// The patch is a plain coloured disc, not any real agency's badge.
const SUITS = { workflow: 0xff7a1a, builder: 0xff3d8a, bot: 0xe5353b, human: 0x2f86ff, local: 0x9a62ff };
export function buildRobot(kind, name) {
  const key = kind === 'builder' ? (name === 'Auto-commit bot' ? 'bot' : 'builder') : SUITS[kind] ? kind : 'workflow';
  const SUIT = SUITS[key], trim = 0xffffff;
  const WHITE = 0xf3f5f9, GREY = 0xdfe4ec, STEEL = 0x8b94a3, DARK = 0x2d3240;
  // One vertex-coloured fabric material (its own, because the alarm flashes it red) covers the whole suit, so every
  // part of it merges into a single mesh.
  const g = new THREE.Group(), suit = skinned(fabricSkin(), { color: 0xffffff, vertexColors: true, roughness: 0.8, bumpScale: 0.6 }, true);
  const at = (geo, hex, x, y, z, rot) => { const m = mesh(paint(geo, hex), suit, x, y, z); if (rot) m.rotation.set(...rot); g.add(m); return m; };
  for (const x of [-0.047, 0.047]) {
    at(new THREE.CylinderGeometry(0.047, 0.042, 0.2, 8), SUIT, x, 0.11, 0);               // leg
    at(new THREE.CylinderGeometry(0.0485, 0.0485, 0.022, 8), trim, x, 0.13, 0);            // knee stripe
    at(new THREE.BoxGeometry(0.088, 0.07, 0.14), DARK, x, 0.035, 0.02);                    // boot
    at(new THREE.BoxGeometry(0.094, 0.02, 0.146), DARK, x, 0.01, 0.02);                    // sole
  }
  at(new THREE.CapsuleGeometry(0.095, 0.12, 3, 10), SUIT, 0, 0.31, 0);                     // torso
  at(new THREE.CylinderGeometry(0.0975, 0.0975, 0.024, 12), trim, 0, 0.2, 0);              // waist stripe
  at(new THREE.CylinderGeometry(0.075, 0.088, 0.03, 12), STEEL, 0, 0.465, 0);              // neck ring
  at(new THREE.BoxGeometry(0.125, 0.095, 0.05), GREY, 0, 0.34, 0.1);                       // chest control box
  at(new THREE.CylinderGeometry(0.027, 0.027, 0.01, 12), trim, -0.03, 0.352, 0.127, [Math.PI / 2, 0, 0]);   // mission patch
  at(new THREE.BoxGeometry(0.032, 0.012, 0.012), STEEL, 0.03, 0.318, 0.127);               // vent slot
  at(new THREE.BoxGeometry(0.014, 0.014, 0.012), trim, 0.04, 0.352, 0.127);                // indicator button
  at(new THREE.BoxGeometry(0.15, 0.2, 0.08), WHITE, 0, 0.33, -0.12);                       // life-support backpack
  at(new THREE.TorusGeometry(0.05, 0.009, 5, 10, Math.PI), STEEL, 0.1, 0.31, 0, [0, Math.PI / 2, 0]);        // hose from chest to backpack
  for (const side of [-1, 1]) at(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10).rotateZ(Math.PI / 2), GREY, side * 0.165, 0.6, 0);   // ear pods
  // the helmet and its glass visor (a cap of a slightly larger sphere, facing front)
  g.add(mesh(new THREE.SphereGeometry(0.158, 18, 14), toy(SUIT, { roughness: 0.28, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.12 }), 0, 0.6, 0));
  const glass = visorSkin();
  g.add(mesh(new THREE.SphereGeometry(0.162, 14, 8, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.78, 1.3),
    skinned(glass, { color: 0xffffff, emissiveMap: glass.map, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.08, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.04 }), 0, 0.6, 0));
  flatten(g);
  // each arm hangs from a shoulder pivot, so swinging it looks like an arm and not a spinning stick
  const arms = [-1, 1].map(side => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.135, 0.43, 0);
    shoulder.add(mesh(paint(new THREE.CapsuleGeometry(0.037, 0.1, 2, 6), SUIT), suit, 0, -0.07, 0));               // sleeve
    shoulder.add(mesh(paint(new THREE.CylinderGeometry(0.0385, 0.0385, 0.022, 8), trim), suit, 0, -0.045, 0));      // arm stripe
    shoulder.add(mesh(paint(new THREE.BoxGeometry(0.012, 0.034, 0.05), trim), suit, side * 0.038, -0.015, 0));       // shoulder patch
    shoulder.add(mesh(paint(new THREE.SphereGeometry(0.044, 6, 5), DARK), suit, 0, -0.165, 0));                      // puffy glove
    flatten(shoulder);   // the whole arm becomes one mesh
    g.add(shoulder); return shoulder;
  });
  g.userData = { arms, body: suit };
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

export { THREE };
