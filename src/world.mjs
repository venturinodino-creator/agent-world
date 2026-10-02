// The world model: turns the published agent data, a small local config and the current time
// into rooms, agents and recent events. Pure (no DOM, no network), so the same input always
// gives the same world and it can be tested without a browser. Units are tiles.
export const DAY = 864e5;
const DORMANT_DAYS = 30;     // matches the agent-hq legend: dormant = quiet for more than 30 days
const RUNNING_WINDOW = 30 * 60e3;   // a commit this fresh means the committer is working right now
const RECENT = 5;            // recent items kept per agent for the detail panel

const DESK = 5, PAD_X = 2, HEADER = 3, PAD_BOTTOM = 2;   // room layout
const GAP = 3, MARGIN = 4, HUB = 8;                       // spacing between rooms, world edge, hub size
const CLOSED = { w: 12, h: 8 };                           // dormant and empty rooms

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const ms = iso => new Date(iso).getTime();

export function runResult(run) {
  if (run.status !== 'completed') return 'running';
  return run.concl === 'success' ? 'succeeded' : run.concl === 'failure' ? 'failed' : (run.concl || 'no result');
}
const runStatus = run => (run.status !== 'completed' ? 'running' : run.concl === 'failure' ? 'fail' : run.concl === 'success' ? 'ok' : 'idle');
const eventResult = status => (status === 'fail' ? 'fail' : status === 'running' ? 'running' : 'ok');
const LOCAL_STATUS = { scheduled: 'asleep', running: 'running', fail: 'fail', ok: 'ok', idle: 'idle' };

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
  for (const a of localAgents) {
    out.push({ id: `${r.name}::${a.name}`, name: a.name, kind: 'local', status: LOCAL_STATUS[a.status] || 'asleep', repo: r.name,
      url: null, details: { schedule: a.schedule || '', role: a.role || '', note: 'Not tracked live: this agent is listed by hand, GitHub cannot see its runs.' } });
  }
  return out;
}
const runDetail = run => ({ result: runResult(run), date: run.date, event: run.event, url: run.url });

function roomSize(n) {
  if (!n) return { ...CLOSED, cols: 0 };
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  return { w: cols * DESK + 2 * PAD_X, h: HEADER + rows * DESK + PAD_BOTTOM, cols };
}

const apart = (p, q, gap) => p.x + p.w + gap <= q.x || q.x + q.w + gap <= p.x || p.y + p.h + gap <= q.y || q.y + q.h + gap <= p.y;

// Rooms sit on a ring around the hub; the ring grows until nothing touches anything in `avoid`.
function ring(rooms, avoid, start) {
  const n = rooms.length;
  if (!n) return [];
  for (let radius = start; ; radius++) {
    const placed = rooms.map((r, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return { x: Math.round(radius * Math.cos(a) - r.w / 2), y: Math.round(radius * Math.sin(a) - r.h / 2), w: r.w, h: r.h };
    });
    if (placed.every((p, i) => avoid.every(b => apart(p, b, GAP)) && placed.slice(i + 1).every(q => apart(p, q, GAP)))) return placed;
  }
}

// Live rooms take the inner ring; closed (dormant) rooms get an outer ring so they never crowd the live ones.
function placeOnRing(rooms) {
  const hub = { x: -HUB / 2, y: -HUB / 2, w: HUB, h: HUB };
  const live = rooms.filter(r => !r.dormant), closed = rooms.filter(r => r.dormant);
  const inner = ring(live, [hub], HUB);
  const reach = Math.max(HUB, ...inner.map(p => Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.x + p.w), Math.abs(p.y + p.h))));
  const outer = ring(closed, [hub, ...inner], reach + GAP + CLOSED.h);
  return { hub, placed: [...inner, ...outer] };
}

