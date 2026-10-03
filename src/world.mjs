// The world model: turns the published agent data, a small local config and the current time into
// hexagon islands (one per repo), the agents standing on them and the recent events. Pure (no DOM, no
// network), so the same input always gives the same world and it can be tested without a browser.
// Positions are on the ground plane (x, z) in tile sizes; a tile is a hexagon with circumradius 1.
export const DAY = 864e5;
const DORMANT_DAYS = 30;     // matches the agent-hq legend: dormant = quiet for more than 30 days
const RUNNING_WINDOW = 30 * 60e3;   // a commit this fresh means the committer is working right now
const RECENT = 5;            // recent items kept per agent for the detail card

const SQRT3 = Math.sqrt(3);
// How far apart the tiles of an island are, as a multiple of the basic hexagon. Buildings are drawn bigger than a basic
// tile, so the tiles are spread out to give them room.
export const TILE = 1.7;
// Every tile except the base in the middle is pushed this far outward, so the base has room to be the biggest building.
export const PUSH = 0.45;
const GAP = 0.4;                      // the strip of ground between neighbouring islands
const CLOSED_RADIUS = 2.4;            // closed (dormant) islands are small
const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const ms = iso => new Date(iso).getTime();
const round = v => Math.round(v * 1000) / 1000;

export function runResult(run) {
  if (run.status !== 'completed') return 'running';
  return run.concl === 'success' ? 'succeeded' : run.concl === 'failure' ? 'failed' : (run.concl || 'no result');
}
const runStatus = run => (run.status !== 'completed' ? 'running' : run.concl === 'failure' ? 'fail' : run.concl === 'success' ? 'ok' : 'idle');
const eventResult = status => (status === 'fail' ? 'fail' : status === 'running' ? 'running' : 'ok');
const LOCAL_STATUS = { scheduled: 'asleep', running: 'running', fail: 'fail', ok: 'ok', idle: 'idle' };
const runDetail = run => ({ result: runResult(run), date: run.date, event: run.event, url: run.url });
const LOCAL_NOTE = 'Not tracked live: this agent is listed by hand, GitHub cannot see its runs.';

function agentsOf(r, localAgents, now) {
  const out = [];
  for (const w of [...r.workflows].sort(byName)) {
    const runs = w.runs && w.runs.length ? w.runs : [w];
    out.push({ id: `${r.name}::${w.name}`, name: w.name, kind: 'workflow', status: runStatus(w), repo: r.name, url: w.url,
      details: { latest: runDetail(runs[0]), recent: runs.slice(0, RECENT).map(runDetail) } });
  }
  const people = [['claude', 'Claude · builder', 'builder'], ['bot', 'Auto-commit bot', 'builder'], ['you', 'You', 'human']];
  for (const [who, name, kind] of people) {
    const mine = r.commits.filter(c => c.who === who).sort((a, b) => ms(b.date) - ms(a.date));
    if (!mine.length) continue;
    const recent = mine.slice(0, RECENT).map(c => ({ text: c.msg, date: c.date, url: c.url, sha: c.sha }));
    out.push({ id: `${r.name}::${name}`, name, kind, status: now - ms(mine[0].date) < RUNNING_WINDOW ? 'running' : 'ok',
      repo: r.name, url: r.url, details: { latest: recent[0], recent, count: mine.length } });
  }
  for (const a of localAgents) out.push(localAgent(a, r.name, r.name));
  return out;
}

const localAgent = (a, repo, islandName) => ({ id: `${islandName}::${a.name}`, name: a.name, kind: 'local', status: LOCAL_STATUS[a.status] || 'asleep',
  repo, url: null, details: { schedule: a.schedule || '', role: a.role || '', note: LOCAL_NOTE, startUrl: a.startUrl || '' } });

// ----- hexagon islands
// Tiles are pointy-top hexagons in axial coordinates; tile 0 is the headquarters in the middle and the
// rest spiral outwards ring by ring.
function spiral(count) {
  const out = [[0, 0]];
  for (let k = 1; out.length < count; k++) {
    let q = -k, r = k;
    for (let side = 0; side < 6; side++) for (let j = 0; j < k; j++) { out.push([q, r]); q += HEX_DIRS[side][0]; r += HEX_DIRS[side][1]; }
  }
  return out.slice(0, count);
}
const tileXZ = ([q, r]) => {
  const x = TILE * SQRT3 * (q + r / 2), z = TILE * 1.5 * r, d = Math.hypot(x, z), k = d ? 1 + PUSH / d : 1;
  return { x: x * k, z: z * k };
};
// Every tile of an island with this many rings, as offsets from its centre (the renderer draws them all).
export const tileOffsets = rings => spiral(1 + 3 * rings * (rings + 1)).map(tileXZ);
const ringsFor = agents => { let rings = 1; while (1 + 3 * rings * (rings + 1) < agents + 1) rings++; return rings; };
const islandRadius = rings => TILE * SQRT3 * rings + 1.5 + PUSH;

