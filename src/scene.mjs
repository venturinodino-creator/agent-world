// The 3D scene: renderer, camera, lights, sunny desert and sky, floating rocks, hexagon islands with their
// buildings and robots, the hub, picking and the camera glide. What exists comes from the world model and
// how it moves comes from anim.mjs; this file decides how it looks. Browser only (needs WebGL).
import { THREE, STATUS, HEALTH, PALETTE, buildPod, buildRobot, buildingFor, buildHub, symbolSprite, workingIcon } from './models.mjs';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tileOffsets } from './world.mjs';
import { pose, hash } from './anim.mjs';

const WALK_UNITS = 0.5 / 14;          // pose offsets are in old pixel units; this turns them into tiles
const HUB_TOP = new THREE.Vector3(0, 6.0, 0);
const RESULT_HEX = { ok: 0x41e08a, fail: 0xff5d6c, running: 0x3fd7e8 };
const FOG = 0xf0dbc0;

// Island floor colours by health: dark slate normally, royal blue while something is working (as in the reference).
const FLOOR = {
  ok: ['#3c3d4a', '#575865'], running: ['#2257e6', '#1a43b8'], fail: ['#46373d', '#6a4752'],
  idle: ['#2d4a52', '#47707b'], dormant: ['#43464f', '#5b5f6b'],
};
const SIDE = { ok: 0xe0603f, running: 0xe0603f, fail: 0xe0603f, idle: 0xe0603f, dormant: 0x6b6f7a };

const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// ----- sky and ground
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#4f8fe0') }, mid: { value: new THREE.Color('#a9c9ee') }, horizon: { value: new THREE.Color('#f6dfc4') }, below: { value: new THREE.Color('#ead0aa') } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 below;
      void main(){ float h = vDir.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.2, 0.75, h));
        c = mix(c, below, smoothstep(0.0, -0.15, h)); gl_FragColor = vec4(c, 1.0); }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
}

// Low sandy dunes that stay flat under the islands and roll away towards the horizon.
function desert(R) {
  const size = 2400, seg = 160, geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), a = new THREE.Color('#dcaa6e'), b = new THREE.Color('#c88a50'), c = new THREE.Color();
  const flatUntil = R + 14;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z), k = Math.min(1, Math.max(0, (d - flatUntil) / 60));
    const dune = Math.sin(x * 0.02) * 3.2 + Math.sin(z * 0.03 + 1.3) * 2.6 + Math.sin((x + z) * 0.009) * 9;
    pos.setY(i, -0.4 + k * k * (3 - 2 * k) * dune);
    c.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(x * 0.035 + z * 0.02 + Math.sin(z * 0.05) * 2));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}

