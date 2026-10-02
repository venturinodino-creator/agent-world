import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.mjs';

const payload = (generatedAt, repos = [{ name: 'a' }]) => ({ generatedAt, user: 'me', repos });
const fakeFetch = routes => async url => {
  const hit = Object.entries(routes).find(([k]) => url.startsWith(k));
  if (!hit || hit[1] instanceof Error) throw new Error('network');
  if (hit[1] === 404) return { ok: false, json: async () => ({}) };
  return { ok: true, json: async () => hit[1] };
};
const A = 'https://pages.example/data.json', B = 'https://raw.example/data.json';

test('uses the newer of the two sources', async () => {
  const d = await loadData([A, B], fakeFetch({ [A]: payload('2026-10-02T10:00:00Z'), [B]: payload('2026-10-02T12:00:00Z') }));
  assert.equal(d.generatedAt, '2026-10-02T12:00:00Z');
});

test('falls back to the other source when one fails', async () => {
  assert.equal((await loadData([A, B], fakeFetch({ [A]: new Error('x'), [B]: payload('2026-10-02T12:00:00Z') }))).generatedAt, '2026-10-02T12:00:00Z');
  assert.equal((await loadData([A, B], fakeFetch({ [A]: payload('2026-10-02T09:00:00Z'), [B]: 404 }))).generatedAt, '2026-10-02T09:00:00Z');
});

test('returns null when nothing can be loaded or the data is unusable', async () => {
  assert.equal(await loadData([A, B], fakeFetch({ [A]: new Error('x'), [B]: 404 })), null);
  assert.equal(await loadData([A, B], fakeFetch({ [A]: { repos: 'nope' }, [B]: { generatedAt: 'x' } })), null);
});
