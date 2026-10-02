import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld } from '../src/world.mjs';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const iso = hoursAgo => new Date(NOW - hoursAgo * 3600e3).toISOString();

const repo = (name, over = {}) => ({ name, full: 'me/' + name, desc: '', url: 'https://github.com/me/' + name, home: '',
  lang: 'JS', pushed: iso(1), priv: false, issues: 0, prs: '—', commits: [], workflows: [], ...over });
const run = (over = {}) => ({ status: 'completed', concl: 'success', date: iso(2), url: 'run-url', event: 'schedule', ...over });
const wf = (name, over = {}) => ({ name, ...run(), runs: [run()], ...over });
const commit = (who, hoursAgo, msg = 'a change') => ({ sha: 'abc1234', msg, date: iso(hoursAgo), author: 'x', url: 'commit-url', who, ai: who !== 'you' });
const world = (repos, config = { localAgents: [] }, opts) => buildWorld({ repos }, config, NOW, opts);
const agentsIn = (w, name) => w.agents.filter(a => a.room === name);

test('one room per active repo, in a stable order', () => {
  const w = world([repo('beta'), repo('alpha')]);
  assert.deepEqual(w.rooms.map(r => r.name), ['alpha', 'beta']);
});

test('dormant repos are left out unless asked for, then appear as closed rooms with no agents', () => {
  const repos = [repo('live'), repo('old', { pushed: iso(24 * 90), workflows: [wf('ci')] })];
  assert.deepEqual(world(repos).rooms.map(r => r.name), ['live']);
  const shown = world(repos, undefined, { showDormant: true });
  const old = shown.rooms.find(r => r.name === 'old');
  assert.equal(old.dormant, true);
  assert.deepEqual(agentsIn(shown, 'old'), []);
});

test('every workflow is an agent', () => {
  const w = world([repo('a', { workflows: [wf('Smoke'), wf('Deploy')] })]);
  assert.deepEqual(agentsIn(w, 'a').map(x => [x.id, x.kind]), [['a::Deploy', 'workflow'], ['a::Smoke', 'workflow']]);
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
  assert.ok(!world([repo('a')]).rooms.some(r => r.name === 'Lobby'));
});

test('rooms grow with the number of agents', () => {
  const many = [...Array(13)].map((_, i) => wf('wf' + String(i).padStart(2, '0')));
  const w = world([repo('big', { workflows: many }), repo('small', { workflows: [wf('one')] })]);
  const area = n => { const r = w.rooms.find(x => x.name === n); return r.w * r.h; };
  assert.ok(area('big') > area('small') * 3);
});

test('every agent has a desk inside its own room', () => {
  const w = world([repo('a', { workflows: [wf('x'), wf('y'), wf('z')], commits: [commit('you', 3)] })]);
  for (const a of w.agents) {
    const r = w.rooms.find(x => x.name === a.room);
    assert.ok(a.desk.x > r.x && a.desk.x < r.x + r.w && a.desk.y > r.y && a.desk.y < r.y + r.h, a.id);
  }
});

test('rooms and the hub never overlap and all sit inside the world bounds', () => {
  const repos = ['a', 'b', 'c', 'd', 'e'].map((n, i) => repo(n, { workflows: [...Array(i * 3 + 1)].map((_, j) => wf('w' + j)) }));
  const w = world(repos);
  const boxes = [...w.rooms, { name: 'hub', ...w.hub }];
  for (let i = 0; i < boxes.length; i++) {
    const p = boxes[i];
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= w.bounds.w && p.y + p.h <= w.bounds.h, p.name + ' inside bounds');
    for (let j = i + 1; j < boxes.length; j++) {
      const q = boxes[j];
      const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
      assert.ok(apart, `${p.name} overlaps ${q.name}`);
    }
  }
});

test('closed rooms sit outside the live rooms and nothing overlaps', () => {
  const live = ['a', 'b', 'c'].map(n => repo(n, { workflows: [wf('w1'), wf('w2'), wf('w3')] }));
  const old = ['x', 'y', 'z', 'q'].map(n => repo(n, { pushed: iso(24 * 90) }));
  const w = world([...live, ...old], undefined, { showDormant: true });
  const far = r => Math.hypot(r.x + r.w / 2 - w.bounds.w / 2, r.y + r.h / 2 - w.bounds.h / 2);
  const nearestClosed = Math.min(...w.rooms.filter(r => r.dormant).map(far));
  const farthestLive = Math.max(...w.rooms.filter(r => !r.dormant).map(far));
  assert.ok(nearestClosed > farthestLive, 'closed rooms are further out than live ones');
  const boxes = [...w.rooms, { name: 'hub', ...w.hub }];
  boxes.forEach((p, i) => boxes.slice(i + 1).forEach(q => assert.ok(
    p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${p.name} overlaps ${q.name}`)));
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

test('agent details carry what the panel needs', () => {
  const w = world([repo('a', { workflows: [wf('Deploy', { runs: [run({ date: iso(1) }), run({ date: iso(5), concl: 'failure' })] })],
    commits: [commit('you', 4, 'tidy up')] })]);
  const d = w.agents.find(x => x.id === 'a::Deploy').details;
  assert.equal(d.latest.result, 'succeeded');
  assert.deepEqual(d.recent.map(x => x.result), ['succeeded', 'failed']);
  assert.equal(d.recent[0].url, 'run-url');
  const you = w.agents.find(x => x.name === 'You').details;
  assert.equal(you.recent[0].text, 'tidy up');
});
