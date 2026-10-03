import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overview } from '../src/overview.mjs';

const agent = (island, name, status, date = null) => ({ id: `${island}::${name}`, name, island, status, kind: 'workflow', details: date ? { latest: { date } } : {} });
const isl = (name, health = 'ok', dormant = false) => ({ name, health, dormant });
const world = (islands, agents) => ({ islands, agents });

test('every agent is counted once: running is working, fail is failing, anything else is asleep', () => {
  const w = world([isl('a'), isl('b')], [
    agent('a', '1', 'running'), agent('a', '2', 'ok'), agent('a', '3', 'idle'), agent('b', '4', 'asleep'), agent('b', '5', 'fail')]);
  const o = overview(w);
  assert.deepEqual(o.totals, { working: 1, asleep: 3, failing: 1 });
  assert.equal(o.totals.working + o.totals.asleep + o.totals.failing, w.agents.length);
  const a = o.repos.find(r => r.name === 'a'), b = o.repos.find(r => r.name === 'b');
  assert.deepEqual([a.working, a.asleep, a.failing, a.total], [1, 2, 0, 3]);
  assert.deepEqual([b.working, b.asleep, b.failing, b.total], [0, 1, 1, 2]);
});

test('the verdict says attention when anything fails, busy when something works, calm otherwise', () => {
  assert.equal(overview(world([isl('a')], [agent('a', '1', 'fail'), agent('a', '2', 'running')])).verdict, 'attention');
  assert.equal(overview(world([isl('a')], [agent('a', '1', 'running'), agent('a', '2', 'ok')])).verdict, 'busy');
  assert.equal(overview(world([isl('a')], [agent('a', '1', 'ok'), agent('a', '2', 'asleep')])).verdict, 'calm');
  assert.equal(overview(world([], [])).verdict, 'calm');
});

test('the failing agents are listed for attention, by repo and name, with when they last ran', () => {
  const o = overview(world([isl('b'), isl('a')], [
    agent('b', 'Zed', 'fail', '2026-10-02T10:00:00Z'), agent('a', 'Scan', 'fail'), agent('a', 'Alpha', 'fail', '2026-10-01T09:00:00Z'), agent('a', 'Fine', 'ok')]));
  assert.deepEqual(o.attention.map(x => x.id), ['a::Alpha', 'a::Scan', 'b::Zed']);
  assert.deepEqual(o.attention.map(x => x.date), ['2026-10-01T09:00:00Z', null, '2026-10-02T10:00:00Z']);
  assert.deepEqual(overview(world([isl('a')], [agent('a', 'Fine', 'ok')])).attention, []);
});

test('repos come failing first, then working, then calm by name, and closed ones last', () => {
  const o = overview(world([isl('calm-b'), isl('old', 'dormant', true), isl('busy'), isl('calm-a'), isl('broken')], [
    agent('calm-b', '1', 'ok'), agent('busy', '1', 'running'), agent('calm-a', '1', 'ok'), agent('broken', '1', 'fail'), agent('broken', '2', 'running')]));
  assert.deepEqual(o.repos.map(r => r.name), ['broken', 'busy', 'calm-a', 'calm-b', 'old']);
  assert.equal(o.repos[4].dormant, true);
  assert.equal(o.repos[4].total, 0);
});

test('a repo with more failing agents comes before one with fewer, and the same input gives the same overview', () => {
  const w = world([isl('x'), isl('y')], [agent('x', '1', 'fail'), agent('y', '1', 'fail'), agent('y', '2', 'fail')]);
  assert.deepEqual(overview(w).repos.map(r => r.name), ['y', 'x']);
  assert.deepEqual(overview(w), overview(w));
});
