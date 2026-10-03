// The 3D scene: renderer, camera, lights, sunny desert and sky, floating rocks, hexagon islands with their
// buildings and robots, the hub, picking and the camera glide. What exists comes from the world model and
// how it moves comes from anim.mjs; this file decides how it looks. Browser only (needs WebGL).
import { THREE, STATUS, HEALTH, PALETTE, buildPod, buildRobot, buildingFor, buildHub, symbolSprite, workingIcon, sleepSprite, bakeStatics } from './models.mjs';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { skyDome, planets, alienGround, alienProps } from './space.mjs';
import { scatterDecor } from './decor.mjs';
import { createPost } from './post.mjs';
import { addBlob } from './grounding.mjs';
import { tileOffsets, TILE } from './world.mjs';
import { pose, hash, errand, workCycle } from './anim.mjs';

const WALK_UNITS = 0.5 / 14;          // pose offsets are in old pixel units; this turns them into tiles
const RESULT_HEX = { ok: 0x41e08a, fail: 0xff5d6c, running: 0x3fd7e8 };
// How big things are drawn: buildings, the headquarters and the astronauts, and how far in front of its building an
// agent's astronaut stands (the building's radius plus a little).
const BUILD = 3.9, HQ_SCALE = 6.0, ASTRO = 5.5, FRONT = 2.6;
const FOG = 0x2a1844;   // the planet's haze: distance fades into deep violet

// Island floor colours by health: dark slate normally, royal blue while something is working (as in the reference).
const FLOOR = {
  ok: ['#3c3d4a', '#575865'], running: ['#2257e6', '#1a43b8'], fail: ['#46373d', '#6a4752'],
  idle: ['#2d4a52', '#47707b'], dormant: ['#43464f', '#5b5f6b'],
};
const SIDE = { ok: 0x59616f, running: 0x59616f, fail: 0x59616f, idle: 0x59616f, dormant: 0x3c4150 };   // steel plate edges