function healthOf(agents) {
  if (agents.some(a => a.status === 'fail')) return 'fail';
  if (agents.some(a => a.status === 'running')) return 'running';
  return agents.some(a => a.status === 'ok') ? 'ok' : 'idle';
}

// Islands are packed like a honeycomb, as in the reference: the hub takes the middle cell and the islands
// spiral out around it, live ones first. Every cell is the size of the busiest island, so they sit edge to
// edge with a small gap. Island hexagons have their corners on the x axis, so neighbours lie at 30°, 90°, …
function layout(islands) {
  const cell = Math.max(islandRadius(1), ...islands.map(i => i.radius)), step = SQRT3 * cell + GAP;
  const cells = spiral(islands.length + 1).slice(1);
  const placed = cells.map(([q, r]) => ({ x: round(step * q * Math.cos(Math.PI / 6)), z: round(step * (q * Math.sin(Math.PI / 6) + r)) }));
  return { hub: { x: 0, z: 0, radius: round(cell) }, placed };
}

export function buildWorld(data, config = {}, now = Date.now(), opts = {}) {
  const repos = (data.repos || []).slice().sort(byName);
  const present = new Set(repos.map(r => r.name));
  const locals = (config.localAgents || []).filter(a => !a.repo || present.has(a.repo));
  const isDormant = r => (now - ms(r.pushed)) / DAY > DORMANT_DAYS;

  const islands = [], agents = [];
  const addIsland = (name, repo, url, list) => {
    // a status override (a run the Admin just requested) is drawn in place of the status the data still shows
    if (opts.statusOverrides) list = list.map(a => (opts.statusOverrides[a.id] ? { ...a, status: opts.statusOverrides[a.id] } : a));
    const rings = ringsFor(list.length);
    islands.push({ name, repo, url, dormant: false, agentCount: list.length, rings, radius: round(islandRadius(rings)), health: healthOf(list) });
    list.forEach(a => agents.push({ ...a, island: name }));
  };
  for (const r of repos.filter(x => !isDormant(x))) addIsland(r.name, r.name, r.url, agentsOf(r, locals.filter(a => a.repo === r.name), now));
  const lobby = locals.filter(a => !a.repo);
  if (lobby.length) addIsland('Lobby', null, null, lobby.map(a => localAgent(a, null, 'Lobby')));
  if (opts.showDormant) {
    for (const r of repos.filter(isDormant)) islands.push({ name: r.name, repo: r.name, url: r.url, dormant: true, agentCount: 0, rings: 1, radius: CLOSED_RADIUS, health: 'dormant' });
  }
  // live islands all take the size of the busiest one, so the honeycomb is even
  const rings = Math.max(1, ...islands.filter(i => !i.dormant).map(i => i.rings));
  islands.filter(i => !i.dormant).forEach(i => { i.rings = rings; i.radius = round(islandRadius(rings)); });

  const { hub, placed } = layout(islands);
  islands.forEach((isl, i) => { isl.x = placed[i].x; isl.z = placed[i].z; });

  const tiles = new Map(islands.map(i => [i.name, spiral(i.agentCount + 1)])), used = new Map();
  for (const a of agents) {
    const isl = islands.find(i => i.name === a.island), n = (used.get(a.island) || 0) + 1;
    used.set(a.island, n);
    const t = tileXZ(tiles.get(a.island)[n]);   // tile 0 is the headquarters, agents take tiles 1, 2, 3…
    a.pos = { x: round(isl.x + t.x), z: round(isl.z + t.z) };
  }

  const events = [];
  const byId = new Map(agents.map(a => [a.id, a]));
  for (const r of repos.filter(x => !isDormant(x))) {
    for (const w of r.workflows) {
      for (const run of (w.runs && w.runs.length ? w.runs : [w])) {
        if (now - ms(run.date) > DAY || !byId.has(`${r.name}::${w.name}`)) continue;
        events.push({ time: run.date, kind: 'run', agentId: `${r.name}::${w.name}`, island: r.name, text: `${w.name}: ${runResult(run)}`, detail: runResult(run), result: eventResult(runStatus(run)), url: run.url });
      }
    }
    for (const c of r.commits) {
      const name = c.who === 'claude' ? 'Claude · builder' : c.who === 'bot' ? 'Auto-commit bot' : 'You';
      if (now - ms(c.date) > DAY || !byId.has(`${r.name}::${name}`)) continue;
      events.push({ time: c.date, kind: 'commit', agentId: `${r.name}::${name}`, island: r.name, text: c.msg, detail: c.msg, result: 'ok', url: c.url });
    }
  }
  events.sort((a, b) => ms(a.time) - ms(b.time) || (a.agentId < b.agentId ? -1 : 1));

  const radius = Math.max(hub.radius, ...islands.map(i => Math.hypot(i.x, i.z) + i.radius));
  return { islands, agents, events, hub, bounds: { radius: Math.ceil(radius * 1000) / 1000 }, generatedAt: data.generatedAt || null };
}
