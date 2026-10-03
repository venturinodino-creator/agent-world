import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pose, replayClock, due, errand, ERRAND_SECONDS } from '../src/anim.mjs';

const agent = (status, id = 'repo::agent') => ({ id, status, kind: 'workflow' });
const times = Array.from({ length: 400 }, (_, i) => i * 0.25);

test('a running agent stays at its desk and types', () => {
  for (const t of times) {
    const p = pose(agent('running'), t);
    assert.deepEqual([p.dx, p.dy, p.typing], [0, 0, true]);
  }
  assert.notEqual(pose(agent('running'), 0).frame, pose(agent('running'), 0.2).frame, 'typing animates');
});

test('an asleep agent never moves and shows it is asleep', () => {
  for (const t of times) {
    const p = pose(agent('asleep'), t);
    assert.deepEqual([p.dx, p.dy, p.asleep, p.typing], [0, 0, true, false]);
  }
});

test('a failing agent paces and flashes its alarm', () => {
  const ps = times.map(t => pose(agent('fail'), t));
  assert.ok(ps.every(p => p.alarm !== undefined && Math.abs(p.dx) <= 14));
  assert.ok(Math.max(...ps.map(p => p.dx)) > 8 && Math.min(...ps.map(p => p.dx)) < -8, 'it paces both ways');
  assert.ok(ps.some(p => p.alarm) && ps.some(p => !p.alarm), 'the alarm flashes');
});

test('an agent that is not working, healthy between runs or idle, is seen asleep and never wanders off', () => {
  for (const status of ['ok', 'idle']) {
    for (const t of times) {
      const p = pose(agent(status), t);
      assert.deepEqual([p.dx, p.dy, p.asleep, p.typing, p.alarm, p.walking], [0, 0, true, false, false, false], status);
    }
  }
});

test('the same agent and time always give the same pose', () => {
  assert.deepEqual(pose(agent('ok'), 12.5), pose(agent('ok'), 12.5));
  assert.deepEqual(pose(agent('fail'), 3.1), pose(agent('fail'), 3.1));
});

test('the replay clock sweeps the last 24 hours and then loops', () => {
  const now = Date.parse('2026-10-02T12:00:00Z'), loop = 240e3, DAY = 864e5;
  assert.equal(replayClock(0, now, loop), now - DAY);
  assert.equal(replayClock(loop / 2, now, loop), now - DAY / 2);
  assert.equal(replayClock(loop, now, loop), now - DAY, 'wraps back to the start');
  assert.equal(replayClock(loop * 3 + loop / 4, now, loop), now - DAY * 0.75);
});

test('due() returns the events the clock has just passed, once each, in order', () => {
  const ev = [{ time: '2026-10-02T01:00:00Z' }, { time: '2026-10-02T02:00:00Z' }, { time: '2026-10-02T03:00:00Z' }];
  const at = h => Date.parse(`2026-10-02T0${h}:00:00Z`);
  assert.deepEqual(due(ev, at(0), at(2)).map(e => e.time), [ev[0].time, ev[1].time]);
  assert.deepEqual(due(ev, at(2), at(3)).map(e => e.time), [ev[2].time]);
  assert.deepEqual(due(ev, at(3), at(3)), []);
  assert.deepEqual(due(ev, at(2), at(0)), [], 'a backwards step (the loop wrapping) fires nothing');
});

test('an errand walks to the headquarters carrying a crate, drops it off, and walks back empty-handed', () => {
  assert.equal(errand(-0.1), null, 'not started yet');
  assert.deepEqual(errand(0), { u: 0, carrying: true, depositing: false });
  const mid = errand(0.35 * ERRAND_SECONDS);
  assert.ok(mid.u > 0 && mid.u < 1 && mid.carrying);
  const there = errand(0.5 * ERRAND_SECONDS);
  assert.deepEqual([there.u, there.carrying, there.depositing], [1, false, true]);
  const back = errand(0.8 * ERRAND_SECONDS);
  assert.ok(back.u > 0 && back.u < 1 && !back.carrying && !back.depositing);
  assert.equal(errand(ERRAND_SECONDS + 0.01), null, 'finished');
});

test('along an errand the position only goes out and then comes back', () => {
  const us = Array.from({ length: 100 }, (_, i) => errand((i / 100) * ERRAND_SECONDS)?.u);
  assert.ok(us.every(u => u >= 0 && u <= 1));
  const peak = us.indexOf(Math.max(...us));
  assert.ok(us.slice(0, peak + 1).every((u, i, a) => i === 0 || u >= a[i - 1]), 'rising on the way out');
  assert.ok(us.slice(peak).every((u, i, a) => i === 0 || u <= a[i - 1]), 'falling on the way back');
});