// A square-tile floor with thin light seams and a little speckle, drawn once per colour.
const floorCache = new Map();
function floorTexture(health) {
  const [base, line] = FLOOR[health] || FLOOR.ok;
  if (!floorCache.has(health)) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), rnd = lcg(health.length * 31 + 5);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.04})`; x.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 6, 2 + rnd() * 3); }
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; x.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 5, 2 + rnd() * 3); }
    x.strokeStyle = line; x.lineWidth = 4; x.strokeRect(2, 2, 252, 252);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    floorCache.set(health, t);
  }
  return floorCache.get(health);
}

// The bright hexagon border of an island (vertices on the x axis, like the plate).
function rimGeometry(outer, width) {
  const ring = r => Array.from({ length: 6 }, (_, k) => new THREE.Vector2(r * Math.cos((k * Math.PI) / 3), r * Math.sin((k * Math.PI) / 3)));
  const shape = new THREE.Shape(ring(outer)); shape.holes.push(new THREE.Path(ring(outer - width)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
  return geo;
}

// Returns null when the browser cannot start WebGL.
export function createScene(container) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG); scene.fog = new THREE.FogExp2(FOG, 0.0028);
  scene.add(skyDome());
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 3200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = 1.38; controls.minDistance = 5;

  scene.add(new THREE.HemisphereLight(0xdfeaff, 0xd9a56b, 0.95));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.9);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const S = { world: null, root: new THREE.Group(), agents: new Map(), pickables: [], rocks: [], hub: null, focus: null, papers: new Map(),
    ring: null, bots: null, size: { w: 1, h: 1 } };
  scene.add(S.root);
  S.ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  S.ring.rotation.x = Math.PI / 2; S.ring.visible = false; scene.add(S.ring);
  const iconProto = workingIcon();

  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    S.size = { w, h }; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();

  // ----- camera
  const overview = R => {
    const vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dist = (R * 1.05) / Math.tan(Math.min(vf, hf) / 2);
    return { target: new THREE.Vector3(0, 0, 0), position: new THREE.Vector3(0, 0.62, 0.78).normalize().multiplyScalar(dist) };
  };
  const glide = (target, position, seconds = 0.9) => {
    S.focus = { t0: performance.now(), dur: seconds * 1000, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: target, toP: position };
  };
  function fit(instant = false) {
    if (!S.world) return;
    const o = overview(S.world.bounds.radius + 3);
    controls.maxDistance = o.position.length() * 2.2;
    if (instant) { controls.target.copy(o.target); camera.position.copy(o.position); } else glide(o.target, o.position, 0.8);
  }
  function zoom(factor) {
    const off = camera.position.clone().sub(controls.target), len = THREE.MathUtils.clamp(off.length() * factor, controls.minDistance, controls.maxDistance || 400);
    glide(controls.target.clone(), controls.target.clone().add(off.setLength(len)), 0.35);
  }

  // ----- building the world
  function clear() {
    S.root.traverse(o => { o.geometry?.dispose?.(); [].concat(o.material || []).forEach(m => { m.map?.dispose?.(); m.dispose(); }); });
    S.root.clear(); S.agents.clear(); S.pickables = []; S.rocks = []; S.bots = null; S.papers.forEach(p => p.removeFromParent()); S.papers.clear();
  }

  // Props scattered on the empty tiles: solar-panel fields, crate stacks and tanks, so islands look lived in.
  function scatterProps(world) {
    const panel = new RoundedBoxGeometry(0.5, 0.05, 0.34, 2, 0.02), crate = new RoundedBoxGeometry(0.24, 0.24, 0.24, 2, 0.04), tank = new THREE.CylinderGeometry(0.15, 0.15, 0.34, 12);
    const panels = [], crates = [], tanks = [];
    world.islands.forEach((isl, n) => {
      if (isl.dormant) return;
      const rnd = lcg(11 + n * 97);
      tileOffsets(isl.rings).forEach((t, i) => {
        const x = isl.x + t.x, z = isl.z + t.z;
        if (i === 0) return;
        if (i <= isl.agentCount) { if (rnd() < 0.5) crates.push([x - 0.45, z - 0.32, rnd() < 0.5 ? PALETTE.red : PALETTE.white]); return; }
        const r = rnd();
        if (r < 0.4) for (const [dx, dz] of [[-0.27, -0.2], [0.27, -0.2], [-0.27, 0.2], [0.27, 0.2]]) panels.push([x + dx, z + dz]);
        else if (r < 0.65) { const k = 1 + Math.floor(rnd() * 3); for (let j = 0; j < k; j++) crates.push([x + (rnd() - 0.5) * 0.9, z + (rnd() - 0.5) * 0.9, [PALETTE.red, PALETTE.white, PALETTE.teal, PALETTE.blue][Math.floor(rnd() * 4)]]); }
        else if (r < 0.8) tanks.push([x + (rnd() - 0.5) * 0.6, z + (rnd() - 0.5) * 0.6]);
      });
    });
    const add = (geo, list, y, color, place) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.45 }), list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
      list.forEach((p, i) => { place(p, e, i); q.setFromEuler(e); m.compose(new THREE.Vector3(p[0], y(p), p[1]), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m); im.setColorAt(i, c.setHex(color(p))); });
      im.castShadow = true; im.receiveShadow = true; S.root.add(im);
    };
    add(panel, panels, () => 0.3, () => PALETTE.blue, (p, e) => e.set(-0.45, 0.3, 0));
    add(crate, crates, () => 0.27, p => p[2], (p, e, i) => e.set(0, i * 0.7, 0));
    add(tank, tanks, () => 0.32, () => PALETTE.white, (p, e) => e.set(0, 0, 0));
  }

  // Tiny robots wandering around every island: instanced bodies and heads.
  function ambientBots(world) {
    const list = [], rnd = lcg(5);
    world.islands.forEach(isl => {
      if (isl.dormant) return;
      const n = Math.min(40, 4 + Math.round(isl.agentCount * 1.6));
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * (isl.radius - 1.4);
        list.push({ x: isl.x + Math.cos(a) * d, z: isl.z + Math.sin(a) * d, rad: 0.25 + rnd() * 0.5, sp: 0.2 + rnd() * 0.5, ph: rnd() * 6.3, hue: rnd() });
      }
    });
    if (!list.length) return;
    const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.045, 0.1, 4, 8), new THREE.MeshStandardMaterial({ roughness: 0.5 }), list.length);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf3f6ff, roughness: 0.5 }), list.length);
    const c = new THREE.Color();
    list.forEach((b, i) => body.setColorAt(i, c.setHex(b.hue < 0.12 ? 0xff5a5a : b.hue < 0.2 ? 0xff9ec0 : b.hue < 0.55 ? 0xdbeaff : 0x9fcdf5)));
    body.castShadow = head.castShadow = true;
    S.root.add(body, head); S.bots = { list, body, head, m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1) };
  }

  function setWorld(world, { refit = false } = {}) {
    clear(); S.world = world;
    const R = world.bounds.radius, root = S.root;
    root.add(desert(R));
    S.hub = buildHub(); root.add(S.hub);

    // each island: a coral-sided slate platform with a square-tile floor and a bright health-coloured rim
    const padGeo = new THREE.CylinderGeometry(0.58, 0.62, 0.05, 8), pads = [];
    world.islands.forEach(isl => {
      const h = isl.health, tex = floorTexture(h).clone(); tex.needsUpdate = true;
      tex.repeat.set((isl.radius * 2) / 2.6, (isl.radius * 2) / 2.6); tex.center.set(0.5, 0.5); tex.rotation = Math.PI / 4;
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(isl.radius - 0.02, isl.radius - 0.02, 0.5, 6), [
        new THREE.MeshStandardMaterial({ color: SIDE[h] ?? SIDE.ok, roughness: 0.55 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }), new THREE.MeshStandardMaterial({ color: 0x20212a })]);
      plate.rotation.y = Math.PI / 2; plate.position.set(isl.x, -0.13, isl.z); plate.castShadow = true; plate.receiveShadow = true; root.add(plate);
      const rim = new THREE.Mesh(rimGeometry(isl.radius, 0.34), new THREE.MeshStandardMaterial({ color: HEALTH[h] ?? HEALTH.ok, emissive: HEALTH[h] ?? HEALTH.ok, emissiveIntensity: isl.dormant ? 0.1 : 0.5, roughness: 0.4 }));
      rim.position.set(isl.x, 0.12, isl.z); rim.castShadow = true; root.add(rim);
      const hq = buildPod(isl.dormant ? 'asleep' : h === 'fail' ? 'fail' : 'ok', isl.dormant ? 1.4 : 1.75);
      hq.position.set(isl.x, 0.12, isl.z); hq.userData.island = isl.name; root.add(hq); S.pickables.push(hq);
      tileOffsets(isl.rings).forEach((t, i) => { if (i <= isl.agentCount) pads.push([isl.x + t.x, isl.z + t.z, i === 0 ? 1.7 : 1, FLOOR[h]?.[0] ?? FLOOR.ok[0]]); });
    });
    if (pads.length) {
      const im = new THREE.InstancedMesh(padGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), pads.length), m = new THREE.Matrix4(), c = new THREE.Color();
      pads.forEach(([x, z, s, col], i) => { m.compose(new THREE.Vector3(x, 0.14, z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s)); im.setMatrixAt(i, m); im.setColorAt(i, c.set(col).offsetHSL(0, 0, 0.07)); });
      im.receiveShadow = true; root.add(im);
    }
    scatterProps(world); ambientBots(world);

    for (const a of world.agents) {
      const isl = world.islands.find(i => i.name === a.island), ph = hash(a.id);
      const building = buildingFor(a, a.status, ph); building.position.set(a.pos.x, 0.14, a.pos.z);
      building.rotation.y = Math.floor(ph * 8) * (Math.PI / 4);
      building.scale.setScalar(1.2);   // chunky, like the reference
      building.userData.agentId = a.id;
      const robot = buildRobot(a.kind, a.name); robot.position.set(a.pos.x, 0.14, a.pos.z + 0.62);
      robot.userData.agentId = a.id;
      const alarm = a.status === 'fail' ? symbolSprite('!', '#ff5a4a') : null, zs = a.status === 'asleep' ? [0, 1, 2].map(() => symbolSprite('z', '#d6defa')) : [];
      const icon = a.status === 'running' ? iconProto.clone() : null;
      [alarm, icon, ...zs].filter(Boolean).forEach(s => root.add(s));
      root.add(building, robot); S.pickables.push(building, robot);
      S.agents.set(a.id, { agent: a, building, robot, bx: a.pos.x, bz: a.pos.z + 0.62, ph, alarm, icon, zs, island: isl });
    }

    // drifting dark rocks above the world
    const rnd = lcg(7);
    for (let i = 0; i < 16; i++) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + rnd() * 1.2, 0), new THREE.MeshStandardMaterial({ color: 0x5b4234, roughness: 0.95, flatShading: true }));
      const a = rnd() * Math.PI * 2, d = R * (1.1 + rnd() * 0.9), y = 1 + rnd() * 10;
      rock.position.set(Math.cos(a) * d, y, Math.sin(a) * d); rock.castShadow = true; rock.userData = { y, ph: rnd() * 6, spin: 0.1 + rnd() * 0.3 };
      root.add(rock); S.rocks.push(rock);
    }

    sun.position.set(R * 0.9, R * 0.85, R * 0.45);
    const sc = sun.shadow.camera; sc.left = -R - 8; sc.right = R + 8; sc.top = R + 8; sc.bottom = -R - 8; sc.near = 1; sc.far = R * 5; sc.updateProjectionMatrix();
    if (refit) fit(true);
  }

  // ----- picking and projection
  function pick(clientX, clientY) {
    const box = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(S.pickables, true)[0];
    for (let o = hit?.object; o; o = o.parent) {
      if (o.userData?.agentId) return { agentId: o.userData.agentId };
      if (o.userData?.island) return { island: o.userData.island };
    }
    return null;
  }
  const v = new THREE.Vector3();
  function project(x, y, z) {
    v.set(x, y, z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * S.size.w, y: (-v.y * 0.5 + 0.5) * S.size.h, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }
  const agentHead = id => { const r = S.agents.get(id); return r ? project(r.robot.position.x, 0.95, r.robot.position.z) : null; };
  const islandLabel = isl => project(isl.x, 3.6, isl.z);

  function focusAgent(id) {
    const r = S.agents.get(id); if (!r) return;
    const target = new THREE.Vector3(r.bx, 0.6, r.bz - 0.3), dir = camera.position.clone().sub(controls.target).normalize();
    glide(target, target.clone().add(dir.multiplyScalar(12)));
  }
  function focusIsland(name) {
    const isl = S.world?.islands.find(i => i.name === name); if (!isl) return;
    const target = new THREE.Vector3(isl.x, 0.5, isl.z), dir = camera.position.clone().sub(controls.target).normalize();
    glide(target, target.clone().add(dir.multiplyScalar(isl.radius * 2.6 + 4)));
  }

  // ----- per-frame animation
  const paperGeo = new THREE.BoxGeometry(0.22, 0.28, 0.02), tmp = new THREE.Vector3(), eul = new THREE.Euler();
  function update(t, ui = {}) {
    if (S.focus) {
      const k = Math.min(1, (performance.now() - S.focus.t0) / S.focus.dur), e = k * k * (3 - 2 * k);
      controls.target.lerpVectors(S.focus.fromT, S.focus.toT, e); camera.position.lerpVectors(S.focus.fromP, S.focus.toP, e);
      if (k >= 1) S.focus = null;
    }
    controls.update();

    for (const r of S.agents.values()) {
      const a = r.agent, p = pose(a, t), mats = r.building.userData.mats, boost = a.id === ui.selectedId ? 1.2 : a.id === ui.hoverId ? 0.8 : 0;
      const dx = p.dx * WALK_UNITS;
      r.robot.position.x = r.bx + dx;
      r.robot.position.y = 0.14 + (p.typing ? Math.abs(Math.sin(t * 10 + r.ph * 6)) * 0.07 : p.asleep ? -0.02 : Math.sin(t * 2 + r.ph * 6) * 0.012);
      r.robot.rotation.y = p.walking ? (p.facing > 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
      r.robot.rotation.z = p.asleep ? 1.25 : 0;
      r.robot.userData.arms.forEach((arm, i) => { arm.rotation.x = p.typing ? Math.sin(t * 14 + i * Math.PI) * 0.9 : p.walking ? Math.sin(t * 9 + i * Math.PI) * 0.5 : 0; });
      r.robot.userData.body.emissive.setHex(p.alarm ? 0xff2244 : 0x000000);
      r.robot.userData.body.emissiveIntensity = p.alarm ? 0.7 : 0;
      const pulse = a.status === 'running' ? 0.6 + 0.5 * Math.sin(t * 6 + r.ph * 6) : a.status === 'fail' ? (p.alarm ? 1.4 : 0.3) : 0;
      mats.ring.emissiveIntensity = 1.0 + pulse + boost;
      if (a.status === 'fail') mats.body.emissive.setHex(p.alarm ? 0x66101c : 0x000000);
      if (r.alarm) r.alarm.position.set(r.robot.position.x, 0.98 + Math.sin(t * 6) * 0.04, r.bz);
      if (r.icon) r.icon.position.set(r.robot.position.x, 1.0 + Math.sin(t * 3 + r.ph * 6) * 0.05, r.bz);
      r.zs.forEach((z, i) => { const k = ((t * 0.5 + i / 3 + r.ph) % 1); z.position.set(r.bx + 0.15 + k * 0.25, 0.7 + k * 0.5, r.bz); z.material.opacity = 1 - k; z.scale.setScalar(0.18 + k * 0.2); });
    }

    if (S.bots) {
      const { list, body, head, m, q, p, one } = S.bots;
      list.forEach((b, i) => {
        const a = t * b.sp + b.ph, x = b.x + Math.cos(a) * b.rad, z = b.z + Math.sin(a * 1.3) * b.rad, bob = Math.abs(Math.sin(t * 6 + b.ph)) * 0.015;
        q.setFromEuler(eul.set(0, -a, 0));
        m.compose(p.set(x, 0.3 + bob, z), q, one); body.setMatrixAt(i, m);
        m.compose(p.set(x, 0.43 + bob, z), q, one); head.setMatrixAt(i, m);
      });
      body.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true;
    }

    S.rocks.forEach(rk => { rk.position.y = rk.userData.y + Math.sin(t * 0.4 + rk.userData.ph) * 0.4; rk.rotation.y += 0.002 * rk.userData.spin; rk.rotation.x += 0.001 * rk.userData.spin; });

    if (S.hub) { S.hub.userData.orb.emissiveIntensity = 1.6 + (ui.hubGlow || 0) * 2.4 + Math.sin(t * 2) * 0.2; S.hub.userData.ring.emissiveIntensity = 1.2 + (ui.hubGlow || 0) * 1.2; }

    const sel = ui.selectedId && S.agents.get(ui.selectedId);
    S.ring.visible = !!sel;
    if (sel) { S.ring.position.set(sel.bx, 0.2, sel.bz - 0.3); S.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.06); }

    const live = new Set(ui.papers || []);
    for (const [pg, mm] of S.papers) if (!live.has(pg)) { mm.removeFromParent(); mm.material.dispose(); S.papers.delete(pg); }
    for (const pg of live) {
      const r = S.agents.get(pg.agentId), k = (t - pg.start) / pg.dur;
      if (!r || k < 0 || k > 1) { S.papers.get(pg)?.removeFromParent(); continue; }
      let mm = S.papers.get(pg);
      if (!mm) { mm = new THREE.Mesh(paperGeo, new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: RESULT_HEX[pg.result] || 0x3fd7e8, emissiveIntensity: 0.6 })); S.papers.set(pg, mm); }
      if (!mm.parent) scene.add(mm);
      const e = k * k * (3 - 2 * k);
      tmp.set(r.bx, 1.1, r.bz).lerp(HUB_TOP, e); tmp.y += Math.sin(k * Math.PI) * 2.2;
      mm.position.copy(tmp); mm.rotation.set(0, t * 6, Math.sin(t * 8) * 0.4); mm.scale.setScalar(1 - k * 0.35);
    }
    renderer.render(scene, camera);
  }

  return { setWorld, update, pick, project, agentHead, islandLabel, focusAgent, focusIsland, fit, zoom, hasAgent: id => S.agents.has(id),
    element: renderer.domElement };
}