const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

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
// `fx` is true or false to force the effects (ambient occlusion, bloom, tilt-shift) on or off, or null to start them
// on and let them switch themselves off when the machine cannot keep up. `onFxAuto` hears about that switch-off.
export function createScene(container, { fx = null, onFxAuto = () => {} } = {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG); scene.fog = new THREE.FogExp2(FOG, 0.0030);
  scene.add(skyDome(), planets());
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 3200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = 1.38; controls.minDistance = 3.5;

  // a soft studio environment gives the metal, glass and plastic something to reflect, so they read as real materials
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.32;
  // Lighting with contrast is what makes shapes look solid: a strong warm sun, a cool sky fill and a faint
  // back-light that rims every figure. The darker shadow side is what the ambient occlusion pass then deepens.
  scene.add(new THREE.HemisphereLight(0xb08cff, 0x3a2850, 0.55));
  const sun = new THREE.DirectionalLight(0xfff0e0, 3.7);
  const shadowSize = Math.min(3072, renderer.capabilities.maxTextureSize);
  renderer.shadowMap.autoUpdate = false;   // redrawn every other frame in update(): shadows barely move between frames
  sun.castShadow = true; sun.shadow.mapSize.set(shadowSize, shadowSize); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  const rim = new THREE.DirectionalLight(0x4ad8ff, 1.4); rim.position.set(-30, 18, -40);
  scene.add(sun, sun.target, rim);

  const S = { world: null, root: new THREE.Group(), agents: new Map(), pickables: [], rocks: [], hub: null, focus: null, papers: new Map(),
    ring: null, bots: null, hqs: new Map(), hubTop: new THREE.Vector3(0, 6, 0), size: { w: 1, h: 1 } };
  scene.add(S.root);
  S.ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.06, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  S.ring.rotation.x = Math.PI / 2; S.ring.visible = false; scene.add(S.ring);
  const iconProto = workingIcon();

  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    S.size = { w, h }; renderer.setSize(w, h); camera.aspect = w / h; applyInset(); post?.setSize(w, h);
  }
  // Shifts the picture left so the world is centred in the part of the view that the side panel does not cover.
  function applyInset() {
    camera.setViewOffset(S.size.w, S.size.h, (S.inset || 0) / 2, 0, S.size.w, S.size.h); camera.updateProjectionMatrix();
  }
  const setInset = px => { S.inset = px; applyInset(); };
  let post = null;
  new ResizeObserver(resize).observe(container); resize();
  post = createPost(renderer, scene, camera, S.size.w, S.size.h, { on: fx !== false, auto: fx === null, onAuto: onFxAuto });

  // ----- camera
  const probe = new THREE.PerspectiveCamera(), edgeV = new THREE.Vector3(), AIM = new THREE.Vector3(0, 0.62, 0.78).normalize();
  // `edge` is a ring of points around every island; `R` is the radius of the circle that holds them, already foreshortened by the tilt.
  const overview = (edge, R, centre = new THREE.Vector3()) => {
    // frame the world inside the part of the view the side panel does not cover
    const vf = camera.fov * Math.PI / 180, visible = Math.max(0.4, (S.size.w - (S.inset || 0)) / S.size.h), hf = 2 * Math.atan(Math.tan(vf / 2) * visible);
    let dist = (R * 1.05) / Math.tan(Math.min(vf, hf) / 2);
    // The tilt makes the near islands look wider than the far ones, so in a narrow window the sideways reach can still spill out:
    // measure it from the real camera and back off until every edge is inside the free part of the view.
    const limit = Math.max(0.25, 1 - (S.inset || 0) / S.size.w) - 0.03;
    probe.fov = camera.fov; probe.aspect = S.size.w / S.size.h; probe.updateProjectionMatrix();
    const spill = d => {
      probe.position.copy(centre).addScaledVector(AIM, d); probe.lookAt(centre); probe.updateMatrixWorld(true);
      let wide = 0; for (const p of edge) wide = Math.max(wide, Math.abs(edgeV.copy(p).project(probe).x)); return wide > limit;
    };
    if (spill(dist)) {
      let hi = dist * 1.25; while (spill(hi) && hi < dist * 16) hi *= 1.25;
      let lo = hi / 1.25; for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (spill(mid)) lo = mid; else hi = mid; }
      dist = hi;
    }
    return { target: centre.clone(), position: centre.clone().add(AIM.clone().multiplyScalar(dist)) };
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
    const edge = cells.flatMap(c => Array.from({ length: 12 }, (_, k) => [0, 3.5].map(y => new THREE.Vector3(c.x + Math.cos(k * Math.PI / 6) * c.radius, y, c.z + Math.sin(k * Math.PI / 6) * c.radius)))).flat();
    const o = overview(edge, reach * 0.74 + 1, centre);   // the tilt foreshortens depth, so it can be framed closer
    controls.maxDistance = o.position.distanceTo(o.target) * 2.2 + 20;
    if (instant) { controls.target.copy(o.target); camera.position.copy(o.position); } else glide(o.target, o.position, 0.8);
  }
  function zoom(factor) {
    const off = camera.position.clone().sub(controls.target), len = THREE.MathUtils.clamp(off.length() * factor, controls.minDistance, controls.maxDistance || 400);
    glide(controls.target.clone(), controls.target.clone().add(off.setLength(len)), 0.35);
  }

  // ----- building the world
  function clear() {
    S.root.traverse(o => { o.geometry?.dispose?.(); [].concat(o.material || []).forEach(m => { if (!m.map?.userData?.keep) m.map?.dispose?.(); m.dispose(); }); });
    S.root.clear(); S.agents.clear(); S.hqs.clear(); S.pickables = []; S.rocks = []; S.papers.forEach(p => p.removeFromParent()); S.papers.clear();
  }

  function setWorld(world, { refit = false } = {}) {
    clear(); S.world = world;
    const R = world.bounds.radius, root = S.root;
    root.add(alienGround(R), alienProps(R));
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
    const hubScale = THREE.MathUtils.clamp(world.hub.radius / 4.6, 1, 2.8);
    addPlate({ x: 0, z: 0, radius: world.hub.radius }, 'dormant', 0x59d6ff, 0.7);
    S.hub = buildHub(); S.hub.scale.setScalar(hubScale); S.hub.position.y = 0.12; root.add(S.hub); S.hubTop.set(0, 6.1 * hubScale + 0.12, 0);

    const padGeo = new THREE.CylinderGeometry(1.5, 1.56, 0.05, 8), pads = [];
    world.islands.forEach(isl => {
      const h = isl.health;
      addPlate(isl, h, HEALTH[h] ?? HEALTH.ok, isl.dormant ? 0.1 : 0.5);
      const hq = buildPod(isl.dormant ? 'asleep' : h === 'fail' ? 'fail' : 'ok', isl.dormant ? 3.2 : HQ_SCALE);
      hq.position.set(isl.x, 0.12, isl.z); hq.userData.island = isl.name; root.add(hq); S.pickables.push(hq); addBlob(hq, 0.75, 0.05, 0.6);
      S.hqs.set(isl.name, { mats: hq.userData.mats, last: -9 });
      tileOffsets(isl.rings).forEach((t, i) => { if (i <= isl.agentCount) pads.push([isl.x + t.x, isl.z + t.z, i === 0 ? 1.9 : 1, FLOOR[h]?.[0] ?? FLOOR.ok[0]]); });
    });
    if (pads.length) {
      const im = new THREE.InstancedMesh(padGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), pads.length), m = new THREE.Matrix4(), c = new THREE.Color();
      pads.forEach(([x, z, s, col], i) => { m.compose(new THREE.Vector3(x, 0.14, z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s)); im.setMatrixAt(i, m); im.setColorAt(i, c.set(col).offsetHSL(0, 0, 0.07)); });
      im.receiveShadow = true; root.add(im);
    }
    const decor = scatterDecor(world, tileOffsets, TILE * 1.4);
    decor.forEach(d => root.add(d));

    for (const a of world.agents) {
      const isl = world.islands.find(i => i.name === a.island), ph = hash(a.id);
      const building = buildingFor(a, a.status, ph); building.position.set(a.pos.x, 0.14, a.pos.z);
      building.rotation.y = Math.floor(ph * 8) * (Math.PI / 4);
      building.scale.setScalar(BUILD);   // chunky, like the reference
      building.userData.agentId = a.id; addBlob(building, 0.72, 0.05, 0.55);
      const robot = buildRobot(a.kind, a.name); robot.position.set(a.pos.x, 0.14, a.pos.z + FRONT);
      robot.scale.setScalar(ASTRO); robot.rotation.order = 'YXZ'; robot.userData.agentId = a.id; addBlob(robot, 0.2, 0.05, 0.55);
      const carry = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: PALETTE.orange, roughness: 0.45 }));
      carry.position.set(0, 0.45, 0.24); carry.visible = false; robot.add(carry);
      const sparks = a.status === 'running' ? Array.from({ length: 6 }, () => { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff1a8 })); root.add(sp); return sp; }) : [];
      const halo = a.status === 'running' ? new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 8, 40), new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true })) : null;
      if (halo) { halo.rotation.x = Math.PI / 2; root.add(halo); }
      const dx = a.pos.x - isl.x, dz = a.pos.z - isl.z, len = Math.hypot(dx, dz) || 1;
      const alarm = a.status === 'fail' ? symbolSprite('!', '#ff5a4a') : null, zs = a.status === 'running' || a.status === 'fail' || a.timer ? [] : [sleepSprite()];   // an agent that is not working and has no timer is lying asleep, with a big zzz; one on a timer jogs
      const icon = a.status === 'running' ? iconProto.clone() : null; icon?.scale.set(1.15, 1.15, 1);
      [alarm, icon, ...zs].filter(Boolean).forEach(s => root.add(s));
      root.add(building, robot); S.pickables.push(building, robot);
      S.agents.set(a.id, { agent: a, building, robot, carry, sparks, halo, bx: a.pos.x, bz: a.pos.z + FRONT, ph, alarm, icon, zs, island: isl,
        hq: { x: isl.x + (dx / len) * 5.6, z: isl.z + (dz / len) * 5.6 } });
    }

    // the buildings never move, so their shared-material parts are merged across the whole world (see bakeStatics)
    const buildings = S.pickables.filter(o => o.userData.mats);
    bakeStatics(root, [...buildings, ...decor], buildings);

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
  const agentHead = id => { const r = S.agents.get(id); return r ? project(r.robot.position.x, 4.6, r.robot.position.z) : null; };
  // The agents closest to what the camera is looking at, for name tags when zoomed in.
  const nearAgents = (radius, limit) => [...S.agents.values()]
    .map(r => ({ id: r.agent.id, d: Math.hypot(r.robot.position.x - controls.target.x, r.robot.position.z - controls.target.z) }))
    .filter(r => r.d < radius).sort((a, b) => a.d - b.d).slice(0, limit).map(r => r.id);
  const cameraDistance = () => camera.position.distanceTo(controls.target);
  const islandLabel = isl => project(isl.x, 6.8, isl.z);

  function focusAgent(id) {
    const r = S.agents.get(id); if (!r) return;
    const target = new THREE.Vector3(r.bx, 0.7, r.bz - FRONT * 0.5), dir = camera.position.clone().sub(controls.target).normalize();
    glide(target, target.clone().add(dir.multiplyScalar(12)));
  }
  function focusIsland(name) {
    const isl = S.world?.islands.find(i => i.name === name); if (!isl) return;
    const target = new THREE.Vector3(isl.x, 0.5, isl.z), dir = camera.position.clone().sub(controls.target).normalize();
    glide(target, target.clone().add(dir.multiplyScalar(isl.radius * 2.6 + 4)));
  }

  // ----- per-frame animation
  const paperGeo = new THREE.BoxGeometry(0.22, 0.28, 0.02), tmp = new THREE.Vector3();
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
      // a replayed event sends the astronaut on an errand; otherwise a working agent keeps picking things up and taking them to the base
      const hqDist = Math.hypot(r.hq.x - r.bx, r.hq.z - r.bz);
      const er = errandFor(ui.errands, a.id, t) || (a.status === 'running' ? { ...workCycle(t + r.ph * 20, hqDist), result: 'running' } : null);
      let rx = r.bx + p.dx * WALK_UNITS, rz = r.bz, yaw = p.walking ? (p.facing > 0 ? Math.PI / 2 : -Math.PI / 2) : 0, y = 0.14 + (p.typing ? Math.abs(Math.sin(t * 10 + r.ph * 6)) * 0.3 : p.asleep ? -0.1 : Math.sin(t * 2 + r.ph * 6) * 0.012);
      let walking = p.walking;
      if (p.jogging && !er) {   // on a timer: jogs a small circle around its spot
        const ja = t * 1.7 + r.ph * 6.3;
        rx = r.bx + Math.cos(ja) * 1.15; rz = r.bz + Math.sin(ja) * 1.15; yaw = Math.atan2(-Math.sin(ja), Math.cos(ja));
        y = 0.14 + Math.abs(Math.sin(t * 7.5 + r.ph * 5)) * 0.35; walking = true;
      }
      if (er) {                      // an errand: carry a crate to the headquarters, drop it off, come back
        rx = r.bx + (r.hq.x - r.bx) * er.u; rz = r.bz + (r.hq.z - r.bz) * er.u;
        const back = !er.carrying && !er.depositing, k = back ? -1 : 1;
        yaw = er.picking ? Math.PI : Math.atan2((r.hq.x - r.bx) * k, (r.hq.z - r.bz) * k);   // picking up: facing its building
        y = 0.14 + (er.depositing ? Math.abs(Math.sin(t * 12)) * 0.12 : er.picking ? 0 : Math.abs(Math.sin(t * 9 + r.ph * 5)) * 0.25);
        walking = !er.depositing && !er.picking; r.carry.material.color.setHex(RESULT_HEX[er.result] ?? PALETTE.orange);
        if (er.depositing) { const hq = S.hqs.get(a.island); if (hq) hq.last = t; }
      }
      r.carry.visible = !!er?.carrying;
      // asleep: lying on its side, helmet towards the camera, centred on its spot and a little smaller so it stays inside its tile;
      // working: leaning into the job with the arms hammering; on a timer: jogging; failing or on an errand: walking
      const lying = p.asleep && !er, sc = lying ? ASTRO * 0.85 : ASTRO, tilt = lying ? 1.45 : 0;
      r.robot.scale.setScalar(sc);
      r.robot.position.set(rx + (lying ? Math.sin(tilt) * 0.36 * sc : 0), lying ? 0.14 + 0.14 * sc + Math.sin(t * 1.4 + r.ph * 6) * 0.02 : y, rz);
      r.robot.rotation.y = yaw;
      r.robot.rotation.x = er?.picking ? 0.5 + Math.sin(t * 9 + r.ph * 6) * 0.08 : p.typing && !er ? 0.18 + Math.sin(t * 10 + r.ph * 6) * 0.06 : p.jogging && !er ? 0.3 : walking && er ? 0.12 : 0;
      r.robot.rotation.z = lying ? tilt + Math.sin(t * 1.4 + r.ph * 6) * 0.02 : er && walking ? Math.sin(t * 9 + r.ph * 5) * 0.1 : 0;
      r.robot.userData.arms.forEach((arm, i) => { arm.rotation.x = lying ? 0.25 : er?.picking ? -1.2 + Math.sin(t * 9 + i * Math.PI) * 0.4 : er?.carrying ? -1.0 : p.typing && !er ? -0.9 + Math.sin(t * 14 + i * Math.PI) * 0.7 : p.jogging && !er ? Math.sin(t * 13 + i * Math.PI) * 1.1 : walking ? Math.sin(t * 9 + i * Math.PI) * 0.6 : 0; });
      r.robot.userData.body.emissive.setHex(p.alarm ? 0xff2244 : 0x000000);
      r.robot.userData.body.emissiveIntensity = p.alarm ? 0.7 : 0;
      const pulse = a.status === 'running' ? 0.6 + 0.5 * Math.sin(t * 6 + r.ph * 6) : a.status === 'fail' ? (p.alarm ? 1.4 : 0.3) : 0;
      mats.ring.emissiveIntensity = 1.0 + pulse + boost;
      if (a.status === 'fail') mats.body.emissive.setHex(p.alarm ? 0x66101c : 0x000000);
      if (r.alarm) r.alarm.position.set(rx, 5.4 + Math.sin(t * 6) * 0.04, rz);
      if (r.icon) r.icon.position.set(rx, 5.9 + Math.sin(t * 3 + r.ph * 6) * 0.08, rz);
      // the zzz hovers over the head and follows it when the agent strolls; lower when it is lying down
      r.zs.forEach(z => { z.visible = !er; z.position.set(rx - 0.9, 3.5 + Math.sin(t * 1.6 + r.ph * 6) * 0.12, rz + 0.3); z.material.opacity = 0.88 + Math.sin(t * 2.4 + r.ph * 6) * 0.12; });
      if (r.halo) {   // a pulsing ring on the ground shows who is working right now
        const k = (t * 1.2 + r.ph) % 1; r.halo.position.set(rx, 0.2, rz); r.halo.scale.setScalar(0.8 + k * 0.9); r.halo.material.opacity = 0.9 * (1 - k);
      }
      r.sparks.forEach((sp, i) => {   // a working agent throws sparks off its building
        const u = (t * 1.6 + i / 6 + r.ph) % 1, ang = i * 1.1 + r.ph * 6;
        sp.position.set(r.bx + Math.cos(ang) * 1.3 * u, 2.2 + u * 2.6, r.bz - FRONT + Math.sin(ang) * 1.3 * u); sp.scale.setScalar(Math.max(0.01, 1 - u));
      });
    }

    for (const hq of S.hqs.values()) hq.mats.ring.emissiveIntensity = 1.0 + Math.max(0, 1 - (t - hq.last) / 0.7) * 1.8;

    S.rocks.forEach(rk => { rk.position.y = rk.userData.y + Math.sin(t * 0.4 + rk.userData.ph) * 0.4; rk.rotation.y += 0.002 * rk.userData.spin; rk.rotation.x += 0.001 * rk.userData.spin; });

    if (S.hub) { S.hub.userData.orb.emissiveIntensity = 1.6 + (ui.hubGlow || 0) * 2.4 + Math.sin(t * 2) * 0.2; S.hub.userData.ring.emissiveIntensity = 1.2 + (ui.hubGlow || 0) * 1.2; }

    const sel = ui.selectedId && S.agents.get(ui.selectedId);
    S.ring.visible = !!sel;
    if (sel) { S.ring.position.set(sel.bx, 0.2, sel.bz - FRONT * 0.5); S.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.06); }

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
    renderer.shadowMap.needsUpdate = (S.frame = (S.frame || 0) + 1) % 2 === 1;
    renderer.info.reset();   // counts are kept across the several passes of one frame, so they show the whole frame
    post.tick(performance.now());
    post.render(camera.position.distanceTo(controls.target));
  }

  return { debugRoot: () => S.root, stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, ratio: renderer.getPixelRatio() }), setFx: on => post.setEnabled(on), fxOn: () => post.enabled, setWorld, update, pick, project, agentHead, islandLabel, focusAgent, focusIsland, fit, zoom, setInset, nearAgents, cameraDistance, hasAgent: id => S.agents.has(id),
    element: renderer.domElement };
}
