import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pose, replayClock, due } from '../src/anim.mjs';

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

test('a healthy agent mostly stands still and sometimes wanders a short way and back', () => {
  const ps = times.map(t => pose(agent('ok'), t));
  assert.ok(ps.every(p => Math.abs(p.dx) <= 16 && p.dy === 0));
  assert.ok(ps.filter(p => p.dx === 0).length > ps.length / 2, 'mostly still');
  assert.ok(ps.some(p => Math.abs(p.dx) > 6), 'but it does wander');
  assert.ok(ps.every(p => !p.typing && !p.asleep && !p.alarm));
});

test('agents do not wander in lockstep', () => {
  const a = times.map(t => pose(agent('ok', 'r::a'), t).dx).join();
  const b = times.map(t => pose(agent('ok', 'r::b'), t).dx).join();
  assert.notEqual(a, b);
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
