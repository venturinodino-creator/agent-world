import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld, tileOffsets, TILE, PUSH } from '../src/world.mjs';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const iso = hoursAgo => new Date(NOW - hoursAgo * 3600e3).toISOString();

const repo = (name, over = {}) => ({ name, full: 'me/' + name, desc: '', url: 'https://github.com/me/' + name, home: '',
  lang: 'JS', pushed: iso(1), priv: false, issues: 0, prs: '—', commits: [], workflows: [], ...over });
const run = (over = {}) => ({ status: 'completed', concl: 'success', date: iso(2), url: 'run-url', event: 'schedule', ...over });
const wf = (name, over = {}) => ({ name, ...run(), runs: [run()], ...over });
const commit = (who, hoursAgo, msg = 'a change') => ({ sha: 'abc1234', msg, date: iso(hoursAgo), author: 'x', url: 'commit-url', who, ai: who !== 'you' });
const world = (repos, config = { localAgents: [] }, opts) => buildWorld({ repos }, config, NOW, opts);
const agentsIn = (w, name) => w.agents.filter(a => a.island === name);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const centre = i => ({ x: i.x, z: i.z });

test('one island per active repo, in a stable order', () => {
  const w = world([repo('beta'), repo('alpha')]);
  assert.deepEqual(w.islands.map(r => r.name), ['alpha', 'beta']);
});

test('dormant repos are left out unless asked for, then appear as closed islands with no agents', () => {
  const repos = [repo('live'), repo('old', { pushed: iso(24 * 90), workflows: [wf('ci')] })];
  assert.deepEqual(world(repos).islands.map(r => r.name), ['live']);
  const shown = world(repos, undefined, { showDormant: true });
  const old = shown.islands.find(r => r.name === 'old');
  assert.equal(old.dormant, true);
  assert.equal(old.health, 'dormant');
  assert.deepEqual(agentsIn(shown, 'old'), []);
});

test('every workflow is an agent', () => {
  const w = world([repo('a', { workflows: [wf('Smoke'), wf('Deploy')] })]);
  assert.deepEqual(agentsIn(w, 'a').map(x => [x.id, x.kind]), [['a::Deploy', 'workflow'], ['a::Smoke', 'workflow']]);
});

test('workflows listed in config.skipWorkflows are plumbing, not agents: they make no agent and no event', () => {
  const config = { localAgents: [], skipWorkflows: ['Pages build and deployment', 'smoke check'] };
  const w = world([repo('a', { workflows: [wf('pages build and deployment'), wf('Smoke check'), wf('Daily Scan')] })], config);
  assert.deepEqual(agentsIn(w, 'a').map(x => x.name), ['Daily Scan']);
  assert.deepEqual(w.events.map(e => e.agentId), ['a::Daily Scan']);
  assert.equal(w.islands[0].agentCount, 1);
});

test('an island is sized for the agents that are left once plumbing is skipped', () => {
  const flows = [...Array.from({ length: 18 }, (_, i) => wf('Scan ' + String(i).padStart(2, '0'))), wf('Smoke check'), wf('pages build and deployment')];
  assert.equal(world([repo('a', { workflows: flows })]).islands[0].rings, 3);
  assert.equal(world([repo('a', { workflows: flows })], { localAgents: [], skipWorkflows: ['Smoke check', 'pages build and deployment'] }).islands[0].rings, 2);
});

test('workflow status comes from its latest run', () => {
  const w = world([repo('a', { workflows: [
    wf('running', { status: 'in_progress', concl: null }), wf('failing', { concl: 'failure' }),
    wf('fine'), wf('skipped', { concl: 'cancelled' })] })]);
  const st = Object.fromEntries(w.agents.map(x => [x.name, x.status]));
  assert.deepEqual(st, { failing: 'fail', fine: 'ok', running: 'running', skipped: 'idle' });
});

test('Claude, bots and the owner appear only where their commits are', () => {
  const none = world([repo('a')]);
  assert.deepEqual(agentsIn(none, 'a'), []);
  const mixed = world([repo('a', { commits: [commit('claude', 30), commit('bot', 30), commit('you', 30)] })]);
  assert.deepEqual(agentsIn(mixed, 'a').map(x => [x.name, x.kind]),
    [['Claude · builder', 'builder'], ['Auto-commit bot', 'builder'], ['You', 'human']]);
  const youOnly = world([repo('a', { commits: [commit('you', 30)] })]);
  assert.deepEqual(agentsIn(youOnly, 'a').map(x => x.name), ['You']);
});

