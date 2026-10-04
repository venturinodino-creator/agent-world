// The Work button: what a card offers for an agent that is not working, and the life of a "run requested" from
// the click until the real run finishes. Everyone sees the button; only the signed-in Admin can use it for real. Pure functions of the agent, the clock and what GitHub last reported, so
// all of it can be tested without a browser. The browser side (sign-in, calling the server, asking GitHub) is in admin.mjs.
// Only these repos have workflows that can be started by hand; the server enforces the same list.
export const STARTABLE_REPOS = ['african-earth-energy-crm', 'belgium-crm', 'denmark-crm', 'netherlands-crm'];
export const COWORK_URL = 'https://claude.ai/';
export const REQUEST_TTL_MS = 10 * 60e3;   // how long to wait for a requested run to appear on GitHub
const KEEP_MS = 2 * 3600e3;         // a request is forgotten this long after the click
const SKEW_MS = 30e3;                      // GitHub's clock and ours may differ a little
const NOT_STARTABLE_NAMES = new Set(['pages build and deployment']);

const httpsOr = (url, fallback) => (typeof url === 'string' && /^https:\/\//.test(url) ? url : fallback);

// Why the button is disabled for an agent that cannot be started from here.
function whyNot(agent) {
  if (agent.kind === 'human') return 'This is you: you work when you do.';
  if (agent.kind === 'builder') return agent.name === 'Auto-commit bot' ? 'The bot works by itself when its own schedule runs.' : 'Claude works when you open a session in this repo.';
  return 'This workflow cannot be started by hand from here.';
}

// What the card offers an agent that is not working: null (nothing, it is already working), or
// { kind: 'activate' | 'cowork' | 'pending' | 'signin' | 'manual', label, ... }.
// 'signin' is the Work button for someone who is not signed in (it asks them to sign in), 'manual' a disabled one with a note.
// `request` is the pending request for this agent, `phase` its current phase.
export function offerFor(agent, { admin = false, request = null, phase = null } = {}) {
  if (!agent) return null;
  const startable = agent.kind === 'workflow' && STARTABLE_REPOS.includes(agent.repo) && !NOT_STARTABLE_NAMES.has(String(agent.name).toLowerCase());
  if (admin && startable && request && (phase === 'requested' || phase === 'working')) return { kind: 'pending', label: phase === 'requested' ? 'Run requested' : 'Running…' };
  if (agent.status === 'running') return null;
  if (!startable && agent.kind !== 'local') return { kind: 'manual', label: 'Work', note: whyNot(agent) };
  if (!admin) return { kind: 'signin', label: 'Work', note: 'Sign in as the owner to start it.' };
  if (agent.kind === 'local') return { kind: 'cowork', label: 'Work in Cowork', url: httpsOr(agent.details?.startUrl, COWORK_URL) };
  return { kind: 'activate', label: agent.status === 'fail' ? 'Work again' : 'Work', confirm: `Start ${agent.name} now?` };
}

export const newRequest = (agent, now = Date.now()) => ({ agentId: agent.id, repo: agent.repo, workflow: agent.name, at: now, workflowId: null });

// Where a request stands. `observed` is GitHub's latest run of that workflow ({ status, conclusion, createdAt, url }),
// null if it has none, or undefined if GitHub could not be asked.
export function requestPhase(req, observed, now = Date.now()) {
  const ours = observed && Date.parse(observed.createdAt) >= req.at - SKEW_MS;
  if (ours && observed.status !== 'completed') return { phase: 'working', runUrl: observed.url };
  if (ours) return { phase: observed.conclusion === 'success' ? 'ok' : 'fail', runUrl: observed.url };
  return { phase: now - req.at > REQUEST_TTL_MS ? 'timeout' : 'requested', runUrl: null };
}

// Agent id -> the status to draw it with, from [request, { phase }] pairs. A timeout shows the real status again.
export function overridesFrom(pairs) {
  const out = {};
  for (const [req, { phase }] of pairs) {
    if (phase === 'requested' || phase === 'working') out[req.agentId] = 'running';
    else if (phase === 'ok' || phase === 'fail') out[req.agentId] = phase;
  }
  return out;
}

// Drops requests the hourly data has caught up with (it shows a run from after the click) and those past KEEP_MS.
export function reconcile(requests, agents, now = Date.now()) {
  const byId = new Map(agents.map(a => [a.id, a]));
  return requests.filter(r => {
    if (now - r.at > KEEP_MS) return false;
    const latest = Date.parse(byId.get(r.agentId)?.details?.latest?.date);
    return !(latest >= r.at - SKEW_MS);
  });
}

export const serialize = requests => JSON.stringify(requests);
export function restore(json, now = Date.now()) {
  let list; try { list = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list.filter(r => r && typeof r.agentId === 'string' && typeof r.repo === 'string' && typeof r.workflow === 'string' && Number.isFinite(r.at) && now - r.at <= KEEP_MS);
}

const MESSAGES = {
  not_signed_in: 'You are not signed in, so nothing was started. Sign in again.',
  not_owner: 'This account is not allowed to start agents.',
  repo_not_allowed: 'This repo is not one that can be started from here.',
  repo_hidden: 'This repo is switched off in your admin list, so it cannot be started.',
  workflow_not_found: 'GitHub has no workflow with this name any more.',
  workflow_ambiguous: 'Two workflows in this repo share this name, so it was not started.',
  not_startable: 'This workflow cannot be started by hand.',
  cooldown: 'It was only just started. Try again in a minute or two.',
  token_rejected: 'GitHub refused the stored token. It may have expired: create a new one and update the Supabase secret.',
  not_configured: 'Starting agents is not set up yet: the GitHub token is missing from Supabase.',
  network: 'Could not reach the server. Nothing was started.',
  unknown: 'Something went wrong and nothing was started.',
};
export function describeError(code, retryAfterSeconds) {
  const m = MESSAGES[code] || MESSAGES.unknown;
  return code === 'cooldown' && retryAfterSeconds > 0 ? `${m} (about ${Math.ceil(retryAfterSeconds / 60)} minute${retryAfterSeconds > 60 ? 's' : ''})` : m;
}
