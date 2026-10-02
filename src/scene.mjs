// The 3D scene: renderer, camera, lights, sunny desert and sky, floating rocks, hexagon islands with their
// buildings and robots, the hub, picking and the camera glide. What exists comes from the world model and
// how it moves comes from anim.mjs; this file decides how it looks. Browser only (needs WebGL).
import { THREE, STATUS, HEALTH, PALETTE, buildPod, buildRobot, buildingFor, buildHub, symbolSprite, workingIcon } from './models.mjs';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tileOffsets } from './world.mjs';
import { pose, hash, errand, routeBot } from './anim.mjs';

const WALK_UNITS = 0.5 / 14;          // pose offsets are in old pixel units; this turns them into tiles
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
    ring: null, bots: null, hqs: new Map(), hubTop: new THREE.Vector3(0, 6, 0), size: { w: 1, h: 1 } };
  scene.add(S.root);
  S.ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  S.ring.rotation.x = Math.PI / 2; S.ring.visible = false; scene.add(S.ring);
  const iconProto = workingIcon();

  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    S.size = { w, h }; renderer.setSize(w, h); camera.aspect = w / h; applyInset();
  }
  // Shifts the picture left so the world is centred in the part of the view that the side panel does not cover.
  function applyInset() {
    camera.setViewOffset(S.size.w, S.size.h, (S.inset || 0) / 2, 0, S.size.w, S.size.h); camera.updateProjectionMatrix();
  }
  const setInset = px => { S.inset = px; applyInset(); };
  new ResizeObserver(resize).observe(container); resize();

  // ----- camera
  const overview = (R, centre = new THREE.Vector3()) => {
    // frame the world inside the part of the view the side panel does not cover
    const vf = camera.fov * Math.PI / 180, visible = Math.max(0.4, (S.size.w - (S.inset || 0)) / S.size.h), hf = 2 * Math.atan(Math.tan(vf / 2) * visible);
    const dist = (R * 1.05) / Math.tan(Math.min(vf, hf) / 2);
    return { target: centre.clone(), position: centre.clone().add(new THREE.Vector3(0, 0.62, 0.78).normalize().multiplyScalar(dist)) };
  };
  const glide = (target, position, seconds = 0.9) => {
    S.focus = { t0: performance.now(), dur: seconds * 1000, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: target, toP: position };
  };
  function fit(instant = false) {
    if (!S.world) return;
    // centre on the real extent of the islands (the honeycomb is lopsided when the last ring is not full)
    const cells = [{ x: 0, z: 0, radius: S.world.hub.radius }, ...S.world.islands];
    const minX = Math.min(...cells.map(c => c.x - c.radius)), maxX = Math.max(...cells.map(c => c.x + c.radius));
    const minZ = Math.min(...cells.map(c => c.z - c.radius)), maxZ = Math.max(...cells.map(c => c.z + c.radius));
    const centre = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const reach = Math.max(...cells.map(c => Math.hypot(c.x - centre.x, c.z - centre.z) + c.radius));
    const o = overview(reach * 0.78 + 2, centre);   // the tilt foreshortens depth, so it can be framed closer
    controls.maxDistance = o.position.distanceTo(o.target) * 2.2 + 20;
    if (instant) { controls.target.copy(o.target); camera.position.copy(o.position); } else glide(o.target, o.position, 0.8);
  }
  function zoom(factor) {
    const off = camera.position.clone().sub(controls.target), len = THREE.MathUtils.clamp(off.length() * factor, controls.minDistance, controls.maxDistance || 400);
    glide(controls.target.clone(), controls.target.clone().add(off.setLength(len)), 0.35);
  }

  // ----- building the world
  function clear() {
    S.root.traverse(o => { o.geometry?.dispose?.(); [].concat(o.material || []).forEach(m => { m.map?.dispose?.(); m.dispose(); }); });
    S.root.clear(); S.agents.clear(); S.hqs.clear(); S.pickables = []; S.rocks = []; S.bots = null; S.papers.forEach(p => p.removeFromParent()); S.papers.clear();
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

  // Little workers shuttling between the buildings and each island's headquarters all day: out with a crate,
  // back empty-handed. Each has a body, head, hard hat, two walking legs and two swinging arms (instanced).
  // Buildings that are working right now get extra helpers that run faster, so busy places look busy.
  function ambientBots(world) {
    const list = [], rnd = lcg(5), crateColors = [PALETTE.red, PALETTE.white, PALETTE.teal, PALETTE.yellow];
    const VEST = [0xff9a3c, 0xdbeaff, 0xff5a5a, 0x9fcdf5, 0xffd23c, 0x41e0a0], HAT = [0xffd23c, 0xff9a3c, 0xff5a5a, 0x3b72f2, 0xf3f6ff];
    const route = (isl, ax, az, sp, ph) => {
      const dx = ax - isl.x, dz = az - isl.z, len = Math.hypot(dx, dz) || 1;
      list.push({ isl: isl.name, ax, az, bx: isl.x + (dx / len) * 1.5, bz: isl.z + (dz / len) * 1.5, side: rnd() < 0.5 ? 1 : -1, sp, ph,
        vest: VEST[Math.floor(rnd() * VEST.length)], hat: HAT[Math.floor(rnd() * HAT.length)], crate: crateColors[Math.floor(rnd() * 4)] });
    };
    world.islands.forEach(isl => {
      if (isl.dormant) return;
      const tiles = tileOffsets(isl.rings).slice(1), n = Math.min(90, 12 + Math.round(isl.agentCount * 2.5));
      for (let i = 0; i < n; i++) {
        const t = tiles[Math.floor(rnd() * tiles.length)];
        route(isl, isl.x + t.x + (rnd() - 0.5) * 0.5, isl.z + t.z + (rnd() - 0.5) * 0.5, 0.07 + rnd() * 0.07, rnd() * 2);
      }
    });
    for (const a of world.agents) {
      if (a.status !== 'running') continue;
      const isl = world.islands.find(i => i.name === a.island);
      for (let k = 0; k < 3; k++) route(isl, a.pos.x + (rnd() - 0.5) * 0.4, a.pos.z + 0.7, 0.2 + rnd() * 0.08, rnd() * 2);
    }
    if (!list.length) return;
    const N = list.length, mat = () => new THREE.MeshStandardMaterial({ roughness: 0.5 }), white = () => new THREE.MeshStandardMaterial({ color: 0xf3f6ff, roughness: 0.5 });
    const parts = {
      body: new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.085, 0.17, 3, 8), mat(), N),
      head: new THREE.InstancedMesh(new THREE.SphereGeometry(0.105, 10, 8), white(), N),
      hat: new THREE.InstancedMesh(new THREE.SphereGeometry(0.115, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(), N),
      legs: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 6), white(), N * 2),
      arms: new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.03, 0.12, 3, 6), mat(), N * 2),
      crate: new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), mat(), N),
    };
    const c = new THREE.Color();
    list.forEach((b, i) => {
      parts.body.setColorAt(i, c.setHex(b.vest)); parts.hat.setColorAt(i, c.setHex(b.hat)); parts.crate.setColorAt(i, c.setHex(b.crate));
      parts.arms.setColorAt(i * 2, c.setHex(b.vest)); parts.arms.setColorAt(i * 2 + 1, c.setHex(b.vest));
    });
    // only the body and crate cast shadows; the many thin parts would just cost frames
    Object.entries(parts).forEach(([name, im]) => { im.castShadow = name === 'body' || name === 'crate'; S.root.add(im); });
    S.bots = { list, parts, base: new THREE.Matrix4(), local: new THREE.Matrix4(), out: new THREE.Matrix4(), q: new THREE.Quaternion(), qs: new THREE.Quaternion(),
      p: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), hide: new THREE.Vector3(0.001, 0.001, 0.001), ax: new THREE.Vector3(1, 0, 0) };
  }

  function setWorld(world, { refit = false } = {}) {
    clear(); S.world = world;
    const R = world.bounds.radius, root = S.root;
    root.add(desert(R));
    // each island: a coral-sided slate platform with a square-tile floor and a bright health-coloured rim
    const addPlate = (isl, floor, rimHex, rimK) => {
      const tex = floorTexture(floor).clone(); tex.needsUpdate = true;
      tex.repeat.set((isl.radius * 2) / 2.6, (isl.radius * 2) / 2.6); tex.center.set(0.5, 0.5); tex.rotation = Math.PI / 4;
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(isl.radius - 0.02, isl.radius - 0.02, 0.5, 6), [
        new THREE.MeshStandardMaterial({ color: SIDE[floor] ?? SIDE.ok, roughness: 0.55 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }), new THREE.MeshStandardMaterial({ color: 0x20212a })]);
      plate.rotation.y = Math.PI / 2; plate.position.set(isl.x, -0.13, isl.z); plate.castShadow = true; plate.receiveShadow = true; root.add(plate);
      const rim = new THREE.Mesh(rimGeometry(isl.radius, 0.34), new THREE.MeshStandardMaterial({ color: rimHex, emissive: rimHex, emissiveIntensity: rimK, roughness: 0.4 }));
      rim.position.set(isl.x, 0.12, isl.z); rim.castShadow = true; root.add(rim);
    };

    // the hub tower stands on its own cell in the middle of the honeycomb
    const hubScale = THREE.MathUtils.clamp(world.hub.radius / 4.6, 1, 1.9);
    addPlate({ x: 0, z: 0, radius: world.hub.radius }, 'dormant', 0x59d6ff, 0.7);
    S.hub = buildHub(); S.hub.scale.setScalar(hubScale); S.hub.position.y = 0.12; root.add(S.hub); S.hubTop.set(0, 6.1 * hubScale + 0.12, 0);

    const padGeo = new THREE.CylinderGeometry(0.58, 0.62, 0.05, 8), pads = [];
    world.islands.forEach(isl => {
      const h = isl.health;
      addPlate(isl, h, HEALTH[h] ?? HEALTH.ok, isl.dormant ? 0.1 : 0.5);
      const hq = buildPod(isl.dormant ? 'asleep' : h === 'fail' ? 'fail' : 'ok', isl.dormant ? 1.4 : 1.75);
      hq.position.set(isl.x, 0.12, isl.z); hq.userData.island = isl.name; root.add(hq); S.pickables.push(hq);
      S.hqs.set(isl.name, { mats: hq.userData.mats, last: -9 });
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
      const robot = buildRobot(a.kind, a.name); robot.position.set(a.pos.x, 0.14, a.pos.z + 0.7);
      robot.scale.setScalar(1.5); robot.userData.agentId = a.id;
      const carry = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.2, 2, 0.04), new THREE.MeshStandardMaterial({ color: PALETTE.red, roughness: 0.45 }));
      carry.position.set(0, 0.8, 0); carry.visible = false; robot.add(carry);
      const sparks = a.status === 'running' ? Array.from({ length: 6 }, () => { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff1a8 })); root.add(sp); return sp; }) : [];
      const halo = a.status === 'running' ? new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true })) : null;
      if (halo) { halo.rotation.x = Math.PI / 2; root.add(halo); }
      const dx = a.pos.x - isl.x, dz = a.pos.z - isl.z, len = Math.hypot(dx, dz) || 1;
      const alarm = a.status === 'fail' ? symbolSprite('!', '#ff5a4a') : null, zs = a.status === 'asleep' ? [0, 1, 2].map(() => symbolSprite('z', '#d6defa')) : [];
      const icon = a.status === 'running' ? iconProto.clone() : null;
      [alarm, icon, ...zs].filter(Boolean).forEach(s => root.add(s));
      root.add(building, robot); S.pickables.push(building, robot);
      S.agents.set(a.id, { agent: a, building, robot, carry, sparks, halo, bx: a.pos.x, bz: a.pos.z + 0.7, ph, alarm, icon, zs, island: isl,
        hq: { x: isl.x + (dx / len) * 1.5, z: isl.z + (dz / len) * 1.5 } });
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
  const agentHead = id => { const r = S.agents.get(id); return r ? project(r.robot.position.x, 1.45, r.robot.position.z) : null; };
  // The agents closest to what the camera is looking at, for name tags when zoomed in.
  const nearAgents = (radius, limit) => [...S.agents.values()]
    .map(r => ({ id: r.agent.id, d: Math.hypot(r.robot.position.x - controls.target.x, r.robot.position.z - controls.target.z) }))
    .filter(r => r.d < radius).sort((a, b) => a.d - b.d).slice(0, limit).map(r => r.id);
  const cameraDistance = () => camera.position.distanceTo(controls.target);
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
  // The errand this agent is on right now (the newest one that has started), with how far along it is.
  const errandFor = (list, id, t) => {
    let best = null;
    for (const e of list || []) if (e.agentId === id && t >= e.start && (!best || e.start > best.start)) best = e;
    const ph = best && errand(t - best.start);
    return ph ? { ...ph, result: best.result } : null;
  };
  function update(t, ui = {}) {
    if (S.focus) {
      const k = Math.min(1, (performance.now() - S.focus.t0) / S.focus.dur), e = k * k * (3 - 2 * k);
      controls.target.lerpVectors(S.focus.fromT, S.focus.toT, e); camera.position.lerpVectors(S.focus.fromP, S.focus.toP, e);
      if (k >= 1) S.focus = null;
    }
    controls.update();

    for (const r of S.agents.values()) {
      const a = r.agent, p = pose(a, t), mats = r.building.userData.mats, boost = a.id === ui.selectedId ? 1.2 : a.id === ui.hoverId ? 0.8 : 0;
      const er = errandFor(ui.errands, a.id, t);
      let rx = r.bx + p.dx * WALK_UNITS, rz = r.bz, yaw = p.walking ? (p.facing > 0 ? Math.PI / 2 : -Math.PI / 2) : 0, y = 0.14 + (p.typing ? Math.abs(Math.sin(t * 10 + r.ph * 6)) * 0.07 : p.asleep ? -0.02 : Math.sin(t * 2 + r.ph * 6) * 0.012);
      let walking = p.walking;
      if (er) {                      // an errand: carry a crate to the headquarters, drop it off, come back
        rx = r.bx + (r.hq.x - r.bx) * er.u; rz = r.bz + (r.hq.z - r.bz) * er.u;
        const back = !er.carrying && !er.depositing, k = back ? -1 : 1;
        yaw = Math.atan2((r.hq.x - r.bx) * k, (r.hq.z - r.bz) * k);
        y = 0.14 + (er.depositing ? Math.abs(Math.sin(t * 12)) * 0.12 : Math.abs(Math.sin(t * 9 + r.ph * 5)) * 0.05);
        walking = !er.depositing; r.carry.material.color.setHex(RESULT_HEX[er.result] ?? PALETTE.red);
        if (er.depositing) { const hq = S.hqs.get(a.island); if (hq) hq.last = t; }
      }
      r.carry.visible = !!er?.carrying;
      r.robot.position.set(rx, y, rz);
      r.robot.rotation.y = yaw;
      r.robot.rotation.z = p.asleep && !er ? 1.25 : er && walking ? Math.sin(t * 9 + r.ph * 5) * 0.1 : 0;
      r.robot.userData.arms.forEach((arm, i) => { arm.rotation.x = p.typing && !er ? Math.sin(t * 14 + i * Math.PI) * 0.9 : walking ? Math.sin(t * 9 + i * Math.PI) * 0.6 : 0; });
      r.robot.userData.body.emissive.setHex(p.alarm ? 0xff2244 : 0x000000);
      r.robot.userData.body.emissiveIntensity = p.alarm ? 0.7 : 0;
      const pulse = a.status === 'running' ? 0.6 + 0.5 * Math.sin(t * 6 + r.ph * 6) : a.status === 'fail' ? (p.alarm ? 1.4 : 0.3) : 0;
      mats.ring.emissiveIntensity = 1.0 + pulse + boost;
      if (a.status === 'fail') mats.body.emissive.setHex(p.alarm ? 0x66101c : 0x000000);
      if (r.alarm) r.alarm.position.set(rx, 1.5 + Math.sin(t * 6) * 0.04, rz);
      if (r.icon) r.icon.position.set(rx, 1.6 + Math.sin(t * 3 + r.ph * 6) * 0.05, rz);
      r.zs.forEach((z, i) => { const k = ((t * 0.5 + i / 3 + r.ph) % 1); z.position.set(r.bx + 0.2 + k * 0.3, 0.95 + k * 0.5, r.bz); z.material.opacity = 1 - k; z.scale.setScalar(0.2 + k * 0.22); });
      if (r.halo) {   // a pulsing ring on the ground shows who is working right now
        const k = (t * 1.2 + r.ph) % 1; r.halo.position.set(rx, 0.2, rz); r.halo.scale.setScalar(0.8 + k * 0.9); r.halo.material.opacity = 0.9 * (1 - k);
      }
      r.sparks.forEach((sp, i) => {   // a working agent throws sparks off its building
        const u = (t * 1.6 + i / 6 + r.ph) % 1, ang = i * 1.1 + r.ph * 6;
        sp.position.set(r.bx + Math.cos(ang) * 0.4 * u, 0.75 + u * 0.7, r.bz - 0.7 + Math.sin(ang) * 0.4 * u); sp.scale.setScalar(Math.max(0.01, 1 - u));
      });
    }

    for (const hq of S.hqs.values()) hq.mats.ring.emissiveIntensity = 1.0 + Math.max(0, 1 - (t - hq.last) / 0.7) * 1.8;

    if (S.bots) {
      const { list, parts, base, local, out, q, qs, p, one, hide, ax } = S.bots;
      // a part placed relative to the worker: translate to its joint, swing about x, then offset to the part's centre
      const put = (im, idx, x, y, z, swing, dy, scale = one) => {
        qs.setFromAxisAngle(ax, swing); local.compose(p.set(x, y, z), qs, scale);
        if (dy) local.multiply(out.makeTranslation(0, dy, 0));
        im.setMatrixAt(idx, out.multiplyMatrices(base, local));
      };
      list.forEach((b, i) => {
        const w = routeBot(b, t), x = b.ax + (b.bx - b.ax) * w.u, z = b.az + (b.bz - b.az) * w.u;
        const nx = -(b.bz - b.az), nz = b.bx - b.ax, nl = Math.hypot(nx, nz) || 1, sway = Math.sin(w.u * Math.PI) * 0.3 * b.side;
        const px = x + (nx / nl) * sway, pz = z + (nz / nl) * sway, dir = w.forward ? 1 : -1;
        const gait = t * 10 + b.ph * 5, bob = Math.abs(Math.sin(gait)) * 0.03;
        q.setFromEuler(eul.set(0, Math.atan2((b.bx - b.ax) * dir, (b.bz - b.az) * dir), 0));
        base.compose(p.set(px, 0.14 + bob, pz), q, one);
        const swing = Math.sin(gait) * 0.7;
        put(parts.body, i, 0, 0.38, 0, 0, 0);
        put(parts.head, i, 0, 0.62, 0, 0, 0);
        put(parts.hat, i, 0, 0.64, 0, 0, 0);
        put(parts.legs, i * 2, -0.05, 0.25, 0, swing, -0.12);
        put(parts.legs, i * 2 + 1, 0.05, 0.25, 0, -swing, -0.12);
        const carry = w.carrying;       // arms hold the crate out in front, otherwise swing
        put(parts.arms, i * 2, -0.13, 0.46, 0, carry ? -1.2 : -swing, -0.07);
        put(parts.arms, i * 2 + 1, 0.13, 0.46, 0, carry ? -1.2 : swing, -0.07);
        put(parts.crate, i, 0, 0.5, 0.19, 0, 0, carry ? one : hide);
        if (w.forward && w.u > 0.93) { const hq = S.hqs.get(b.isl); if (hq) hq.last = t; }
      });
      Object.values(parts).forEach(im => { im.instanceMatrix.needsUpdate = true; });
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
      tmp.set(r.bx, 1.1, r.bz).lerp(S.hubTop, e); tmp.y += Math.sin(k * Math.PI) * 2.2;
      mm.position.copy(tmp); mm.rotation.set(0, t * 6, Math.sin(t * 8) * 0.4); mm.scale.setScalar(1 - k * 0.35);
    }
    renderer.render(scene, camera);
  }

  return { setWorld, update, pick, project, agentHead, islandLabel, focusAgent, focusIsland, fit, zoom, setInset, nearAgents, cameraDistance, hasAgent: id => S.agents.has(id),
    element: renderer.domElement };
}
