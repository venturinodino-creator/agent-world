// The runs the Admin has asked for, from the click until GitHub says they are done. The decisions (what phase a request
// is in, when it is dropped) are the pure functions in activation.mjs; this file keeps the list, remembers it across a
// page reload, and asks the server every ten seconds how each unfinished run is going. Browser only.
import { startRun, latestRun, isAdmin } from './admin.mjs';
import { newRequest, requestPhase, overridesFrom, reconcile, restore, serialize, describeError } from './activation.mjs';

const STORE = 'world.requests', POLL_MS = 10e3;
const settled = p => p === 'ok' || p === 'fail' || p === 'timeout';

export function createRequests({ onChange }) {
  let requests = [], timer = null;
  const phases = new Map();   // agent id -> { phase, runUrl }
  try { requests = restore(localStorage.getItem(STORE) || '[]'); } catch { /* storage blocked: nothing to restore */ }
  const persist = () => { try { localStorage.setItem(STORE, serialize(requests)); } catch { /* storage blocked: it just will not survive a reload */ } };
  const phaseOf = r => phases.get(r.agentId) || { phase: 'requested', runUrl: null };
  const active = () => requests.filter(r => !settled(phaseOf(r).phase));

  async function poll() {
    let changed = false;
    for (const r of active()) {
      const observed = r.workflowId ? await latestRun(r.repo, r.workflowId) : undefined;   // undefined: could not ask, keep waiting
      const next = requestPhase(r, observed, Date.now()), prev = phaseOf(r);
      if (next.phase !== prev.phase || next.runUrl !== prev.runUrl) { phases.set(r.agentId, next); changed = true; }
    }
    if (!active().length && timer) { clearInterval(timer); timer = null; }
    if (changed) onChange();
  }
  const ensurePolling = () => { if (!timer && active().length) { timer = setInterval(poll, POLL_MS); poll(); } };
  if (isAdmin()) ensurePolling();

  return {
    // agent id -> the status to draw it with; nothing at all unless the Admin is signed in
    overrides: () => (isAdmin() ? overridesFrom(requests.map(r => [r, phaseOf(r)])) : {}),
    // forget requests the hourly data has caught up with
    reconcileWith(agents) { const kept = reconcile(requests, agents); if (kept.length !== requests.length) { requests = kept; persist(); } },
    requestFor: id => (isAdmin() ? requests.find(r => r.agentId === id) || null : null),
    phaseOf,
    // Asks the server to start the agent's workflow. Resolves { ok: true } or { ok: false, message }.
    async start(agent) {
      const res = await startRun(agent.repo, agent.name);
      if (!res.ok) return { ok: false, message: describeError(res.code, res.retryAfter) };
      requests = requests.filter(r => r.agentId !== agent.id);
      requests.push({ ...newRequest(agent), workflowId: res.workflowId });
      phases.set(agent.id, { phase: 'requested', runUrl: null });
      persist(); ensurePolling(); onChange();
      return { ok: true };
    },
    resume() { if (isAdmin()) ensurePolling(); },
  };
}