test('a builder or human who committed in the last 30 minutes is running, otherwise ok', () => {
  const w = world([repo('a', { commits: [commit('claude', 0.2), commit('you', 5)] })]);
  const st = Object.fromEntries(w.agents.map(x => [x.name, x.status]));
  assert.deepEqual(st, { 'Claude · builder': 'running', You: 'ok' });
});

test('local agents live in their repo, in the lobby when they have none, and are dropped when their repo is absent', () => {
  const config = { localAgents: [
    { name: 'Scraper', repo: 'a', schedule: 'Weekdays', role: 'scrapes', status: 'scheduled' },
    { name: 'Watcher', repo: null, schedule: 'Daily', role: 'watches', status: 'scheduled' },
    { name: 'Ghost', repo: 'not-in-data', schedule: 'x', role: 'x', status: 'scheduled' }] };
  const w = world([repo('a')], config);
  assert.deepEqual(agentsIn(w, 'a').map(x => [x.name, x.kind, x.status]), [['Scraper', 'local', 'asleep']]);
  assert.deepEqual(agentsIn(w, 'Lobby').map(x => x.name), ['Watcher']);
  assert.ok(!w.agents.some(x => x.name === 'Ghost'));
  assert.ok(!JSON.stringify(w).includes('not-in-data'));
});

test('there is no lobby when nobody lives in it', () => {
  assert.ok(!world([repo('a')]).islands.some(r => r.name === 'Lobby'));
});

test('live islands share one size, big enough for the busiest repo', () => {
  const many = [...Array(13)].map((_, i) => wf('wf' + String(i).padStart(2, '0')));
  const w = world([repo('big', { workflows: many }), repo('small', { workflows: [wf('one')] })]);
  const [big, small] = ['big', 'small'].map(n => w.islands.find(x => x.name === n));
  assert.equal(big.radius, small.radius);
  assert.equal(big.rings, small.rings);
  const alone = world([repo('small', { workflows: [wf('one')] })]).islands[0];
  assert.ok(big.radius > alone.radius, 'the shared size grows with the busiest repo');
});

test('every agent stands on its own tile inside its own island, away from the headquarters tile', () => {
  const w = world([repo('a', { workflows: [...Array(12)].map((_, i) => wf('w' + i)), commits: [commit('you', 3), commit('claude', 3)] })]);
  const island = w.islands.find(x => x.name === 'a');
  const seen = new Set();
  for (const a of w.agents) {
    const d = dist(a.pos, centre(island));
    assert.ok(d >= 1.5 && d <= island.radius - 1, `${a.id} sits inside the island (distance ${d.toFixed(2)})`);
    const key = `${a.pos.x.toFixed(3)},${a.pos.z.toFixed(3)}`;
    assert.ok(!seen.has(key), `${a.id} shares a tile`);
    seen.add(key);
  }
});

// Islands are hexagons packed like a honeycomb: two of them are clear of each other when their centres are
// at least the sum of their inner radii (centre to edge) apart.
const inner = i => (Math.sqrt(3) / 2) * i.radius;
const clear = (p, q) => dist(p, q) >= inner(p) + inner(q) - 1e-6;

test('islands pack around the hub like a honeycomb without overlapping, inside the world radius', () => {
  const repos = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n, i) => repo(n, { workflows: [...Array(i * 2 + 1)].map((_, j) => wf('w' + j)) }));
  const w = world(repos);
  assert.deepEqual([w.hub.x, w.hub.z], [0, 0]);
  const cells = [{ name: 'hub', ...w.hub }, ...w.islands];
  cells.forEach((p, i) => {
    assert.ok(Math.hypot(p.x, p.z) + p.radius <= w.bounds.radius + 1e-6, `${p.name} is inside the world`);
    cells.slice(i + 1).forEach(q => assert.ok(clear(p, q), `${p.name} overlaps ${q.name}`));
  });
  const nearest = Math.min(...w.islands.map(i => Math.hypot(i.x, i.z)));
  assert.ok(nearest < Math.sqrt(3) * w.hub.radius + 1.5, 'the first islands touch the hub cell, with only a small gap');
});

test('closed islands are smaller, take cells after the live ones and overlap nothing', () => {
  const live = ['a', 'b', 'c'].map(n => repo(n, { workflows: [wf('w1'), wf('w2'), wf('w3')] }));
  const old = ['x', 'y', 'z', 'q'].map(n => repo(n, { pushed: iso(24 * 90) }));
  const w = world([...live, ...old], undefined, { showDormant: true });
  assert.deepEqual(w.islands.map(i => i.dormant), [false, false, false, true, true, true, true]);
  assert.ok(w.islands.filter(i => i.dormant).every(i => i.radius < w.islands[0].radius));
  const cells = [{ name: 'hub', ...w.hub }, ...w.islands];
  cells.forEach((p, i) => cells.slice(i + 1).forEach(q => assert.ok(clear(p, q), `${p.name} overlaps ${q.name}`)));
});