export function buildWorld(data, config = {}, now = Date.now(), opts = {}) {
  const repos = (data.repos || []).slice().sort(byName);
  const present = new Set(repos.map(r => r.name));
  const locals = (config.localAgents || []).filter(a => !a.repo || present.has(a.repo));
  const isDormant = r => (now - ms(r.pushed)) / DAY > DORMANT_DAYS;

  const rooms = [], agents = [];
  for (const r of repos.filter(x => !isDormant(x))) {
    const list = agentsOf(r, locals.filter(a => a.repo === r.name), now);
    rooms.push({ name: r.name, repo: r.name, url: r.url, dormant: false, agentCount: list.length, ...roomSize(list.length) });
    list.forEach(a => agents.push({ ...a, room: r.name }));
  }
  const lobby = locals.filter(a => !a.repo);
  if (lobby.length) {
    rooms.push({ name: 'Lobby', repo: null, url: null, dormant: false, agentCount: lobby.length, ...roomSize(lobby.length) });
    lobby.forEach(a => agents.push({ id: `Lobby::${a.name}`, name: a.name, kind: 'local', status: LOCAL_STATUS[a.status] || 'asleep', room: 'Lobby', repo: null,
      url: null, details: { schedule: a.schedule || '', role: a.role || '', note: 'Not tracked live: this agent is listed by hand, GitHub cannot see its runs.' } }));
  }
  if (opts.showDormant) {
    for (const r of repos.filter(isDormant)) rooms.push({ name: r.name, repo: r.name, url: r.url, dormant: true, agentCount: 0, ...CLOSED, cols: 0 });
  }

  const { hub, placed } = placeOnRing(rooms);
  const boxes = [hub, ...placed];
  const minX = Math.min(...boxes.map(b => b.x)), minY = Math.min(...boxes.map(b => b.y));
  const dx = MARGIN - minX, dy = MARGIN - minY;
  rooms.forEach((r, i) => { r.x = placed[i].x + dx; r.y = placed[i].y + dy; });
  const shiftedHub = { x: hub.x + dx, y: hub.y + dy, w: HUB, h: HUB };

  const seat = new Map();
  for (const a of agents) {
    const room = rooms.find(r => r.name === a.room), i = seat.get(a.room) || 0;
    seat.set(a.room, i + 1);
    a.desk = { x: room.x + PAD_X + (i % room.cols) * DESK + DESK / 2, y: room.y + HEADER + Math.floor(i / room.cols) * DESK + DESK / 2 };
  }

  const events = [];
  const byId = new Map(agents.map(a => [a.id, a]));
  for (const r of repos.filter(x => !isDormant(x))) {
    for (const w of r.workflows) {
      for (const run of (w.runs && w.runs.length ? w.runs : [w])) {
        if (now - ms(run.date) > DAY || !byId.has(`${r.name}::${w.name}`)) continue;
        events.push({ time: run.date, kind: 'run', agentId: `${r.name}::${w.name}`, room: r.name, text: `${w.name}: ${runResult(run)}`, detail: runResult(run), result: eventResult(runStatus(run)), url: run.url });
      }
    }
    for (const c of r.commits) {
      const name = c.who === 'claude' ? 'Claude · builder' : c.who === 'bot' ? 'Auto-commit bot' : 'You';
      if (now - ms(c.date) > DAY || !byId.has(`${r.name}::${name}`)) continue;
      events.push({ time: c.date, kind: 'commit', agentId: `${r.name}::${name}`, room: r.name, text: c.msg, detail: c.msg, result: 'ok', url: c.url });
    }
  }
  events.sort((a, b) => ms(a.time) - ms(b.time) || (a.agentId < b.agentId ? -1 : 1));

  const maxX = Math.max(...boxes.map(b => b.x + dx + b.w)), maxY = Math.max(...boxes.map(b => b.y + dy + b.h));
  return { rooms, agents, events, hub: shiftedHub, bounds: { w: maxX + MARGIN, h: maxY + MARGIN }, generatedAt: data.generatedAt || null };
}
