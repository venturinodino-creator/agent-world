import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteStatus, probeSite, probeAll, siteLatest, siteSignature } from '../src/sites.mjs';

const clock = (...ticks) => { let i = 0; return () => ticks[Math.min(i++, ticks.length - 1)]; };

test('a site is working while it answers, failing when it does not and asleep until it has been checked', () => {
  assert.equal(siteStatus({ ok: true }), 'running');
  assert.equal(siteStatus({ ok: false }), 'fail');
  assert.equal(siteStatus(null), 'idle');
  assert.equal(siteStatus(undefined), 'idle');
});

test('probing asks for the page without reading it, never from the cache, and times the answer', async () => {
  const calls = [];
  const fetchFn = async (url, opts) => { calls.push([url, opts]); return {}; };
  const r = await probeSite('https://x.dev/dk/', { fetchFn, now: clock(1000, 1180) });
  assert.deepEqual(r, { ok: true, ms: 180, at: new Date(1000).toISOString() });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://x.dev/dk/');
  assert.equal(calls[0][1].mode, 'no-cors');
  assert.equal(calls[0][1].cache, 'no-store');
});

test('a site that cannot be reached is down, with how long the page waited', async () => {
  const r = await probeSite('https://x.dev/', { fetchFn: async () => { throw new TypeError('Failed to fetch'); }, now: clock(5000, 5040) });
  assert.deepEqual([r.ok, r.ms], [false, 40]);
});

test('a site that never answers is down once the time is up', async () => {
  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const r = await probeSite('https://x.dev/', { fetchFn: hang, timeoutMs: 20 });
  assert.equal(r.ok, false);
});

test('every site is probed at once and the answers are keyed by address', async () => {
  const fetchFn = async url => { if (url.endsWith('/be/')) throw new Error('down'); return {}; };
  const sites = [{ name: 'NL', url: 'https://x.dev/' }, { name: 'BE', url: 'https://x.dev/be/' }];
  const all = await probeAll(sites, { fetchFn });
  assert.deepEqual(Object.keys(all).sort(), ['https://x.dev/', 'https://x.dev/be/']);
  assert.deepEqual([all['https://x.dev/'].ok, all['https://x.dev/be/'].ok], [true, false]);
  assert.deepEqual(await probeAll([], { fetchFn }), {});
});

test('what a card shows of a check: when, how fast and in words; nothing before the first check', () => {
  assert.equal(siteLatest(null), null);
  assert.deepEqual(siteLatest({ ok: true, ms: 120, at: '2026-10-10T10:00:00.000Z' }), { date: '2026-10-10T10:00:00.000Z', ms: 120, result: 'answers' });
  assert.equal(siteLatest({ ok: false, ms: 8000, at: '2026-10-10T10:00:00.000Z' }).result, 'no answer');
});

test('the world is only redrawn when a site goes up or down, not when its answer time moves', () => {
  const a = { 'https://x.dev/': { ok: true, ms: 100, at: 'a' }, 'https://x.dev/be/': { ok: true, ms: 90, at: 'a' } };
  const b = { 'https://x.dev/': { ok: true, ms: 640, at: 'b' }, 'https://x.dev/be/': { ok: true, ms: 70, at: 'b' } };
  const c = { ...b, 'https://x.dev/be/': { ok: false, ms: 8000, at: 'c' } };
  assert.equal(siteSignature(a), siteSignature(b));
  assert.notEqual(siteSignature(b), siteSignature(c));
  assert.equal(siteSignature({}), siteSignature(null));
});