test('an island is a hexagonal patch of tiles, all distinct and all inside its radius', () => {
  for (const rings of [1, 2, 3, 4]) {
    const tiles = tileOffsets(rings), radius = TILE * Math.sqrt(3) * rings + 1.5 + PUSH;
    assert.equal(tiles.length, 1 + 3 * rings * (rings + 1));
    assert.deepEqual([tiles[0].x, tiles[0].z], [0, 0], 'the first tile is the headquarters in the middle');
    assert.equal(new Set(tiles.map(t => `${t.x.toFixed(3)},${t.z.toFixed(3)}`)).size, tiles.length);
    assert.ok(tiles.every(t => Math.hypot(t.x, t.z) + 1 <= radius + 1e-9));
  }
  const w = world([repo('a', { workflows: [wf('x'), wf('y'), wf('z')] })]);
  const tiles = tileOffsets(w.islands[0].rings), island = w.islands[0];
  assert.ok(w.agents.every(a => tiles.some(t => Math.abs(island.x + t.x - a.pos.x) < 0.002 && Math.abs(island.z + t.z - a.pos.z) < 0.002)), 'agents stand on real tiles');
});

test('an island shows its health: failing beats running beats healthy', () => {
  const health = ws => world([repo('a', { workflows: ws })]).islands[0].health;
  assert.equal(health([wf('ok'), wf('bad', { concl: 'failure' }), wf('go', { status: 'in_progress', concl: null })]), 'fail');
  assert.equal(health([wf('ok'), wf('go', { status: 'in_progress', concl: null })]), 'running');
  assert.equal(health([wf('ok')]), 'ok');
  assert.equal(health([]), 'idle');
});

test('events are the last 24 hours, oldest first, and belong to existing agents', () => {
  const w = world([repo('a', {
    commits: [commit('claude', 1, 'fresh work'), commit('you', 30, 'too old')],
    workflows: [wf('Deploy', { runs: [run({ date: iso(3) }), run({ date: iso(26) }), run({ date: iso(10), concl: 'failure' })] })] })]);
  assert.deepEqual(w.events.map(e => e.time), [iso(10), iso(3), iso(1)]);
  assert.deepEqual(w.events.map(e => e.kind), ['run', 'run', 'commit']);
  assert.equal(w.events[0].result, 'fail');
  assert.equal(w.events[0].text, 'Deploy: failed', 'the bubble names the workflow');
  assert.equal(w.events[0].detail, 'failed', 'the feed already shows the name, so it shows only the result');
  assert.equal(w.events[2].text, 'fresh work');
  assert.equal(w.events[2].detail, 'fresh work');
  assert.equal(w.events[2].island, 'a');
  const ids = new Set(w.agents.map(x => x.id));
  assert.ok(w.events.every(e => ids.has(e.agentId)));
});

test('a workflow without run history still contributes its latest run as an event', () => {
  const w = world([repo('a', { workflows: [{ name: 'CI', ...run({ date: iso(2) }) }] })]);
  assert.equal(w.events.length, 1);
  assert.equal(w.events[0].agentId, 'a::CI');
});

test('the same input always gives the same world', () => {
  const repos = [repo('a', { workflows: [wf('x'), wf('y')], commits: [commit('claude', 2)] }), repo('b')];
  assert.equal(JSON.stringify(world(repos)), JSON.stringify(world(repos)));
});

test('agent details carry what the card needs', () => {
  const w = world([repo('a', { workflows: [wf('Deploy', { runs: [run({ date: iso(1) }), run({ date: iso(5), concl: 'failure' })] })],
    commits: [commit('you', 4, 'tidy up')] })]);
  const d = w.agents.find(x => x.id === 'a::Deploy').details;
  assert.equal(d.latest.result, 'succeeded');
  assert.deepEqual(d.recent.map(x => x.result), ['succeeded', 'failed']);
  assert.equal(d.recent[0].url, 'run-url');
  const you = w.agents.find(x => x.name === 'You').details;
  assert.equal(you.recent[0].text, 'tidy up');
});

test('a status override redraws that agent and its island, and leaves the others alone', () => {
  const repos = [repo('a', { workflows: [wf('Smoke'), wf('Deploy')] })];
  const w = world(repos, undefined, { statusOverrides: { 'a::Smoke': 'running' } });
  assert.deepEqual(agentsIn(w, 'a').map(x => [x.name, x.status]), [['Deploy', 'ok'], ['Smoke', 'running']]);
  assert.equal(w.islands[0].health, 'running');
  assert.equal(world(repos).islands[0].health, 'ok', 'without the override nothing changes');
});
