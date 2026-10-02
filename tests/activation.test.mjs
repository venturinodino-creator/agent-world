import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  offerFor, newRequest, requestPhase, overridesFrom, reconcile, restore, serialize, describeError,
  STARTABLE_REPOS, REQUEST_TTL_MS, COWORK_URL,
} from '../src/activation.mjs';

const flow = (status, extra = {}) => ({ id: 'netherlands-crm::Daily Tender Scan', name: 'Daily Tender Scan', kind: 'workflow', status, repo: 'netherlands-crm',
  details: { latest: { date: '2026-10-02T10:00:00Z' } }, ...extra });
const asleep = (extra = {}) => ({ id: 'netherlands-crm::NL Tender Scraper', name: 'NL Tender Scraper', kind: 'local', status: 'asleep', repo: 'netherlands-crm', details: { schedule: 'Weekdays · Cowork', ...extra } });
const NOW = Date.parse('2026-10-03T12:00:00Z');

test('a viewer who is not the Admin is offered nothing, for any agent', () => {
  for (const a of [flow('ok'), flow('fail'), flow('idle'), asleep()]) assert.equal(offerFor(a, { admin: false }), null);
});

test('the Admin can run a waiting workflow now and re-run a failing one', () => {
  const ok = offerFor(flow('ok'), { admin: true }), fail = offerFor(flow('fail'), { admin: true });
  assert.deepEqual([ok.kind, ok.label], ['activate', 'Run now']);
  assert.deepEqual([fail.kind, fail.label], ['activate', 'Run again']);
  assert.match(ok.confirm, /Start Daily Tender Scan now\?/);
});

test('an idle workflow can be run too', () => assert.equal(offerFor(flow('idle'), { admin: true }).kind, 'activate'));

test('a working agent has nothing to activate', () => assert.equal(offerFor(flow('running'), { admin: true }), null));

test('an asleep Cowork agent is offered a link to where it is started, https only', () => {
  assert.deepEqual(offerFor(asleep(), { admin: true }), { kind: 'cowork', label: 'Open in Cowork', url: COWORK_URL });
  assert.equal(offerFor(asleep({ startUrl: 'https://example.com/task/1' }), { admin: true }).url, 'https://example.com/task/1');
  assert.equal(offerFor(asleep({ startUrl: 'javascript:alert(1)' }), { admin: true }).url, COWORK_URL);
});

test('people and builders, the Pages deploys and repos with nothing startable get no button', () => {
  for (const kind of ['human', 'builder']) assert.equal(offerFor({ id: 'x', name: 'You', kind, status: 'ok', repo: 'netherlands-crm' }, { admin: true }), null);
  assert.equal(offerFor(flow('ok', { name: 'pages build and deployment' }), { admin: true }), null);
  assert.equal(offerFor(flow('ok', { repo: 'ai-job-finder' }), { admin: true }), null);
  assert.equal(offerFor(flow('ok', { repo: 'agent-world' }), { admin: true }), null);
  assert.deepEqual(STARTABLE_REPOS.slice().sort(), ['african-earth-energy-crm', 'belgium-crm', 'denmark-crm', 'netherlands-crm']);
});

test('while a request is pending the button is replaced by its progress', () => {
  const req = newRequest(flow('ok'), NOW);
  const o = offerFor(flow('running'), { admin: true, request: req, phase: 'requested' });
  assert.deepEqual([o.kind, o.label], ['pending', 'Run requested']);
  assert.equal(offerFor(flow('running'), { admin: true, request: req, phase: 'working' }).label, 'Running…');
});

const run = (over = {}) => ({ status: 'in_progress', conclusion: null, createdAt: '2026-10-03T12:00:05Z', url: 'https://github.com/o/r/actions/runs/1', ...over });

