// The 3D scene: renderer, camera, lights, sky, floating rocks, hexagon islands with their buildings and
// robots, the hub, picking and the camera glide. What exists comes from the world model and how it moves
// comes from anim.mjs; this file decides how it looks. Browser only (needs WebGL).
import { THREE, STATUS, HEALTH, buildPod, buildRobot, buildingFor, buildHub, symbolSprite } from './models.mjs';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { tileOffsets } from './world.mjs';
import { pose, hash } from './anim.mjs';

const TILE_GEO = new THREE.CylinderGeometry(0.97, 0.97, 0.3, 6);
const SKY = ['#8fb8ee', '#d9e0f2', '#f6d9c0'];
const WALK_UNITS = 0.5 / 14;          // pose offsets are in old pixel units; this turns them into tiles
const HUB_TOP = new THREE.Vector3(0, 6.3, 0);
const RESULT_HEX = { ok: 0x41e08a, fail: 0xff5d6c, running: 0x3fd7e8 };

const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  SKY.forEach((col, i) => g.addColorStop(i / (SKY.length - 1), col));
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A navy tile with thin light edges, repeated across the platform.
function gridTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = '#141a3d'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#2c3978'; x.lineWidth = 3; x.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Returns null when the browser cannot start WebGL.
export function createScene(container) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 800);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = 1.3; controls.minDistance = 5;

  scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x3a3d78, 1.15));
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536); sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const S = { world: null, root: new THREE.Group(), agents: new Map(), pickables: [], rocks: [], hub: null, focus: null, papers: new Map(),
    ring: null, size: { w: 1, h: 1 } };
  scene.add(S.root);
  S.ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  S.ring.rotation.x = Math.PI / 2; S.ring.visible = false; scene.add(S.ring);

  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    S.size = { w, h }; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();

  // ----- camera
  const overview = R => {
    const vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dist = (R * 1.1) / Math.tan(Math.min(vf, hf) / 2);
    return { target: new THREE.Vector3(0, 0, 0), position: new THREE.Vector3(0, 0.86, 0.5).normalize().multiplyScalar(dist) };
  };
  const glide = (target, position, seconds = 0.9) => {
    S.focus = { t0: performance.now(), dur: seconds * 1000, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: target, toP: position };
  };
  function fit(instant = false) {
    if (!S.world) return;
    const o = overview(S.world.bounds.radius + 5);   // the platform reaches a little past the islands
    controls.maxDistance = o.position.length() * 2.2;
    if (instant) { controls.target.copy(o.target); camera.position.copy(o.position); } else glide(o.target, o.position, 0.8);
  }

  // ----- building the world
  function clear() {
    S.root.traverse(o => { o.geometry?.dispose?.(); [].concat(o.material || []).forEach(m => { m.map?.dispose?.(); m.dispose(); }); });
    S.root.clear(); S.agents.clear(); S.pickables = []; S.rocks = []; S.papers.forEach(p => p.removeFromParent()); S.papers.clear();
  }

  function setWorld(world, { refit = false } = {}) {
    clear(); S.world = world;
    const R = world.bounds.radius, root = S.root;

    // the world floats in the sky on a round dark platform with a tiled top
    const gridMap = gridTexture(); gridMap.repeat.set(R + 6, R + 6);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(R + 6, R + 5, 1.4, 96), [
      new THREE.MeshStandardMaterial({ color: 0x0e1331, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: gridMap, roughness: 0.65, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: 0x0a0e24 })]);
    platform.position.y = -1.05; platform.receiveShadow = true; root.add(platform);

    S.hub = buildHub(); root.add(S.hub);

    // every tile of every island in one instanced mesh
    const tiles = world.islands.flatMap(isl => tileOffsets(isl.rings).map((t, i) => ({ isl, t, i })));
    const tileMesh = new THREE.InstancedMesh(TILE_GEO, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 }), tiles.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    tiles.forEach(({ isl, t, i }, n) => {
      m4.makeTranslation(isl.x + t.x, 0, isl.z + t.z); tileMesh.setMatrixAt(n, m4);
      const used = i > 0 && i <= isl.agentCount, base = isl.dormant ? 0x262b49 : i === 0 ? 0x4254a6 : used ? 0x34428c : 0x262f6e;
      tileMesh.setColorAt(n, col.setHex(base).offsetHSL(0, 0, ((i % 2) ? 0.012 : -0.01)));
    });
    tileMesh.receiveShadow = true; root.add(tileMesh);

    for (const isl of world.islands) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(isl.radius, isl.radius, 0.3, 6), new THREE.MeshStandardMaterial({
        color: HEALTH[isl.health] ?? HEALTH.ok, emissive: HEALTH[isl.health] ?? HEALTH.ok, emissiveIntensity: isl.dormant ? 0.15 : 0.55, roughness: 0.5 }));
      plate.rotation.y = Math.PI / 2; plate.position.set(isl.x, -0.1, isl.z); plate.receiveShadow = true; root.add(plate);
      const hq = buildPod(isl.dormant ? 'asleep' : isl.health === 'fail' ? 'fail' : 'ok', isl.dormant ? 1.5 : 2.1);
      hq.position.set(isl.x, 0.15, isl.z); hq.userData.island = isl.name; root.add(hq); S.pickables.push(hq);
    }

    for (const a of world.agents) {
      const isl = world.islands.find(i => i.name === a.island), ph = hash(a.id);
      const building = buildingFor(a, a.status); building.position.set(a.pos.x, 0.15, a.pos.z);
      if (a.kind === 'workflow') building.scale.set(1, 0.9 + ph * 0.4, 1);
      building.userData.agentId = a.id;
      const robot = buildRobot(a.kind, a.name); robot.position.set(a.pos.x, 0.15, a.pos.z + 0.62);
      robot.userData.agentId = a.id;
      const alarm = a.status === 'fail' ? symbolSprite('!', '#ff5a72') : null, zs = a.status === 'asleep' ? [0, 1, 2].map(() => symbolSprite('z', '#c9d3ff')) : [];
      [alarm, ...zs].filter(Boolean).forEach(s => root.add(s));
      root.add(building, robot); S.pickables.push(building, robot);
      S.agents.set(a.id, { agent: a, building, robot, bx: a.pos.x, bz: a.pos.z + 0.62, ph, alarm, zs, island: isl });
    }

    // drifting rocks around the world
    const rnd = lcg(7);
    for (let i = 0; i < 18; i++) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + rnd() * 1.1, 0), new THREE.MeshStandardMaterial({ color: 0x8a6a56, roughness: 0.95, flatShading: true }));
      const a = rnd() * Math.PI * 2, d = R * (1.15 + rnd() * 0.7), y = -1 + rnd() * 7;
      rock.position.set(Math.cos(a) * d, y, Math.sin(a) * d); rock.castShadow = true; rock.userData = { y, ph: rnd() * 6, spin: 0.1 + rnd() * 0.3 };
      root.add(rock); S.rocks.push(rock);
    }

    sun.position.set(R * 0.7, R * 1.4, R * 0.6);
    const sc = sun.shadow.camera; sc.left = -R - 6; sc.right = R + 6; sc.top = R + 6; sc.bottom = -R - 6; sc.near = 1; sc.far = R * 4; sc.updateProjectionMatrix();
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
  const islandLabel = isl => project(isl.x, 3.3, isl.z);

  function focusAgent(id) {
    const r = S.agents.get(id); if (!r) return;
    const target = new THREE.Vector3(r.bx, 0.6, r.bz - 0.3), dir = camera.position.clone().sub(controls.target).normalize();
    glide(target, target.clone().add(dir.multiplyScalar(Math.max(controls.minDistance + 1, 9))));
  }
  function focusIsland(name) {
    const isl = S.world?.islands.find(i => i.name === name); if (!isl) return;
    const target = new THREE.Vector3(isl.x, 0.5, isl.z), dir = camera.position.clone().sub(controls.target).normalize();
    glide(target, target.clone().add(dir.multiplyScalar(isl.radius * 2.6 + 4)));
  }

  // ----- per-frame animation
  const paperGeo = new THREE.BoxGeometry(0.22, 0.28, 0.02), tmp = new THREE.Vector3();
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
      r.robot.position.y = 0.15 + (p.typing ? Math.abs(Math.sin(t * 10 + r.ph * 6)) * 0.07 : p.asleep ? -0.02 : Math.sin(t * 2 + r.ph * 6) * 0.012);
      r.robot.rotation.y = p.walking ? (p.facing > 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
      r.robot.rotation.z = p.asleep ? 1.25 : 0;
      r.robot.userData.arms.forEach((arm, i) => { arm.rotation.x = p.typing ? Math.sin(t * 14 + i * Math.PI) * 0.9 : p.walking ? Math.sin(t * 9 + i * Math.PI) * 0.5 : 0; });
      r.robot.userData.body.emissive.setHex(p.alarm ? 0xff2244 : 0x000000);
      r.robot.userData.body.emissiveIntensity = p.alarm ? 0.7 : 0;
      const pulse = a.status === 'running' ? 0.6 + 0.5 * Math.sin(t * 6 + r.ph * 6) : a.status === 'fail' ? (p.alarm ? 1.4 : 0.3) : 0;
      mats.ring.emissiveIntensity = 1.1 + pulse + boost;
      if (a.status === 'fail') mats.body.emissive.setHex(p.alarm ? 0x66101c : 0x000000);
      if (r.alarm) r.alarm.position.set(r.robot.position.x, 0.98 + Math.sin(t * 6) * 0.04, r.bz);
      r.zs.forEach((z, i) => { const k = ((t * 0.5 + i / 3 + r.ph) % 1); z.position.set(r.bx + 0.15 + k * 0.25, 0.7 + k * 0.5, r.bz); z.material.opacity = 1 - k; z.scale.setScalar(0.18 + k * 0.2); });
    }

    S.rocks.forEach(rk => { rk.position.y = rk.userData.y + Math.sin(t * 0.4 + rk.userData.ph) * 0.4; rk.rotation.y += 0.002 * rk.userData.spin; rk.rotation.x += 0.001 * rk.userData.spin; });

    if (S.hub) { S.hub.userData.orb.emissiveIntensity = 1.6 + (ui.hubGlow || 0) * 2.4 + Math.sin(t * 2) * 0.2; S.hub.userData.ring.emissiveIntensity = 1.3 + (ui.hubGlow || 0) * 1.2; }

    const sel = ui.selectedId && S.agents.get(ui.selectedId);
    S.ring.visible = !!sel;
    if (sel) { S.ring.position.set(sel.bx, 0.2, sel.bz - 0.3); S.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.06); }

    const live = new Set(ui.papers || []);
    for (const [pg, m] of S.papers) if (!live.has(pg)) { m.removeFromParent(); m.material.dispose(); S.papers.delete(pg); }
    for (const pg of live) {
      const r = S.agents.get(pg.agentId), k = (t - pg.start) / pg.dur;
      if (!r || k < 0 || k > 1) { S.papers.get(pg)?.removeFromParent(); continue; }
      let m = S.papers.get(pg);
      if (!m) { m = new THREE.Mesh(paperGeo, new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: RESULT_HEX[pg.result] || 0x3fd7e8, emissiveIntensity: 0.6 })); S.papers.set(pg, m); }
      if (!m.parent) scene.add(m);
      const e = k * k * (3 - 2 * k);
      tmp.set(r.bx, 1.1, r.bz).lerp(HUB_TOP, e); tmp.y += Math.sin(k * Math.PI) * 2.2;
      m.position.copy(tmp); m.rotation.set(0, t * 6, Math.sin(t * 8) * 0.4); m.scale.setScalar(1 - k * 0.35);
    }
    renderer.render(scene, camera);
  }

  return { setWorld, update, pick, project, agentHead, islandLabel, focusAgent, focusIsland, fit, hasAgent: id => S.agents.has(id),
    element: renderer.domElement, hubTop: () => project(0, 6.9, 0) };
}