test('a request is requested until a run created after it shows up, then working', () => {
  const req = newRequest(flow('ok'), NOW);
  assert.equal(requestPhase(req, null, NOW + 5000).phase, 'requested');
  assert.equal(requestPhase(req, undefined, NOW + 5000).phase, 'requested');
  const old = run({ createdAt: '2026-10-03T11:00:00Z', status: 'completed', conclusion: 'success' });
  assert.equal(requestPhase(req, old, NOW + 5000).phase, 'requested', 'an older run is not ours');
  const p = requestPhase(req, run(), NOW + 8000);
  assert.deepEqual([p.phase, p.runUrl], ['working', 'https://github.com/o/r/actions/runs/1']);
});

test('a run created a few seconds before the click still counts, to allow for clock skew', () => {
  const req = newRequest(flow('ok'), NOW);
  assert.equal(requestPhase(req, run({ createdAt: new Date(NOW - 10000).toISOString() }), NOW + 1000).phase, 'working');
});

test('a finished run settles the request to ok or fail', () => {
  const req = newRequest(flow('fail'), NOW);
  assert.equal(requestPhase(req, run({ status: 'completed', conclusion: 'success' }), NOW + 60000).phase, 'ok');
  for (const c of ['failure', 'cancelled', 'timed_out']) assert.equal(requestPhase(req, run({ status: 'completed', conclusion: c }), NOW + 60000).phase, 'fail');
});

test('a run that never shows up times out, but one that is seen is followed for as long as it runs', () => {
  const req = newRequest(flow('ok'), NOW);
  assert.equal(requestPhase(req, null, NOW + REQUEST_TTL_MS - 1).phase, 'requested');
  assert.equal(requestPhase(req, undefined, NOW + REQUEST_TTL_MS + 1).phase, 'timeout');
  assert.equal(requestPhase(req, run(), NOW + REQUEST_TTL_MS * 3).phase, 'working');
});

test('only requested and working requests make an agent show as running', () => {
  const a = newRequest(flow('ok'), NOW), b = newRequest({ ...flow('fail'), id: 'netherlands-crm::B', name: 'B' }, NOW);
  const o = overridesFrom([[a, { phase: 'working' }], [b, { phase: 'ok' }]]);
  assert.deepEqual(o, { [a.agentId]: "running", [b.agentId]: "ok" });
  assert.deepEqual(overridesFrom([[a, { phase: 'requested' }]]), { [a.agentId]: "running" });
  assert.deepEqual(overridesFrom([[a, { phase: 'timeout' }]]), {}, 'a timeout shows the real status again');
});

test('a request is dropped once the hourly data shows a run from after it, or after two hours', () => {
  const req = newRequest(flow('ok'), NOW);
  const fresh = [flow('ok', { details: { latest: { date: new Date(NOW + 60000).toISOString() } } })];
  const stale = [flow('ok')];
  assert.deepEqual(reconcile([req], fresh, NOW + 120000), []);
  assert.deepEqual(reconcile([req], stale, NOW + 120000), [req]);
  assert.deepEqual(reconcile([req], stale, NOW + 3 * 3600e3), [], 'old requests expire');
});

test('requests survive a reload, and junk or expired entries are ignored', () => {
  const req = { ...newRequest(flow('ok'), NOW), workflowId: 7 };
  assert.deepEqual(restore(serialize([req]), NOW + 1000), [req]);
  assert.deepEqual(restore('not json', NOW), []);
  assert.deepEqual(restore(JSON.stringify([{ agentId: 1 }, null, 'x']), NOW), []);
  assert.deepEqual(restore(serialize([req]), NOW + 3 * 3600e3), []);
});

test('every server answer has a plain-language message', () => {
  for (const code of ['not_signed_in', 'not_owner', 'repo_not_allowed', 'repo_hidden', 'workflow_not_found', 'workflow_ambiguous', 'not_startable', 'cooldown', 'token_rejected', 'not_configured', 'network', 'unknown']) {
    assert.ok(describeError(code).length > 10, code);
  }
  assert.match(describeError('cooldown', 90), /2 minutes|1 minute|90|minute/i);
  assert.equal(describeError('something-new'), describeError('unknown'));
});
